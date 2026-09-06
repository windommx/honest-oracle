// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import {
  createBook, listBooks, updateBook, deleteBook, listChapters, addChapter, updateChapter, deleteChapter, moveChapter,
  addNote, listNotes, updateNote, deleteNote,
  compileBook, chaptersForEpub, chapterHeading, exportMarkdown, exportText, bookProgress, countBookWords,
  notesToCodex, mergeCodexIntoDraft, sendCodexToPromptTool, DRAFT_KEY, CODEX_MARK_BEGIN,
  type WritingChapter, type WritingNote,
} from "./_writing-store";
import { splitChapters } from "@/lib/bookisdom-engine/chapters";
import { parseCodex } from "@/lib/bookisdom-engine/codex";

const ch = (o: Partial<WritingChapter>): WritingChapter => ({ id: o.id ?? "c", bookId: "b", title: "", content: "", order: 1, createdAt: 0, updatedAt: 0, ...o });
const note = (o: Partial<WritingNote>): WritingNote => ({ id: o.id ?? "n", bookId: "b", type: "IDEA", title: "", content: "", pinned: false, createdAt: 0, updatedAt: 0, ...o });

describe("books and chapters — a book always has an editor to land in, and order is real", () => {
  it("a new book starts with one chapter; chapters list in order; delete cascades", async () => {
    const b = await createBook({ title: "เงาเมืองใต้", lang: "th", targetWords: 80000 });
    expect((await listChapters(b.id)).map((c) => c.title)).toEqual(["บทที่ 1"]);
    await addChapter(b.id, "ชื่อที่ถูกลบ");
    await addChapter(b.id);
    expect((await listChapters(b.id)).map((c) => c.title)).toEqual(["บทที่ 1", "ชื่อที่ถูกลบ", "บทที่ 3"]);
    await addNote({ bookId: b.id, type: "IDEA", title: "x", content: "" });
    await deleteBook(b.id);
    expect(await listChapters(b.id)).toEqual([]);
    expect(await listNotes(b.id)).toEqual([]);
    expect((await listBooks()).find((x) => x.id === b.id)).toBeUndefined();
  });

  it("moveChapter swaps with the neighbour and refuses at either end without changing anything", async () => {
    const b = await createBook({ title: "t", lang: "th" });
    const c2 = await addChapter(b.id, "สอง");
    const c3 = await addChapter(b.id, "สาม");
    expect(await moveChapter(c3.id, "up")).toBe(true);
    expect((await listChapters(b.id)).map((c) => c.title)).toEqual(["บทที่ 1", "สาม", "สอง"]);
    expect(await moveChapter(c2.id, "down")).toBe(false); // already last
    expect((await listChapters(b.id)).map((c) => c.title)).toEqual(["บทที่ 1", "สาม", "สอง"]);
  });

  it("updating a chapter bumps the book's updatedAt so the dashboard's 'recent' is honest", async () => {
    const b = await createBook({ title: "t", lang: "en" });
    const [c] = await listChapters(b.id);
    await new Promise((r) => setTimeout(r, 3));
    await updateChapter(c.id, { content: "The river ran east." });
    const after = (await listBooks()).find((x) => x.id === b.id)!;
    expect(after.updatedAt).toBeGreaterThan(b.updatedAt);
    await updateBook(b.id, { status: "WRITING", targetWords: 500 });
    expect((await listBooks()).find((x) => x.id === b.id)).toMatchObject({ status: "WRITING", targetWords: 500 });
    await deleteChapter(c.id);
    expect(await listChapters(b.id)).toEqual([]);
  });
});

