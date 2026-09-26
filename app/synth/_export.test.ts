// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { EXPORT_REPEATS, HANDOFF_SOURCE, sendPatternToMaster } from "./_export";
import { renderPattern } from "@/lib/synth-engine/offline";
import { DEFAULT_PATCH } from "@/lib/synth-engine/presets";
import { clearHandoff, takeHandoff } from "@/lib/audio-io/handoff";
import { demoPattern } from "./_pattern";

const SR = 48000;
const pattern = demoPattern();
const request = { pattern, patch: DEFAULT_PATCH, presetName: "acid", sampleRate: SR };

beforeEach(async () => {
  await clearHandoff();
});

describe("handing a pattern to MasterPro", () => {
  it("stores exactly what renderPattern produced, not a re-encoding", async () => {
    // The point of the handoff. Through a file the audio would be quantised
    // to 16 bits and decoded again; what MasterPro opens has to be the floats
    // the synth rendered, sample for sample.
    const sent = await sendPatternToMaster(request);
    expect(sent).toBeTruthy();
    const direct = renderPattern({
      pattern,
      patch: DEFAULT_PATCH,
      sampleRate: SR,
      repeats: EXPORT_REPEATS,
    });
    const got = await takeHandoff();
    expect(Array.from(got!.left)).toEqual(Array.from(direct.left));
    expect(Array.from(got!.right)).toEqual(Array.from(direct.right));
    expect(got!.sampleRate).toBe(direct.sampleRate);
  });

  it("names itself, so the master's filename says where it came from", async () => {
    const sent = await sendPatternToMaster(request);
    expect(sent!.name).toContain("synthpro");
    expect(sent!.name).toContain("acid");
    expect(sent!.name).toContain(`${Math.round(pattern.bpm)}bpm`);
    expect((await takeHandoff())!.from).toBe(HANDOFF_SOURCE);
  });

  it("reports the same length and peak the file export would", async () => {
    const sent = await sendPatternToMaster(request);
    const direct = renderPattern({
      pattern,
      patch: DEFAULT_PATCH,
      sampleRate: SR,
      repeats: EXPORT_REPEATS,
    });
    expect(sent!.seconds).toBeCloseTo(direct.seconds, 6);
    expect(sent!.peak).toBeCloseTo(direct.peak, 6);
  });

  it("resolves null rather than claiming success when nothing could be stored", async () => {
    // The caller navigates on the strength of this. A silent success here
    // lands the operator on an empty MasterPro with nothing to explain it.
    const sent = await sendPatternToMaster({ ...request, sampleRate: 3 });
    expect(sent).toBeNull();
    expect(await takeHandoff()).toBeNull();
  });

  it("a second send replaces the first", async () => {
    await sendPatternToMaster({ ...request, presetName: "first" });
    await sendPatternToMaster({ ...request, presetName: "second" });
    expect((await takeHandoff())!.name).toContain("second");
    expect(await takeHandoff()).toBeNull();
  });
});
