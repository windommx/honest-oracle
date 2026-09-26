import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { BUNDLES, buildBundle } from "../../scripts/build-worklet";
import { loadRenderWorker } from "./worker-harness";
import { renderMaster } from "./offline";
import { DEFAULT_MASTER } from "./types";
import type { RenderDoneMessage, RenderProgressMessage, RenderRequest } from "./render-worker";

const TARGET = BUNDLES.find((b) => b.outfile.includes("master-render-worker"))!;
const OUTFILE = join(process.cwd(), TARGET.outfile);
const SR = 48000;

function music(seconds: number, amp = 0.4): { left: Float32Array; right: Float32Array } {
  const n = Math.round(seconds * SR);
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const beat = Math.exp(-((t * 2) % 1) * 10);
    const v =
      Math.sin(2 * Math.PI * 55 * t) * 0.5 * beat +
      Math.sin(2 * Math.PI * 440 * t) * 0.3 +
      Math.sin(2 * Math.PI * 6000 * t) * 0.12;
    left[i] = v * amp;
    right[i] = v * 0.9 * amp;
  }
  return { left, right };
}

const request = (over: Partial<RenderRequest> = {}): RenderRequest => ({
  id: 1,
  ...music(2),
  sampleRate: SR,
  settings: DEFAULT_MASTER,
  targetLufs: -14,
  ...over,
});

describe("the render worker artifact cannot drift from its source", () => {
  it("public/master-render-worker.js exists", () => {
    expect(existsSync(OUTFILE), `${OUTFILE} is missing — run \`npm run build:worklet\``).toBe(true);
  });

  it("matches a fresh bundle of lib/master-engine", async () => {
    const committed = readFileSync(OUTFILE, "utf8");
    const fresh = await buildBundle(false, TARGET);
    expect(committed, "public/master-render-worker.js is stale — run `npm run build:worklet`").toBe(
      fresh
    );
  }, 30_000);

  it("is a self-contained script with no imports left in it", () => {
    const code = readFileSync(OUTFILE, "utf8");
    expect(code).not.toMatch(/^\s*import\s/m);
    expect(code).not.toMatch(/^\s*export\s/m);
    expect(code).not.toMatch(/\brequire\(/);
  });

  it("carries the engine itself, not a reference to it", () => {
    const code = readFileSync(OUTFILE, "utf8");
    for (const marker of ["MasterChain", "auditMaster", "LoudnessMeter", "MultibandCompressor"]) {
      expect(code, `bundle is missing ${marker}`).toContain(marker);
    }
  });

  it("does not drag the UI in with it", () => {
    // An accidental import of anything React-shaped would both bloat the
    // worker and fail at run time, since there is no DOM in that realm.
    const code = readFileSync(OUTFILE, "utf8");
    expect(code).not.toContain("react");
    expect(code).not.toMatch(/\bdocument\.createElement\b/);
  });
});

describe("the bundle actually renders, in the harness", () => {
  it("installs a message handler", () => {
    expect(() => loadRenderWorker(OUTFILE)).not.toThrow();
  });

  it("produces the same audio as calling renderMaster directly", () => {
    // The point of the whole exercise: moving the work to another thread must
    // not change one sample of it.
    const w = loadRenderWorker(OUTFILE);
    const input = music(2);
    w.send(request({ ...input }));
    const done = w.replies.find((r) => r.kind === "done") as RenderDoneMessage;
    expect(done, "the worker never finished").toBeTruthy();

    const direct = renderMaster({ ...input, sampleRate: SR, settings: DEFAULT_MASTER, targetLufs: -14 });
    expect(Array.from(done.left)).toEqual(Array.from(direct.left));
    expect(Array.from(done.right)).toEqual(Array.from(direct.right));
    expect(done.integratedLufs).toBe(direct.integratedLufs);
    expect(done.truePeakDb).toBe(direct.truePeakDb);
    expect(done.audit.severity).toBe(direct.audit.severity);
    expect(done.audit.findings.map((f) => f.id)).toEqual(direct.audit.findings.map((f) => f.id));
  });

  it("reports progress on the way, and finishes after it", () => {
    const w = loadRenderWorker(OUTFILE);
    w.send(request({ ...music(6) }));
    const kinds = w.replies.map((r) => r.kind);
    const progress = w.replies.filter((r) => r.kind === "progress") as RenderProgressMessage[];
    expect(progress.length).toBeGreaterThan(2);
    expect(kinds.lastIndexOf("progress")).toBeLessThan(kinds.indexOf("done"));
    for (let i = 1; i < progress.length; i++) {
      if (progress[i].phase === progress[i - 1].phase) {
        expect(progress[i].fraction).toBeGreaterThanOrEqual(progress[i - 1].fraction);
      }
    }
    expect(progress[progress.length - 1]).toMatchObject({ phase: "measure", fraction: 1 });
  });

  it("does not flood the main thread with one message per chunk", () => {
    // Every progress message is a structured clone and a wake-up on the
    // thread the worker exists to keep free. Capped at a whole percent per
    // phase, plus the two endpoints of each.
    const w = loadRenderWorker(OUTFILE);
    w.send(request({ ...music(20) }));
    const progress = w.replies.filter((r) => r.kind === "progress");
    expect(progress.length).toBeLessThanOrEqual(104);
  });

  it("tags every reply with the id it was asked under", () => {
    // The client throws away anything that is not the job it is waiting for;
    // without this a superseded render would overwrite a newer one.
    const w = loadRenderWorker(OUTFILE);
    w.send(request({ id: 77 }));
    for (const reply of w.replies) expect(reply.id).toBe(77);
  });

  it("transfers the result rather than copying it", () => {
    const w = loadRenderWorker(OUTFILE);
    w.send(request());
    const at = w.replies.findIndex((r) => r.kind === "done");
    expect(w.transferred[at].length, "the render was cloned, not transferred").toBe(2);
  });

  it("reports the engine's own refusals as refusals, with their reason", () => {
    const w = loadRenderWorker(OUTFILE);
    w.send(request({ sampleRate: 3 }));
    const error = w.replies.find((r) => r.kind === "error");
    expect(error).toMatchObject({ kind: "error", expected: true });
    expect((error as { message: string }).message).toContain("3");
  });

  it("survives a second request on the same worker", () => {
    // One worker per job is what the client does, but a worker that could
    // only ever answer once would be a trap for the next person who reuses it.
    const w = loadRenderWorker(OUTFILE);
    w.send(request({ id: 1, ...music(0.5) }));
    w.send(request({ id: 2, ...music(0.5) }));
    const done = w.replies.filter((r) => r.kind === "done") as RenderDoneMessage[];
    expect(done.map((d) => d.id)).toEqual([1, 2]);
    expect(Array.from(done[0].left)).toEqual(Array.from(done[1].left));
  });
});
