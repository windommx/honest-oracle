import { describe, it, expect } from "vitest";
import { parseCodex, hasCodex, codexLocal, codexDigestTh, codexLocalTh, codexDigestEn, codexAudit, codexCanon, formatCodexAudit, codexMermaid } from "./codex";
import { generateAllPrompts } from "./engine";

const BIBLE = `
[CHARACTERS]
อนันต์: นักสืบหนุ่ม กลัวความมืด
มาลี: น้องสาวอนันต์ ที่หายตัวไป
เสือ: หัวหน้าแก๊งลึกลับ

[PLACES]
กรุงเทพเก่า: ย่านที่เรื่องเกิด

[ITEMS]
กุญแจทองคำ: เปิดห้องใต้ดิน

[RELATIONS]
อนันต์ - มาลี: พี่น้อง
อนันต์ -> เสือ: ตามล่า
`;

describe("parseCodex — indexing", () => {
  it("parses entities by section into a typed graph", () => {
    const c = parseCodex(BIBLE);
    expect(c.entities.filter((e) => e.type === "character").map((e) => e.name)).toEqual(["อนันต์", "มาลี", "เสือ"]);
    expect(c.entities.find((e) => e.type === "place")!.name).toBe("กรุงเทพเก่า");
    expect(c.entities.find((e) => e.type === "item")!.desc).toBe("เปิดห้องใต้ดิน");
  });

  it("parses directed and undirected relations", () => {
    const c = parseCodex(BIBLE);
    expect(c.relations).toContainEqual({ from: "อนันต์", to: "มาลี", kind: "พี่น้อง", directed: false });
    expect(c.relations).toContainEqual({ from: "อนันต์", to: "เสือ", kind: "ตามล่า", directed: true });
  });

  it("tolerates list bullets and dedupes names", () => {
    const c = parseCodex("[CAST]\n- A: one\n- A: dup\n* B: two");
    expect(c.entities.map((e) => e.name)).toEqual(["A", "B"]);
  });

  it("returns an EMPTY graph for freeform prose with no sections (honest: no fake extraction)", () => {
    const c = parseCodex("Just some notes. Anan is a detective. He fears the dark.");
    expect(hasCodex(c)).toBe(false);
    expect(c.entities).toHaveLength(0);
  });

  it("handles undefined/empty input", () => {
    expect(hasCodex(parseCodex(undefined))).toBe(false);
    expect(hasCodex(parseCodex(""))).toBe(false);
  });
});

describe("character depth traits (declared, never inferred)", () => {
  const DEEP = `[ตัวละคร]
อนันต์: นักสืบ
อยาก: หาน้องสาวให้เจอ
ต้องการจริง: ให้อภัยตัวเอง
จุดอ่อน: กลัวความมืด
เสียง: ประโยคสั้น ห้วน
มาลี: น้องสาว`;

  it("attaches trait lines to the character above instead of declaring entities", () => {
    const c = parseCodex(DEEP);
    expect(c.entities.map((e) => e.name)).toEqual(["อนันต์", "มาลี"]); // no entity named "อยาก"
    const anan = c.entities[0];
    expect(anan.want).toBe("หาน้องสาวให้เจอ");
    expect(anan.need).toBe("ให้อภัยตัวเอง");
    expect(anan.flaw).toBe("กลัวความมืด");
    expect(anan.voice).toBe("ประโยคสั้น ห้วน");
    expect(c.entities[1].want).toBeUndefined(); // มาลี has none
  });

  it("renders depth in the digest and per-chapter local view, with a voice rule", () => {
    const c = parseCodex(DEEP);
    const digest = codexDigestTh(c);
    expect(digest).toContain("เจาะลึกตัวละคร:");
    expect(digest).toContain("อยาก: หาน้องสาวให้เจอ");
    expect(digest).toContain('ระบุ "เสียง"'); // voice-consistency rule appears
    const local = codexLocalTh(c, "บทนี้ อนันต์ ออกเดินทาง");
    expect(local).toContain("เสียง: ประโยคสั้น ห้วน");
  });

  it("no traits declared → digest byte-identical to before (snapshot safety)", () => {
    const plain = parseCodex("[ตัวละคร]\nA: x\nB: y");
    expect(codexDigestTh(plain)).not.toContain("เจาะลึกตัวละคร");
    expect(codexDigestEn(plain)).not.toContain("Character depth");
  });

  it("English trait keys work too", () => {
    const c = parseCodex("[CHARACTERS]\nAnan: detective\nwant: find his sister\nvoice: clipped sentences");
    expect(c.entities[0].want).toBe("find his sister");
    expect(codexDigestEn(c)).toContain("Character depth:");
  });
});

