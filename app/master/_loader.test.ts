import { describe, it, expect } from "vitest";
import { ACCEPTED_FILES, UnsupportedAudioError, isWavName, loadAudioFile } from "./_loader";
import { encodeWav } from "@/lib/audio-io/wav";

const SR = 48000;

function wavFile(name: string, channels: Float32Array[], bitDepth: 16 | 24 | 32 = 16): File {
  const bytes = encodeWav(channels, SR, bitDepth);
  return new File([bytes], name, { type: "audio/wav" });
}

const tone = (n: number, amp = 0.5) => {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.sin((2 * Math.PI * 440 * i) / SR) * amp;
  return out;
};

describe("loading WAV needs no AudioContext", () => {
  // The reason this route exists: a file can be loaded, mastered and exported
  // before the user has pressed anything a browser requires for audio.
  const noContext = () => null;

  it("reads a stereo file", async () => {
    const loaded = await loadAudioFile(wavFile("mix.wav", [tone(2400), tone(2400, 0.25)]), noContext);
    expect(loaded.via).toBe("wav");
    expect(loaded.sampleRate).toBe(SR);
    expect(loaded.left.length).toBe(2400);
    expect(loaded.seconds).toBeCloseTo(2400 / SR, 6);
    expect(loaded.bitDepth).toBe(16);
  });

  it("duplicates a mono file rather than leaving one side silent", async () => {
    const loaded = await loadAudioFile(wavFile("mono.wav", [tone(800)]), noContext);
    expect(Array.from(loaded.left)).toEqual(Array.from(loaded.right));
  });

  it("reads 24-bit and 32-bit float", async () => {
    for (const depth of [24, 32] as const) {
      const loaded = await loadAudioFile(wavFile(`m.wav`, [tone(600)], depth), noContext);
      expect(loaded.bitDepth, `${depth}-bit`).toBe(depth);
    }
  });

  it("recognises a RIFF by its bytes even when the name lies", async () => {
    // A file saved as .bin, or renamed, is still a WAV.
    const loaded = await loadAudioFile(wavFile("recording.bin", [tone(400)]), noContext);
    expect(loaded.via).toBe("wav");
  });

  it("passes a malformed WAV's error through rather than swallowing it", async () => {
    const junk = new File([new Uint8Array(200)], "broken.wav");
    await expect(loadAudioFile(junk, noContext)).rejects.toThrow(RangeError);
  });

  it("refuses a WAV with an impossible sample rate", async () => {
    const good = encodeWav([tone(400)], SR, 16);
    const bad = Uint8Array.from(good);
    new DataView(bad.buffer).setUint32(24, 0, true); // sample rate = 0
    await expect(loadAudioFile(new File([bad], "zero.wav"), () => null)).rejects.toThrow(/sample rate/);
  });
});

describe("everything else goes through the browser", () => {
  it("says what is needed rather than failing silently when there is no context", async () => {
    const mp3 = new File([new Uint8Array([0xff, 0xfb, 0x90, 0x00])], "track.mp3");
    await expect(loadAudioFile(mp3, () => null)).rejects.toThrow(UnsupportedAudioError);
  });

  it("uses decodeAudioData when a context is available", async () => {
    const decoded = {
      sampleRate: 44100,
      duration: 0.5,
      numberOfChannels: 2,
      getChannelData: (c: number) => tone(22050, c === 0 ? 0.5 : 0.25),
    };
    const ctx = {
      decodeAudioData: async () => decoded as unknown as AudioBuffer,
    } as unknown as BaseAudioContext;

    const loaded = await loadAudioFile(new File([new Uint8Array(8)], "track.mp3"), () => ctx);
    expect(loaded.via).toBe("browser");
    expect(loaded.sampleRate).toBe(44100);
    expect(loaded.bitDepth).toBeUndefined();
  });

  it("reports a decode failure with the filename", async () => {
    const ctx = {
      decodeAudioData: async () => {
        throw new Error("nope");
      },
    } as unknown as BaseAudioContext;
    await expect(loadAudioFile(new File([new Uint8Array(8)], "weird.m4a"), () => ctx)).rejects.toThrow(
      /weird\.m4a/
    );
  });

  it("rejects a decoded buffer with an impossible rate", async () => {
    const ctx = {
      decodeAudioData: async () =>
        ({
          sampleRate: 0,
          duration: 1,
          numberOfChannels: 1,
          getChannelData: () => tone(10),
        }) as unknown as AudioBuffer,
    } as unknown as BaseAudioContext;
    await expect(loadAudioFile(new File([new Uint8Array(8)], "odd.ogg"), () => ctx)).rejects.toThrow(
      UnsupportedAudioError
    );
  });
});

describe("what the file picker offers", () => {
  it("names the formats worth naming and still allows any audio", () => {
    for (const ext of [".wav", ".mp3", ".flac", ".m4a"]) expect(ACCEPTED_FILES).toContain(ext);
    expect(ACCEPTED_FILES).toContain("audio/*");
  });

  it("knows a wav name when it sees one", () => {
    expect(isWavName("a.WAV")).toBe(true);
    expect(isWavName("a.wave")).toBe(true);
    expect(isWavName("a.mp3")).toBe(false);
  });
});

describe("damaged files", () => {
  it("reports the samples it had to repair", async () => {
    // Not silently: a float file can carry a NaN and one is enough to leave
    // every later sample NaN, so the page says the file was damaged rather
    // than pretending it was fine.
    const broken = new Float32Array([0.5, Number.NaN, -0.3, Infinity]);
    const loaded = await loadAudioFile(wavFile("broken.wav", [broken], 32), () => null);
    expect(loaded.repairedSamples).toBe(2);
    expect(loaded.left[1]).toBe(0);
    expect(loaded.left[3]).toBe(0);
  });

  it("reports zero for a clean file", async () => {
    const loaded = await loadAudioFile(wavFile("clean.wav", [tone(400)]), () => null);
    expect(loaded.repairedSamples).toBe(0);
  });

  it("repairs what the browser's own decoder hands back", async () => {
    const bad = new Float32Array([0.2, Number.NaN, 0.4]);
    const ctx = {
      decodeAudioData: async () =>
        ({
          sampleRate: 48000,
          duration: 3 / 48000,
          numberOfChannels: 1,
          getChannelData: () => bad,
        }) as unknown as AudioBuffer,
    } as unknown as BaseAudioContext;
    const loaded = await loadAudioFile(new File([new Uint8Array(8)], "t.mp3"), () => ctx);
    expect(loaded.repairedSamples).toBeGreaterThan(0);
    expect(Number.isFinite(loaded.left[1])).toBe(true);
  });
});
