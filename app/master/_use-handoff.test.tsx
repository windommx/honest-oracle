// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { StrictMode } from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { useIncomingHandoff } from "./_use-handoff";
import { clearHandoff, peekHandoff, putHandoff, type AudioHandoff } from "@/lib/audio-io/handoff";

const SR = 48000;

const audio = () => {
  const n = 480;
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    left[i] = Math.sin((2 * Math.PI * 220 * i) / SR) * 0.3;
    right[i] = left[i] * 0.8;
  }
  return { left, right };
};

const send = (name = "loop.wav") =>
  putHandoff({ from: "SynthPro", name, ...audio(), sampleRate: SR });

function Receiver({ onReceive }: { onReceive: (h: AudioHandoff) => void }) {
  useIncomingHandoff(onReceive);
  return <div>ready</div>;
}

beforeEach(async () => {
  await clearHandoff();
});

describe("receiving a handoff", () => {
  it("delivers what was sent", async () => {
    const input = audio();
    await putHandoff({ from: "SynthPro", name: "loop.wav", ...input, sampleRate: SR });
    const onReceive = vi.fn();
    render(<Receiver onReceive={onReceive} />);
    await waitFor(() => expect(onReceive).toHaveBeenCalled());
    const got = onReceive.mock.calls[0][0] as AudioHandoff;
    expect(got.name).toBe("loop.wav");
    expect(got.from).toBe("SynthPro");
    expect(Array.from(got.left)).toEqual(Array.from(input.left));
  });

  it("does not fire when nothing is waiting", async () => {
    const onReceive = vi.fn();
    render(<Receiver onReceive={onReceive} />);
    await new Promise((r) => setTimeout(r, 60));
    expect(onReceive).not.toHaveBeenCalled();
  });

  it("consumes it, so a later mount gets nothing", async () => {
    await send();
    const first = vi.fn();
    render(<Receiver onReceive={first} />);
    await waitFor(() => expect(first).toHaveBeenCalled());

    const second = vi.fn();
    render(<Receiver onReceive={second} />);
    await new Promise((r) => setTimeout(r, 60));
    expect(second).not.toHaveBeenCalled();
  });
});

describe("under StrictMode, where the effect runs twice", () => {
  // The bug this file exists for. Taking a handoff DELETES it, so a
  // destructive read inside an effect has to survive the effect running more
  // than once. The version with a `cancelled` flag set by the cleanup loses
  // the audio outright: the first read takes the row and deletes it, the
  // cleanup sets cancelled, the payload is dropped, and the second read finds
  // an empty slot. In a browser that showed as MasterPro opening with no file
  // loaded and the row already gone from IndexedDB — unrecoverable.

  it("still delivers the audio", async () => {
    await send("strict.wav");
    const onReceive = vi.fn();
    render(
      <StrictMode>
        <Receiver onReceive={onReceive} />
      </StrictMode>
    );
    await waitFor(() => expect(onReceive).toHaveBeenCalled());
    expect((onReceive.mock.calls[0][0] as AudioHandoff).name).toBe("strict.wav");
  });

  it("delivers it exactly once, not twice", async () => {
    await send();
    const onReceive = vi.fn();
    render(
      <StrictMode>
        <Receiver onReceive={onReceive} />
      </StrictMode>
    );
    await waitFor(() => expect(onReceive).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 80));
    expect(onReceive).toHaveBeenCalledTimes(1);
  });

  it("leaves the slot empty afterwards", async () => {
    await send();
    const onReceive = vi.fn();
    render(
      <StrictMode>
        <Receiver onReceive={onReceive} />
      </StrictMode>
    );
    await waitFor(() => expect(onReceive).toHaveBeenCalled());
    expect(await peekHandoff()).toBe(false);
  });

  it("never deletes the audio without handing it over", async () => {
    // The precise shape of the bug: the slot empty AND nobody given the
    // buffers. Either outcome alone is fine; both together is data loss.
    await send();
    const onReceive = vi.fn();
    render(
      <StrictMode>
        <Receiver onReceive={onReceive} />
      </StrictMode>
    );
    await new Promise((r) => setTimeout(r, 120));
    const stillWaiting = await peekHandoff();
    expect(
      stillWaiting || onReceive.mock.calls.length > 0,
      "the handoff was consumed and then thrown away"
    ).toBe(true);
  });
});