describe("open threads (ปมค้าง)", () => {
  const T = `[ตัวละคร]\nอนันต์: นักสืบ\n[ปมค้าง]\nความลับผลแล็บ: สูง\nอดีตของหมอลี\nศัตรูเก่าตามมา: critical`;

  it("parses threads with bilingual priorities (default medium)", () => {
    const c = parseCodex(T);
    expect(c.threads).toEqual([
      { desc: "ความลับผลแล็บ", priority: "high" },
      { desc: "อดีตของหมอลี", priority: "medium" },
      { desc: "ศัตรูเก่าตามมา", priority: "critical" },
    ]);
  });

  it("renders threads in the digest sorted by priority, with the never-drop rule", () => {
    const d = codexDigestTh(parseCodex(T));
    expect(d).toContain("ปมที่ค้าง (3):");
    expect(d.indexOf("[วิกฤต] ศัตรูเก่าตามมา")).toBeLessThan(d.indexOf("[สูง] ความลับผลแล็บ"));
    expect(d).toContain("ห้ามทิ้งเงียบ");
  });

  it("threads-only codex counts as a codex but draws no graph", () => {
    const c = parseCodex("[ปมค้าง]\nปมเดียว: ต่ำ");
    expect(hasCodex(c)).toBe(true);
    expect(codexMermaid(c)).toBe("");
  });
});

describe("status conflicts — declared dead/missing yet present", () => {
  it("flags a dead character appearing in the draft, as a signal not an error", () => {
    const c = parseCodex("[ตัวละคร]\nบุญมา: พ่อ\nสถานะ: ตายในบท 3\nอนันต์: ลูก");
    const a = codexAudit(c, "อนันต์ ฝันเห็น บุญมา ยืนอยู่ริมน้ำ", "th");
    expect(a.statusConflicts.map((e) => e.name)).toEqual(["บุญมา"]);
    const out = formatCodexAudit(a, "th");
    expect(out).toContain("สถานะขัดแย้ง");
    expect(out).toContain("ย้อนอดีต? ผี?"); // framed as a question, not a verdict
  });

  it("no flag when the dead character stays off-page or status is alive", () => {
    const c = parseCodex("[ตัวละคร]\nบุญมา: พ่อ\nสถานะ: ตายในบท 3\nอนันต์: ลูก\nสถานะ: ยังอยู่");
    expect(codexAudit(c, "อนันต์ เดินคนเดียว", "th").statusConflicts).toEqual([]);
  });

  it("digest carries an explicit status constraint for dead/missing characters", () => {
    const d = codexDigestTh(parseCodex("[ตัวละคร]\nบุญมา: พ่อ\nสถานะ: ตายในบท 3"));
    expect(d).toContain("ข้อจำกัดสถานะ:");
    expect(d).toContain("ห้ามปรากฏมีชีวิตในไทม์ไลน์ปัจจุบัน");
    // no dead characters → no constraint block
    expect(codexDigestTh(parseCodex("[ตัวละคร]\nA: x"))).not.toContain("ข้อจำกัดสถานะ");
  });
});

describe("voice guard — declared คำต้องห้าม in the draft", () => {
  const c = parseCodex("[ตัวละคร]\nธารา: หมอ\nคำติดปาก: ผมรับผิดชอบเอง\nคำต้องห้าม: ก็ตามใจ, ไม่รู้สิ");

  it("parses catchphrase + forbidden traits and renders them in depth", () => {
    expect(c.entities[0].catchphrase).toBe("ผมรับผิดชอบเอง");
    expect(c.entities[0].forbidden).toBe("ก็ตามใจ, ไม่รู้สิ");
    const d = codexDigestTh(c);
    expect(d).toContain("คำติดปาก: ผมรับผิดชอบเอง");
    expect(d).toContain("คำต้องห้าม: ก็ตามใจ, ไม่รู้สิ");
  });

  it("counts forbidden-word occurrences, framed as occurrence-only (no attribution)", () => {
    const a = codexAudit(c, 'ธารา ถอนใจ "ก็ตามใจ" เขาว่า แล้วพึมพำ ก็ตามใจ อีกครั้ง', "th");
    expect(a.forbiddenHits).toEqual([{ name: "ธารา", word: "ก็ตามใจ", count: 2 }]);
    const out = formatCodexAudit(a, "th");
    expect(out).toContain("voice guard");
    expect(out).toContain("ตรวจเองว่าใครพูด"); // honest: no speaker attribution
  });

  it("no hits when forbidden words stay out of the draft", () => {
    expect(codexAudit(c, "ธารา เงียบ", "th").forbiddenHits).toEqual([]);
  });
});