describe("compileBook — the bridge to the analyzers, EPUB and KDP", () => {
  it("round-trips through the engine's own splitChapters: N chapters in, the same N out, in ORDER", () => {
    const chapters = [
      ch({ id: "a", title: "สายฝนและกระเป๋าสีแดง", content: "ฝนตกลงมา…", order: 2 }),
      ch({ id: "b", title: "ชื่อที่ถูกลบ", content: "ห้องเก็บเอกสาร…", order: 1 }),
      ch({ id: "c", title: "", content: "ร้านซ่อมนาฬิกา", order: 3 }),
    ];
    const text = compileBook({ lang: "th" }, chapters);
    const parts = splitChapters(text);
    expect(parts).toHaveLength(3);
    expect(parts.map((p) => p.title)).toEqual(["บทที่ 1: ชื่อที่ถูกลบ", "บทที่ 2: สายฝนและกระเป๋าสีแดง", "บทที่ 3"]);
    expect(parts[0].body).toContain("ห้องเก็บเอกสาร");
  });

  it("a title that already says 'บทที่ N' is not doubled; English books get 'Chapter N'", () => {
    expect(chapterHeading(4, "บทที่ 4 — ร้านโคลงเครื่อง", "th")).toBe("บทที่ 4 — ร้านโคลงเครื่อง");
    expect(chapterHeading(2, "The Mill", "en")).toBe("Chapter 2: The Mill");
    expect(chaptersForEpub({ lang: "en" }, [ch({ title: "The Mill", content: "x" })])).toEqual([{ title: "Chapter 1: The Mill", text: "x" }]);
  });

  it("exports carry the writer's title/author and every chapter; empty chapters are marked, not hidden", () => {
    const book = { id: "b", title: "T", subtitle: "S", author: "A", genre: "G", lang: "th" as const, status: "DRAFT" as const, targetWords: 0, createdAt: 0, updatedAt: 0 };
    const md = exportMarkdown(book, [ch({ title: "หนึ่ง", content: "" })]);
    expect(md).toContain("# T"); expect(md).toContain("โดย A"); expect(md).toContain("_(ยังไม่มีเนื้อหา)_");
    expect(exportText(book, [ch({ title: "หนึ่ง", content: "เนื้อ" })])).toContain("บทที่ 1: หนึ่ง\n\nเนื้อ");
  });

  it("counts words with the analyzers' tokenizers, not whitespace — a Thai paragraph is not 'one word'", async () => {
    const n = await countBookWords({ lang: "th" }, [ch({ content: "แม่น้ำไหลไปทางตะวันออกผ่านโรงสี" })]);
    expect(n).toBeGreaterThan(3);
    expect(await countBookWords({ lang: "en" }, [ch({ content: "one two three" }), ch({ content: "four" })])).toBe(4);
  });

  it("progress is disclosed arithmetic — and null, not 0 %, when there is no target", () => {
    expect(bookProgress(400, 80000)).toBe(1);
    expect(bookProgress(80000, 80000)).toBe(100);
    expect(bookProgress(500, 0)).toBeNull();
  });
});

