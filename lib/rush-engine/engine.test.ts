import { describe, it, expect } from "vitest";
import {
  BOOK_TYPES,
  MODULE_GROUPS,
  buildArchitecture,
  buildGlobalContext,
  defaultGroupsFor,
  generateAllPrompts,
  generateChapterPrompt,
  type BookConfig,
  type BookTypeKey,
  type PromptGroup,
} from "./engine";

function cfg(overrides: Partial<BookConfig> = {}): BookConfig {
  return {
    type: "novel",
    title: "The Test Book",
    thesis: "A premise worth testing",
    reader: "QA engineers",
    voice: "storytelling",
    chapters: 12,
    wordsPerChapter: 3000,
    subGenre: "thriller",
    citationStyle: "none",
    language: "english",
    ...overrides,
  };
}

const ALL_TYPES = Object.keys(BOOK_TYPES) as BookTypeKey[];

// ── Registry ───────────────────────────────────────────────────

describe("BOOK_TYPES registry", () => {
  it("has 8 book types, each well-formed", () => {
    expect(ALL_TYPES).toHaveLength(8);
    for (const t of ALL_TYPES) {
      const bt = BOOK_TYPES[t];
      expect(bt.label).toBeTruthy();
      expect(bt.sub_genres.length).toBeGreaterThan(0);
      expect(bt.default_chapters).toBeGreaterThan(0);
      expect(bt.pipeline_stages.length).toBeGreaterThan(0);
    }
  });
});

// ── Architecture ───────────────────────────────────────────────

