import { describe, it, expect } from "vitest";
import { STARTER_SEQUENCE, STARTER_GROUPS } from "./starter";
import { MODULE_CATALOG } from "./modules";
import { generateAllPrompts } from "./engine";
import type { BookConfig } from "./types";

const CORE_IDS = new Set(["MASTER", "OVERVIEW", "ANALYSIS", "REVISION", "FRONT_MATTER", "BACK_MATTER", "FEEDBACK"]);
const moduleIds = new Set(MODULE_CATALOG.map((m) => m.id));

describe("STARTER_SEQUENCE", () => {
  it("is numbered 1..N in order", () => {
    STARTER_SEQUENCE.forEach((s, i) => expect(s.n).toBe(i + 1));
  });

  it("references only prompt IDs the engine can produce", () => {
    for (const step of STARTER_SEQUENCE) {
      for (const id of step.promptIds) {
        const ok = CORE_IDS.has(id) || moduleIds.has(id) || /^CH_\d+$/.test(id);
        expect(ok, `unknown prompt id ${id} in step ${step.key}`).toBe(true);
      }
    }
  });

  it("every non-core module a step references is in that step's declared group", () => {
    // Do NOT skip steps whose group is null — that skip is exactly what hid the bug where
    // step 2 declared group:null while referencing BRAINSTORM (group "advanced"), so a writer
    // following the step enabled nothing and never got BRAINSTORM. A non-core module obliges
    // the step to name its group.
    for (const step of STARTER_SEQUENCE) {
      for (const id of step.promptIds) {
        if (CORE_IDS.has(id) || /^CH_\d+$/.test(id)) continue;
        const m = MODULE_CATALOG.find((x) => x.id === id);
        expect(m?.group, `${id} (group ${m?.group}) not covered by step ${step.key}'s group ${step.group}`).toBe(step.group);
      }
    }
  });

  it("following any single step in isolation produces every prompt that step promises", () => {
    // The per-step contract: enable just this step's group and its promptIds must all appear.
    // Before the fix, following step 2 alone yielded OVERVIEW but silently dropped BRAINSTORM.
    const base = {
      title: "ทดสอบ", thesis: "เรื่องทดสอบ", type: "novel", subGenre: "romance",
      reader: "ผู้ใหญ่", voice: "อบอุ่น", chapters: 3, wordsPerChapter: 1000,
      citationStyle: "none", language: "thai", promptLanguage: "th",
    } as unknown as BookConfig;
    for (const step of STARTER_SEQUENCE) {
      const groups = step.group ? [step.group] : [];
      const ids = new Set(generateAllPrompts(base, groups as never[]).map((p) => p.id));
      for (const id of step.promptIds) {
        expect(ids.has(id), `step ${step.key}: ${id} missing when only group ${step.group} is enabled`).toBe(true);
      }
    }
  });

  it("enabling STARTER_GROUPS makes every starter module appear in the pack", () => {
    const cfg: BookConfig = {
      title: "ทดสอบ", thesis: "เรื่องทดสอบ", type: "novel", subGenre: "romance",
      chapters: 3, wordsPerChapter: 1000, language: "thai", promptLanguage: "th",
    } as unknown as BookConfig;
    const pack = generateAllPrompts(cfg, STARTER_GROUPS as never[]);
    const ids = new Set(pack.map((p) => p.id));
    for (const step of STARTER_SEQUENCE) {
      for (const id of step.promptIds) {
        if (id === "CH_1") continue; // present only when chapters ≥ 1 (it is here)
        expect(ids.has(id), `${id} missing from pack`).toBe(true);
      }
    }
    expect(ids.has("CH_1")).toBe(true);
  });
});