describe("thread-trace heuristic (Thai-aware, not space-split)", () => {
  const c = parseCodex("[ตัวละคร]\nอนันต์: นักสืบ\n[ปมค้าง]\nความลับผลแล็บของมาลี: สูง\nอดีตหมอลี: ต่ำ");

  it("flags a high thread whose tokenized keywords leave no trace", () => {
    const a = codexAudit(c, "อนันต์ นั่งดื่มกาแฟ ฝนตกทั้งคืน", "th");
    expect(a.threadsNoTrace).toHaveLength(1);
    expect(a.threadsNoTrace[0].desc).toBe("ความลับผลแล็บของมาลี");
    expect(a.threadsNoTrace[0].matched).toBe(0);
    const out = formatCodexAudit(a, "th");
    expect(out).toContain("ไม่พบร่องรอย");
    expect(out).toContain("อาจไม่ใช่ที่ของมัน"); // framed as placement question, not "you forgot"
  });

  it("a single tokenized keyword hit clears the thread (ความลับ appears)", () => {
    // Thai draft has no spaces around ความลับ — space-split matching would miss it;
    // tokenization finds it.
    const a = codexAudit(c, "อนันต์รู้ว่าความลับกำลังใกล้เข้ามา", "th");
    expect(a.threadsNoTrace).toEqual([]);
  });

  it("low/medium threads are never flagged (only high/critical are must-touch)", () => {
    const a = codexAudit(c, "ไม่มีอะไรเลย", "th");
    expect(a.threadsNoTrace.every((t) => t.priority === "high" || t.priority === "critical")).toBe(true);
  });
});

describe("codexLocal — GraphRAG local view", () => {
  const c = parseCodex(BIBLE);

  it("surfaces only entities mentioned in the text, plus 1-hop neighbours", () => {
    // Text mentions only อนันต์ → pulls in มาลี & เสือ via relations.
    const local = codexLocal(c, "บทนี้ อนันต์ ออกตามหาเบาะแส");
    const names = local.entities.map((e) => e.name).sort();
    expect(names).toContain("อนันต์");
    expect(names).toContain("มาลี"); // neighbour via พี่น้อง
    expect(names).toContain("เสือ"); // neighbour via ตามล่า
    expect(names).not.toContain("กรุงเทพเก่า"); // not mentioned, not a neighbour
  });

  it("returns empty when no declared entity appears", () => {
    expect(codexLocal(c, "ฉากเปิดที่ทะเล").entities).toHaveLength(0);
    expect(codexLocalTh(c, "ฉากเปิดที่ทะเล")).toBe("");
  });
});

describe("rendering", () => {
  it("digest lists cast + relations and asserts source-of-truth (TH & EN)", () => {
    const c = parseCodex(BIBLE);
    const th = codexDigestTh(c);
    expect(th).toContain("Codex ของหนังสือ");
    expect(th).toContain("ตัวละคร (3)");
    expect(th).toContain("แหล่งความจริง");
    expect(codexDigestEn(c)).toContain("Characters (3)");
  });

  it("empty codex renders to empty string (no injection)", () => {
    expect(codexDigestTh(parseCodex(""))).toBe("");
    expect(codexLocalTh(parseCodex(""), "anything")).toBe("");
  });
});

describe("end-to-end injection", () => {
  const base = {
    type: "novel", title: "เงามืด", thesis: "การตามหา", reader: "ผู้อ่าน", voice: "noir",
    chapters: 6, wordsPerChapter: 2000, subGenre: "thriller", citationStyle: "none",
    language: "thai", promptLanguage: "th",
    outline: "บทที่ 1: อนันต์ พบกุญแจทองคำ",
    storyBible: BIBLE,
  } as unknown as Parameters<typeof generateAllPrompts>[0];

  it("book digest reaches the MASTER prompt; chapter local view reaches CH_1", () => {
    const pack = generateAllPrompts(base, []);
    expect(pack.find((p) => p.id === "MASTER")!.prompt).toContain("Codex ของหนังสือ");
    const ch1 = pack.find((p) => p.id === "CH_1")!.prompt;
    expect(ch1).toContain("Codex ต่อเนื่อง (เฉพาะบทนี้)");
    expect(ch1).toContain("อนันต์");
    expect(ch1).toContain("กุญแจทองคำ"); // mentioned in ch1 beat
  });

  it("without a codex the same book injects nothing (snapshot-safe)", () => {
    const plain = generateAllPrompts({ ...base, storyBible: undefined } as typeof base, []);
    expect(plain.find((p) => p.id === "MASTER")!.prompt).not.toContain("Codex ของหนังสือ");
    expect(plain.find((p) => p.id === "CH_1")!.prompt).not.toContain("Codex ต่อเนื่อง");
  });
});