describe("buildArchitecture", () => {
  it("produces the requested number of chapters for every type", () => {
    for (const t of ALL_TYPES) {
      const arch = buildArchitecture(cfg({ type: t, chapters: 10, subGenre: BOOK_TYPES[t].sub_genres[0] }));
      expect(arch.chapters).toHaveLength(10);
      expect(arch.parts.length).toBeGreaterThan(0);
      arch.chapters.forEach((c, i) => expect(c.number).toBe(i + 1));
    }
  });

  it("maps novel scene types to the right beats", () => {
    const arch = buildArchitecture(cfg({ type: "novel", chapters: 12 }));
    const sceneAt = (n: number) => arch.chapters[n - 1].sceneType;
    expect(sceneAt(1)).toBe("opening");
    expect(sceneAt(4)).toBe("turning_point"); // act1End(3)+1
    expect(sceneAt(6)).toBe("midpoint"); // act2Mid
    expect(sceneAt(11)).toBe("climax"); // ch-1
    expect(sceneAt(12)).toBe("resolution"); // last
  });

  it("keeps tension within [0,1] and escalating toward the climax", () => {
    const arch = buildArchitecture(cfg({ type: "novel", chapters: 20 }));
    for (const c of arch.chapters) {
      expect(c.tensionLevel).toBeGreaterThanOrEqual(0);
      expect(c.tensionLevel).toBeLessThanOrEqual(1);
    }
    const first = arch.chapters[0].tensionLevel ?? 0;
    const climax = arch.chapters[18].tensionLevel ?? 0; // ch-1
    expect(climax).toBeGreaterThan(first);
  });

  it("cycles nonfiction chapter types and assigns purposes", () => {
    const arch = buildArchitecture(cfg({ type: "nonfiction", chapters: 8, subGenre: "business" }));
    expect(arch.chapters[0].type).toBe("introduction");
    arch.chapters.forEach((c) => expect(c.purpose).toBeTruthy());
  });

  it("handles the single-chapter edge case without throwing", () => {
    const arch = buildArchitecture(cfg({ chapters: 1 }));
    expect(arch.chapters).toHaveLength(1);
    expect(arch.chapters[0].sceneType).toBe("opening");
  });

  it("is deterministic (cookbook recipe counts are fixed, not random)", () => {
    const a = buildArchitecture(cfg({ type: "cookbook", chapters: 6, subGenre: "thai_cuisine" }));
    const b = buildArchitecture(cfg({ type: "cookbook", chapters: 6, subGenre: "thai_cuisine" }));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

// ── Global context ─────────────────────────────────────────────

describe("buildGlobalContext", () => {
  it("includes the title, thesis, and quality standards", () => {
    const ctx = buildGlobalContext(cfg());
    expect(ctx).toContain("The Test Book");
    expect(ctx).toContain("A premise worth testing");
    expect(ctx).toContain("QUALITY STANDARDS");
  });
});

// ── Prompt pack ────────────────────────────────────────────────

describe("generateAllPrompts — core", () => {
  it("returns 7 fixed prompts + one per chapter", () => {
    const pack = generateAllPrompts(cfg({ chapters: 12 }));
    expect(pack).toHaveLength(19); // MASTER, OVERVIEW, 12 chapters, ANALYSIS, REVISION, FRONT, BACK, FEEDBACK
    const ids = pack.map((p) => p.id);
    for (const id of ["MASTER", "OVERVIEW", "CH_1", "CH_12", "ANALYSIS", "REVISION", "FRONT_MATTER", "BACK_MATTER", "FEEDBACK"]) {
      expect(ids).toContain(id);
    }
    expect(pack.every((p) => p.group === "core")).toBe(true);
  });

  it("bakes the continuity protocol into the master prompt and softens imperatives", () => {
    const master = generateAllPrompts(cfg()).find((p) => p.id === "MASTER")!;
    expect(master.prompt).toContain("<<<STATE>>>");
    expect(master.prompt).toContain("CONTINUITY PROTOCOL");
    expect(master.prompt).not.toContain("MANDATORY");
  });

  it("threads premise + STATE output into every chapter prompt", () => {
    const pack = generateAllPrompts(cfg());
    const ch5 = pack.find((p) => p.id === "CH_5")!;
    expect(ch5.prompt).toContain("PREMISE:");
    expect(ch5.prompt).toContain("<<<STATE>>>");
  });

  it("injects an outline and a story bible when provided", () => {
    const pack = generateAllPrompts(cfg({ outline: "Ch1: the body in the mist", storyBible: "CHARACTERS: Mali (detective)" }));
    const ch3 = pack.find((p) => p.id === "CH_3")!;
    expect(ch3.prompt).toContain("PLANNED BEATS");
    expect(ch3.prompt).toContain("Mali (detective)");
    expect(ch3.prompt).toContain("source of truth");
  });

  it("is deterministic across calls", () => {
    const groups: Exclude<PromptGroup, "core">[] = ["craft", "marketing"];
    const a = generateAllPrompts(cfg(), groups);
    const b = generateAllPrompts(cfg(), groups);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

// ── Modules ────────────────────────────────────────────────────

describe("generateAllPrompts — module groups", () => {
  const counts: Record<Exclude<PromptGroup, "core">, number> = {
    craft: 6,
    nonfiction: 5,
    prose: 4,
    thai: 1,
    marketing: 4,
    advanced: 2,
  };

  it("appends exactly the modules for each requested group", () => {
    const base = generateAllPrompts(cfg()).length;
    for (const g of MODULE_GROUPS.map((m) => m.key)) {
      const pack = generateAllPrompts(cfg(), [g]);
      expect(pack.length).toBe(base + counts[g]);
      expect(pack.filter((p) => p.group === g).length).toBe(counts[g]);
    }
  });

  it("includes all 22 optional modules when every group is on", () => {
    const all = MODULE_GROUPS.map((m) => m.key);
    const pack = generateAllPrompts(cfg(), all);
    expect(pack.filter((p) => p.group !== "core").length).toBe(22);
  });

  it("hardens the KDP module with a verification checklist (no live-data claim)", () => {
    const kdp = generateAllPrompts(cfg(), ["marketing"]).find((p) => p.id === "KDP_META")!;
    expect(kdp.prompt).toContain("VERIFICATION CHECKLIST");
    expect(kdp.prompt).toMatch(/cannot see live Amazon data/i);
  });

  it("defaults to sensible groups per book type", () => {
    expect(defaultGroupsFor("novel")).toContain("craft");
    expect(defaultGroupsFor("nonfiction")).toContain("nonfiction");
    expect(defaultGroupsFor("nonfiction")).not.toContain("craft");
  });
});

// ── Thai mode ──────────────────────────────────────────────────

describe("Thai prompt mode", () => {
  const THAI = /[฀-๿]/;

  it("produces native Thai core prompts (no English scaffolding, no regex artifacts)", () => {
    const pack = generateAllPrompts(cfg({ language: "thai", promptLanguage: "th" }), ["craft", "marketing"]);
    const master = pack.find((p) => p.id === "MASTER")!;
    expect(master.prompt.startsWith("คุณคือนักเขียน")).toBe(true);
    expect(master.prompt).toContain("รูปแบบผลลัพธ์"); // OUTPUT FORMAT in Thai
    expect(master.prompt).toContain("<<<STATE>>>"); // continuity protocol preserved
    expect(master.prompt).not.toContain("OUTPUT FORMAT");

    const ch = pack.find((p) => p.id === "CH_3")!;
    expect(ch.prompt).toContain("พรอมป์ตเขียนบทที่ 3");
    expect(ch.prompt).toContain("เป้าหมายความยาว");
  });

  it("translates module bodies to Thai too (ไทยทั้งชุด)", () => {
    const pack = generateAllPrompts(cfg({ promptLanguage: "th" }), ["craft", "marketing", "advanced"]);
    for (const id of ["STRUCTURE", "VOICE_SHEET", "KDP_META", "BRAINSTORM"]) {
      const m = pack.find((p) => p.id === id)!;
      expect(THAI.test(m.prompt)).toBe(true);
    }
  });

  it("localizes chapter purpose + card metadata (no English architecture labels leak)", () => {
    const pack = generateAllPrompts(cfg({ promptLanguage: "th", chapters: 12 }), []);
    const ch6 = pack.find((p) => p.id === "CH_6")!; // midpoint
    expect(ch6.prompt).toContain("จุดกึ่งกลาง");
    expect(ch6.prompt).not.toContain("MIDPOINT");
    expect(THAI.test(ch6.description)).toBe(true); // localized card description
    expect(ch6.usage).toContain("ส่งเพื่อเขียนบทที่ 6");
    const master = pack.find((p) => p.id === "MASTER")!;
    expect(master.description).toBe("system prompt หลักสำหรับทุกเซสชัน");
  });

  it("leaves English scaffolding intact when promptLanguage is en", () => {
    const master = generateAllPrompts(cfg({ promptLanguage: "en" })).find((p) => p.id === "MASTER")!;
    expect(master.prompt).toContain("OUTPUT FORMAT");
    expect(master.prompt.startsWith("คุณคือนักเขียน")).toBe(false);
  });
});

// ── Chapter prompt direct ──────────────────────────────────────

describe("generateChapterPrompt", () => {
  it("omits previous-chapter context for chapter 1 and includes it later", () => {
    const arch = buildArchitecture(cfg());
    const first = generateChapterPrompt(cfg(), arch, 0);
    const third = generateChapterPrompt(cfg(), arch, 2);
    expect(first).not.toContain("PREVIOUS CHAPTER");
    expect(third).toContain("PREVIOUS CHAPTER");
  });
});

// ── Snapshots (regression guard) ───────────────────────────────

describe("snapshots", () => {
  it("novel pack with craft + marketing", () => {
    expect(generateAllPrompts(cfg({ chapters: 6 }), ["craft", "marketing"])).toMatchSnapshot();
  });

  it("nonfiction pack with nonfiction + prose", () => {
    const c = cfg({ type: "nonfiction", subGenre: "self_help", chapters: 6, language: "thai" });
    expect(generateAllPrompts(c, ["nonfiction", "prose"])).toMatchSnapshot();
  });

  it("native Thai novel pack with craft", () => {
    const c = cfg({ type: "novel", chapters: 6, language: "thai", promptLanguage: "th" });
    expect(generateAllPrompts(c, ["craft"])).toMatchSnapshot();
  });

  it("how-to pack with nonfiction modules", () => {
    const c = cfg({ type: "howto", subGenre: "diy", chapters: 6 });
    expect(generateAllPrompts(c, ["nonfiction"])).toMatchSnapshot();
  });
});
