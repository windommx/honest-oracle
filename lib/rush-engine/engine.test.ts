import { describe, it, expect } from "vitest";
import {
  BOOK_TYPES,
  MODULE_CATALOG,
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
import { TH_GROUP_LABEL, TH_META, TH_MODULES } from "./th";

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

  it("always emits all core beats — even a short novel gets a climax + peak there", () => {
    for (const chapters of [6, 7, 8, 10]) {
      const arch = buildArchitecture(cfg({ type: "novel", chapters }));
      const beats = arch.chapters.map((c) => c.sceneType);
      for (const beat of ["opening", "midpoint", "dark_moment", "climax", "resolution"]) {
        expect(beats).toContain(beat);
      }
      const climax = arch.chapters.find((c) => c.sceneType === "climax")!;
      const maxTension = Math.max(...arch.chapters.map((c) => c.tensionLevel ?? 0));
      expect(climax.tensionLevel).toBe(maxTension); // tension peaks AT the climax
    }
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

  it("does not mandate a citation quota with no sources (would induce fabrication)", () => {
    const ctx = buildGlobalContext(cfg({ type: "nonfiction" }));
    expect(ctx).not.toMatch(/2 citations per claim|≥ 2 citations/);
    expect(ctx).toContain("[VERIFY]"); // mark for real citation later instead
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

  it("injects per-chapter outline beats and the story bible", () => {
    const pack = generateAllPrompts(cfg({ outline: "1. the body in the mist\n3. the twist", storyBible: "CHARACTERS: Mali (detective)" }));
    const ch1 = pack.find((p) => p.id === "CH_1")!;
    const ch3 = pack.find((p) => p.id === "CH_3")!;
    expect(ch1.prompt).toContain("PLANNED BEAT — Chapter 1");
    expect(ch1.prompt).toContain("the body in the mist");
    expect(ch3.prompt).toContain("the twist"); // chapter 3's own beat, not chapter 1's
    expect(ch3.prompt).toContain("Mali (detective)"); // story bible — injected in every chapter
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
    craft: 14,
    nonfiction: 5,
    prose: 4,
    thai: 1,
    dialect: 3,
    marketing: 5,
    advanced: 4,
    agents: 6,
    nis: 8,
    saga: 4,
  };

  it("appends exactly the modules for each requested group", () => {
    const base = generateAllPrompts(cfg()).length;
    for (const g of MODULE_GROUPS.map((m) => m.key)) {
      const pack = generateAllPrompts(cfg(), [g]);
      expect(pack.length).toBe(base + counts[g]);
      expect(pack.filter((p) => p.group === g).length).toBe(counts[g]);
    }
  });

  it("includes all 54 optional modules when every group is on", () => {
    const all = MODULE_GROUPS.map((m) => m.key);
    const pack = generateAllPrompts(cfg(), all);
    expect(pack.filter((p) => p.group !== "core").length).toBe(54);
  });

  it("saga group plans long-form 3–9 seasons with cross-season continuity", () => {
    const pack = generateAllPrompts(cfg({ type: "novel" }), ["saga"]);
    const ids = pack.filter((p) => p.group === "saga").map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(["SAGA_ARCHITECT", "SAGA_SEASON", "SAGA_CONTINUITY", "SAGA_BRIDGE"]));
    const arch = pack.find((p) => p.id === "SAGA_ARCHITECT")!;
    expect(arch.prompt).toMatch(/3.?9 season/i);
    expect(pack.find((p) => p.id === "SAGA_CONTINUITY")!.prompt).toContain("<<<SAGA STATE>>>");
  });

  it("hardens the KDP module with a verification checklist (no live-data claim)", () => {
    const kdp = generateAllPrompts(cfg(), ["marketing"]).find((p) => p.id === "KDP_META")!;
    expect(kdp.prompt).toContain("VERIFICATION CHECKLIST");
    expect(kdp.prompt).toMatch(/cannot see live Amazon data/i);
  });

  it("ships clean dialect glossaries (no corruption, correct Southern negator)", () => {
    const pack = generateAllPrompts(cfg(), ["dialect"]);
    const south = pack.find((p) => p.id === "DIALECT_SOUTH")!;
    const north = pack.find((p) => p.id === "DIALECT_NORTH")!;
    expect(south.prompt).not.toContain("them"); // no spliced English word
    expect(south.prompt).not.toContain("กิน → กิน"); // no no-op entry
    expect(south.prompt).toContain("หม้าย"); // genuine Southern negator
    expect(north.prompt).not.toMatch(/ไd|จะไd/); // no stray ASCII letter in Thai
    expect(north.prompt).toContain("จะใด");
  });

  it("dialect modules convert to a regional voice with a glossary", () => {
    const pack = generateAllPrompts(cfg(), ["dialect"]);
    const ids = pack.filter((p) => p.group === "dialect").map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(["DIALECT_ISAN", "DIALECT_NORTH", "DIALECT_SOUTH"]));
    const isan = pack.find((p) => p.id === "DIALECT_ISAN")!;
    expect(isan.prompt).toContain("อีสาน");
    expect(isan.prompt).toContain("glossary");
  });

  it("cover-art module outputs ready image prompts for two concepts", () => {
    const cover = generateAllPrompts(cfg(), ["marketing"]).find((p) => p.id === "COVER_ART")!;
    expect(cover.prompt).toContain("MIDJOURNEY");
    expect(cover.prompt).toMatch(/2 แบบ|×2/);
    expect(cover.prompt).toMatch(/ไม่ได้เจนรูปเอง|NEGATIVE/);
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

// ── Catalog integrity guards (prevent drift / duplicates) ──────

describe("catalog integrity", () => {
  it("has no duplicate module ids", () => {
    const ids = MODULE_CATALOG.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every module has a Thai builder (TH_MODULES) — no silent English fallback", () => {
    const missing = MODULE_CATALOG.filter((m) => !TH_MODULES[m.id]).map((m) => m.id);
    expect(missing).toEqual([]);
  });

  it("every module has Thai card metadata (TH_META)", () => {
    const missing = MODULE_CATALOG.filter((m) => !TH_META[m.id]).map((m) => m.id);
    expect(missing).toEqual([]);
  });

  it("every catalog group is declared in MODULE_GROUPS and vice versa", () => {
    const declared = new Set(MODULE_GROUPS.map((g) => g.key));
    const used = new Set(MODULE_CATALOG.map((m) => m.group));
    expect(Array.from(used).filter((g) => !declared.has(g as never))).toEqual([]);
    expect(Array.from(declared).filter((g) => !used.has(g))).toEqual([]);
  });

  it("every module has non-empty name/description/usage and a builder", () => {
    for (const m of MODULE_CATALOG) {
      expect(m.name).toBeTruthy();
      expect(m.description).toBeTruthy();
      expect(m.usage).toBeTruthy();
      expect(typeof m.build).toBe("function");
    }
  });

  it("Thai builders all produce Thai text", () => {
    const c: BookConfig = cfg({ language: "thai", promptLanguage: "th" });
    for (const m of MODULE_CATALOG) {
      expect(/[฀-๿]/.test(TH_MODULES[m.id](c))).toBe(true);
    }
  });

  it("every declared group has a Thai label (no silent raw-key fallback in the UI)", () => {
    const missing = MODULE_GROUPS.map((g) => g.key).filter((k) => !TH_GROUP_LABEL[k]);
    expect(missing).toEqual([]);
  });
});