describe("notesToCodex — notes become the prompt tool's Story Codex, in parseCodex's own grammar", () => {
  it("character/place/item/thread notes parse into entities, traits and threads; working notes are skipped and counted", () => {
    const notes = [
      note({ type: "CHARACTER", title: "มะลิ", content: "นักข่าวหญิง อายุ 32\nอยาก: หาความจริงเรื่องเด็กหาย\nเสียง: ห้วน สั้น ไม่ค่อยใช้คำลงท้าย" }),
      note({ type: "PLACE", title: "ซอยทับทิม", content: "ซอยเก่าในเมือง มีร้านซ่อมนาฬิกาปลายซอย" }),
      note({ type: "ITEM", title: "กระเป๋าผ้าสีแดง", content: "ของเด็กหญิงที่หายไป" }),
      note({ type: "THREAD", title: "ใครฉีกแฟ้มประวัติ", content: "สูง" }),
      note({ type: "PLOT", title: "องก์ 2", content: "ไม่ควรเข้า codex" }),
      note({ type: "IDEA", title: "ไอเดียปก", content: "" }),
    ];
    const { text, included, skipped } = notesToCodex(notes);
    expect(included).toBe(4); expect(skipped).toBe(2);
    const codex = parseCodex(text);
    const mali = codex.entities.find((e) => e.name === "มะลิ");
    expect(mali).toMatchObject({ type: "character", desc: "นักข่าวหญิง อายุ 32", want: "หาความจริงเรื่องเด็กหาย", voice: "ห้วน สั้น ไม่ค่อยใช้คำลงท้าย" });
    expect(codex.entities.find((e) => e.name === "ซอยทับทิม")?.type).toBe("place");
    expect(codex.entities.find((e) => e.name === "กระเป๋าผ้าสีแดง")?.type).toBe("item");
    expect(codex.threads).toEqual([{ desc: "ใครฉีกแฟ้มประวัติ", priority: "high" }]);
    expect(text).not.toContain("องก์ 2");
  });

  it("merging into an existing bible is idempotent and never touches hand-written text", () => {
    const hand = "[ตัวละคร]\nพ่อ: ชายชรา";
    const once = mergeCodexIntoDraft(hand, "[สถานที่]\nร้านนาฬิกา: ปลายซอย");
    const twice = mergeCodexIntoDraft(once, "[สถานที่]\nร้านนาฬิกา: ปลายซอย (แก้)");
    expect(twice.startsWith(hand)).toBe(true);
    expect(twice.split(CODEX_MARK_BEGIN)).toHaveLength(2); // one block, replaced not appended
    expect(twice).toContain("(แก้)"); expect(twice).not.toContain("ปลายซอย\n");
    const codex = parseCodex(twice);
    expect(codex.entities.map((e) => e.name)).toEqual(["พ่อ", "ร้านนาฬิกา"]);
  });

  it("sendCodexToPromptTool writes into the SAME draft record the prompt tool restores, preserving its other fields", () => {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ config: { title: "เงาเมืองใต้", storyBible: "[ตัวละคร]\nพ่อ: ชายชรา" }, groups: ["craft"] }));
    expect(sendCodexToPromptTool("[สถานที่]\nซอยทับทิม: ซอยเก่า")).toEqual({ ok: true });
    const d = JSON.parse(window.localStorage.getItem(DRAFT_KEY)!);
    expect(d.config.title).toBe("เงาเมืองใต้"); expect(d.groups).toEqual(["craft"]);
    expect(d.config.storyBible).toContain("พ่อ: ชายชรา"); expect(d.config.storyBible).toContain("ซอยทับทิม");
  });

  it("notes list pinned first; pin/unpin and delete are real", async () => {
    const b = await createBook({ title: "t", lang: "th" });
    const a = await addNote({ bookId: b.id, type: "IDEA", title: "a", content: "" });
    await new Promise((r) => setTimeout(r, 3));
    const c = await addNote({ bookId: b.id, type: "PLOT", title: "c", content: "" });
    expect((await listNotes(b.id)).map((n) => n.title)).toEqual(["c", "a"]);
    await updateNote(a.id, { pinned: true });
    expect((await listNotes(b.id)).map((n) => n.title)).toEqual(["a", "c"]);
    await deleteNote(c.id);
    expect((await listNotes(b.id)).map((n) => n.title)).toEqual(["a"]);
  });
});

// ═══ Pro additions ═══
import {
  takeSnapshot, listSnapshots, restoreSnapshot, deleteSnapshot,
  addPlotLine, listPlotLines, renamePlotLine, deletePlotLine, addPlotCard, listPlotCards, updatePlotCard, deletePlotCard, applyTemplate,
  plotToOutline, mergeOutlineIntoDraft, sendOutlineToPromptTool, OUTLINE_MARK_BEGIN,
  recordWritingDelta, listWritingDays, heatmapWeeks, heatLevel, localDayKey, exportPrintHtml,
} from "./_writing-store";
import { STORY_TEMPLATES } from "@/lib/bookisdom-engine/story-templates";

