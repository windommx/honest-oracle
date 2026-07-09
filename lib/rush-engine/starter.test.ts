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

  it("every module-backed step names a group that actually holds its modules", () => {
    for (const step of STARTER_SEQUENCE) {
      if (!step.group) continue;
      for (const id of step.promptIds) {
        if (CORE_IDS.has(id) || /^CH_\d+$/.test(id)) continue;
        const m = MODULE_CATALOG.find((x) => x.id === id);
        expect(m?.group, `${id} not in group ${step.group}`).toBe(step.group);
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