describe("codexMermaid — the declared graph, drawn", () => {
  const codex = parseCodex(BIBLE);

  it("emits a Mermaid graph with a node per entity and labelled edges", () => {
    const m = codexMermaid(codex);
    expect(m).toMatch(/^graph LR/);
    expect(m).toContain(':::character');
    expect(m).toContain(':::place');
    expect(m).toContain(':::item');
    expect(m).toContain("-->|ตามล่า|"); // directed relation อนันต์ -> เสือ
    expect(m).toContain("---|พี่น้อง|"); // undirected อนันต์ - มาลี
    // every declared entity name appears as a node label
    for (const e of codex.entities) expect(m).toContain(`"${e.name}"`);
  });

  it("returns empty string for an empty codex", () => {
    expect(codexMermaid(parseCodex(""))).toBe("");
  });

  it("neutralises Mermaid-significant chars in labels (& < > # ; never leak)", () => {
    const m = codexMermaid(parseCodex("[ตัวละคร]\nแม่ & ลูก: ครอบครัว\n[ความสัมพันธ์]\nแม่ & ลูก -> เสือ: รัก<เกลียด"));
    // & (Mermaid's multi-node operator) and < never appear in valid output — the
    // arrow "-->" legitimately contains >, and classDef colours contain #, so those
    // two are the unambiguous sentinels that a raw label char leaked through.
    expect(m).not.toContain("&");
    expect(m).not.toContain("<");
    expect(m).toContain('n0["แม่ ลูก"]'); // & collapsed to a space in the label
    expect(m).toContain("|รัก เกลียด|");  // < collapsed in the edge label
  });

  it("falls back to a placeholder rather than an empty label", () => {
    const m = codexMermaid(parseCodex("[ตัวละคร]\n(): บทบาท"));
    expect(m).not.toContain('[""]');
    expect(m).toContain('"?"');
  });

  it("gives undeclared relation endpoints their own node (no dropped edge)", () => {
    const m = codexMermaid(parseCodex("[ตัวละคร]\nA: x\n[ความสัมพันธ์]\nA -> ผี: หนีจาก"));
    expect(m).toContain(":::unknown");
    expect(m).toContain('"ผี"');
  });
});

describe("codexAudit — draft vs codex (counts, not a verdict)", () => {
  const codex = parseCodex(BIBLE);

  it("codexCanon flattens declared names for the radar", () => {
    expect(codexCanon(codex)).toEqual(["อนันต์", "มาลี", "เสือ", "กรุงเทพเก่า", "กุญแจทองคำ"]);
  });

  it("classifies present / missing entities in a Thai draft", () => {
    const draft = "อนันต์ เดินเข้าไปใน กรุงเทพเก่า พร้อม กุญแจทองคำ";
    const a = codexAudit(codex, draft, "th");
    const present = a.present.map((e) => e.name);
    expect(present).toContain("อนันต์");
    expect(present).toContain("กรุงเทพเก่า");
    expect(present).toContain("กุญแจทองคำ");
    expect(a.missing.map((e) => e.name)).toContain("เสือ"); // never mentioned
  });

  it("flags a near-miss spelling as a variant, not missing", () => {
    // มาลี declared; draft writes มาลิ (tone/vowel mark variant) → caught by thaiMarkVariant.
    const a = codexAudit(codex, "อนันต์ ตามหา มาลิ ทั่วเมือง", "th");
    expect(a.variants.some((v) => v.declared === "มาลี")).toBe(true);
    expect(a.missing.map((e) => e.name)).not.toContain("มาลี");
  });

  it("empty draft → everything missing; empty codex → nothing to audit", () => {
    expect(codexAudit(codex, "", "th").missing).toHaveLength(codex.entities.length);
    expect(codexAudit(parseCodex(""), "anything", "th").canonSize).toBe(0);
  });

  it("report is counts, never a 0–100 verdict", () => {
    const out = formatCodexAudit(codexAudit(codex, "อนันต์ อยู่คนเดียว", "th"), "th");
    expect(out).toContain("นับได้ ไม่ใช่คำตัดสิน");
    expect(out).not.toMatch(/\b\d{1,3}\/100\b/);
    expect(out).toContain("ไม่ถูกอ้างถึง"); // เสือ, มาลี, etc.
  });
});