describe("snapshots — a version is a real copy, and a restore can itself be undone", () => {
  it("snapshot stores the text and its tokenizer word count; restore swaps text but snapshots the current first", async () => {
    const b = await createBook({ title: "snap", lang: "th" });
    const [c] = await listChapters(b.id);
    await updateChapter(c.id, { content: "ฝนตกลงมาเหมือนคนใจร้าย" });
    const s1 = (await takeSnapshot(c.id, "ร่างแรก"))!;
    expect(s1.words).toBeGreaterThan(2);
    await updateChapter(c.id, { content: "แก้ใหม่ทั้งหมด" });
    expect(await restoreSnapshot(s1.id)).toBe(true);
    expect((await listChapters(b.id))[0].content).toBe("ฝนตกลงมาเหมือนคนใจร้าย");
    const snaps = await listSnapshots(c.id);
    expect(snaps).toHaveLength(2);
    expect(snaps[0].label).toBe("ก่อนย้อนกลับ"); expect(snaps[0].content).toBe("แก้ใหม่ทั้งหมด");
    await deleteSnapshot(snaps[0].id);
    expect(await listSnapshots(c.id)).toHaveLength(1);
    expect(await restoreSnapshot("missing")).toBe(false);
  });
});

describe("plot board → outline for the prompt tool", () => {
  it("lines and cards round-trip; deleting a line deletes its cards", async () => {
    const b = await createBook({ title: "plot", lang: "th" });
    const l1 = await addPlotLine(b.id, "เส้นหลัก");
    const l2 = await addPlotLine(b.id, "");
    expect(l2.title).toBe("เส้นเรื่อง 2");
    await addPlotCard(l1.id, 0, "เปิดเรื่อง", "ฝนตก");
    await addPlotCard(l1.id, 2, "พลิก");
    const card = await addPlotCard(l2.id, 1, "เรื่องรอง");
    await updatePlotCard(card.id, { colIndex: 0, description: "รักครั้งแรก" });
    await renamePlotLine(l2.id, "เส้นรัก");
    const cards = await listPlotCards(b.id);
    expect(cards.map((c) => c.colIndex)).toEqual([0, 0, 2]);
    const outline = plotToOutline(await listPlotLines(b.id), cards);
    expect(outline).toBe("ฉาก 1:\n  - [เส้นหลัก] เปิดเรื่อง — ฝนตก\n  - [เส้นรัก] เรื่องรอง — รักครั้งแรก\nฉาก 3:\n  - [เส้นหลัก] พลิก");
    await deletePlotCard(card.id);
    await deletePlotLine(l1.id);
    expect(await listPlotCards(b.id)).toEqual([]);
    expect((await listPlotLines(b.id)).map((l) => l.title)).toEqual(["เส้นรัก"]);
  });

  it("applying a template adds a NEW line with one card per beat at its computed column, leaving existing cards alone", async () => {
    const b = await createBook({ title: "tpl", lang: "th" });
    const mine = await addPlotLine(b.id, "ของฉัน");
    await addPlotCard(mine.id, 0, "การ์ดเดิม");
    const line = (await applyTemplate(b.id, "three-act", 12))!;
    expect(line.title).toContain("สามองก์");
    const cards = await listPlotCards(b.id);
    const tpl = cards.filter((c) => c.plotLineId === line.id);
    expect(tpl).toHaveLength(9);
    expect(tpl[0]).toMatchObject({ colIndex: 0, title: "คว้าใจตั้งแต่หน้าแรก" });
    expect(tpl[tpl.length - 1].colIndex).toBe(11);
    expect(cards.some((c) => c.title === "การ์ดเดิม")).toBe(true);
    expect(await applyTemplate(b.id, "nope")).toBeNull();
  });

  it("outline merge is idempotent and lands in the prompt tool's draft `outline`, preserving other fields", () => {
    const once = mergeOutlineIntoDraft("บทที่ 1 ของฉันเอง", "ฉาก 1:\n  - [a] x");
    const twice = mergeOutlineIntoDraft(once, "ฉาก 1:\n  - [a] y");
    expect(twice.startsWith("บทที่ 1 ของฉันเอง")).toBe(true);
    expect(twice.split(OUTLINE_MARK_BEGIN)).toHaveLength(2);
    expect(twice).toContain("[a] y"); expect(twice).not.toContain("[a] x");
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ config: { title: "T", outline: "เดิม" }, groups: [] }));
    expect(sendOutlineToPromptTool("ฉาก 1:\n  - [a] x")).toEqual({ ok: true });
    const d = JSON.parse(window.localStorage.getItem(DRAFT_KEY)!);
    expect(d.config.title).toBe("T"); expect(d.config.outline).toContain("เดิม"); expect(d.config.outline).toContain("[a] x");
  });
});

