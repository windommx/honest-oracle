import { describe, it, expect } from "vitest";
import { ANALYSIS_TASKS, type AnalysisTaskName } from "./_analysis-tasks";

// The registry is the worker contract: every task must be deterministic (same
// input → same output, or the worker/fallback split would give different users
// different reports) and structured-cloneable (postMessage would throw on
// functions or class instances).

const TH = "บทที่ 1\n\nอนันต์เดินเข้าไปในห้องมืด เขาได้ยินเสียงหายใจ เขาได้ยินเสียงหายใจ มาลีรออยู่ตรงประตูพร้อมกุญแจทองคำ\n\nบทที่ 2\n\nอนันต์เดินเข้าไปในห้องมืด เขาได้ยินเสียงหายใจ ที่นี่ไม่มีใครพูดความจริง";
const EN = "Chapter 1\n\nThe detective walked into the dark room. He heard breathing behind the door. He heard breathing behind the door.\n\nChapter 2\n\nShe waited by the gate with the golden key. Nobody here tells the truth.";

const CALLS: { [K in AnalysisTaskName]: Parameters<(typeof ANALYSIS_TASKS)[K]> } = {
  analyzeThai: [TH],
  thaiDeltas: [TH, TH + " เพิ่มประโยคใหม่อีกหนึ่ง"],
  scanThai: [TH],
  analyzeProse: [EN],
  proseDeltas: [EN, EN + " One more sentence lands."],
  scanProse: [EN],
  restatements: [TH, "th"],
  openers: [EN, "en"],
};

describe("analysis task registry (worker contract)", () => {
  for (const name of Object.keys(CALLS) as AnalysisTaskName[]) {
    it(`${name} is deterministic and structured-cloneable`, () => {
      const fn = ANALYSIS_TASKS[name] as (...a: unknown[]) => unknown;
      const args = CALLS[name] as unknown[];
      const first = fn(...args);
      const second = fn(...args);
      expect(second).toEqual(first); // deterministic — no Date.now/Math.random
      expect(structuredClone(first)).toEqual(first); // survives postMessage
    });
  }
});