describe("writing days — words written, not words present", () => {
  it("records only positive deltas, sums within a day per book, and buckets are a legend", async () => {
    const b = await createBook({ title: "days", lang: "th" });
    const day = new Date(2026, 8, 5, 10, 0, 0);
    expect(await recordWritingDelta(b.id, 0, 120, day)).toBe(120);
    expect(await recordWritingDelta(b.id, 120, 100, day)).toBe(0); // deleting is not negative writing
    expect(await recordWritingDelta(b.id, 100, 180, day)).toBe(80);
    const rows = (await listWritingDays()).filter((r) => r.bookId === b.id);
    expect(rows).toEqual([{ key: `2026-09-05|${b.id}`, date: "2026-09-05", bookId: b.id, words: 200 }]);
    expect([heatLevel(0), heatLevel(1), heatLevel(250), heatLevel(999), heatLevel(1000)]).toEqual([0, 1, 2, 3, 4]);
  });

  it("the 27-week grid starts on a Monday, ends on today's week, and marks days after today as future", () => {
    const today = new Date(2026, 8, 5); // Saturday
    const weeks = heatmapWeeks([{ key: "k", date: "2026-09-05", bookId: "b", words: 300 }, { key: "k2", date: "2026-09-05", bookId: "c", words: 50 }], today);
    expect(weeks).toHaveLength(27);
    expect(new Date(`${weeks[0][0].date}T00:00:00`).getDay()).toBe(1);
    const flat = weeks.flat();
    const sat = flat.find((d) => d.date === "2026-09-05")!;
    expect(sat.words).toBe(350); expect(sat.future).toBe(false);
    expect(flat.find((d) => d.date === "2026-09-06")!.future).toBe(true);
    expect(localDayKey(new Date(2026, 0, 9))).toBe("2026-01-09");
  });
});

describe("print export", () => {
  it("escapes HTML, one section per chapter in order, paragraphs from blank lines", () => {
    const book = { id: "b", title: "ชื่อ <เล่ม>", subtitle: "", author: "A & B", genre: "", lang: "th" as const, status: "DRAFT" as const, targetWords: 0, createdAt: 0, updatedAt: 0 };
    const html = exportPrintHtml(book, [ch({ id: "2", title: "สอง", content: "ย่อหน้าหนึ่ง\n\nย่อหน้าสอง", order: 2 }), ch({ id: "1", title: "หนึ่ง", content: "<b>ไม่ใช่แท็ก</b>", order: 1 })]);
    expect(html).toContain("<title>ชื่อ &lt;เล่ม&gt;</title>"); expect(html).toContain("A &amp; B");
    expect(html.indexOf("บทที่ 1: หนึ่ง")).toBeLessThan(html.indexOf("บทที่ 2: สอง"));
    expect(html).toContain("&lt;b&gt;ไม่ใช่แท็ก&lt;/b&gt;");
    expect((html.match(/<p>/g) ?? [])).toHaveLength(3);
    expect(html).toContain("@page{size:A5");
  });
});
