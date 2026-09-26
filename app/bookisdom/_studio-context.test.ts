// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { composeStudioContext, prefillStudio, STUDIO_PREFILL_KEY } from "./_studio-context";
import type { WritingChapter, WritingNote, PlotLine, PlotCard } from "./_writing-types";

const ch = (o: Partial<WritingChapter>): WritingChapter => ({ id: o.id ?? "c", bookId: "b", title: "", content: "", order: 1, createdAt: 0, updatedAt: 0, ...o });
const note = (o: Partial<WritingNote>): WritingNote => ({ id: o.id ?? Math.random().toString(36), bookId: "b", type: "IDEA", title: "", content: "", pinned: false, createdAt: 0, updatedAt: 0, ...o });
const book = { title: "เงาเมืองใต้", lang: "th" as const, author: "ศิริ", genre: "สืบสวน" };

describe("composeStudioContext — what the room knows becomes the run's context, verbatim sources", () => {
  it("system = role + Codex digest (from the SAME notes→codex text) + outline from the board; prompt = tail of the previous chapter + the target's existing text", () => {
    const chapters = [ch({ id: "c1", title: "หนึ่ง", content: "ก".repeat(2000) + "จบบทหนึ่ง", order: 1 }), ch({ id: "c2", title: "สอง", content: "เริ่มบทสอง", order: 2 })];
    const notes = [note({ type: "CHARACTER", title: "มะลิ", content: "นักข่าว\nอยาก: หาความจริง" }), note({ type: "PLOT", title: "ไม่เข้า codex" })];
    const lines: PlotLine[] = [{ id: "l", bookId: "b", title: "หลัก", order: 1 }];
    const cards: PlotCard[] = [{ id: "k", plotLineId: "l", colIndex: 0, title: "เปิดเรื่อง", description: "ฝนตก", createdAt: 0, chapterId: null }];
    const ctx = composeStudioContext({ book, chapters, notes, plotLines: lines, plotCards: cards, targetChapterId: "c2" });
    expect(ctx.parts).toEqual({ codex: true, outline: true, previous: true });
    expect(ctx.system).toContain("เงาเมืองใต้"); expect(ctx.system).toContain("มะลิ"); expect(ctx.system).toContain("หาความจริง");
    expect(ctx.system).toContain("ฉาก 1:"); expect(ctx.system).toContain("[หลัก] เปิดเรื่อง — ฝนตก");
    expect(ctx.system).not.toContain("ไม่เข้า codex");
    expect(ctx.prompt).toContain("ท้ายของบทที่ 1: หนึ่ง (1500 ตัวอักษรสุดท้าย)");
    expect(ctx.prompt).toContain("จบบทหนึ่ง"); expect(ctx.prompt).not.toContain("ก".repeat(1600)); // tail only
    expect(ctx.prompt).toContain("บทที่ 2: สอง"); expect(ctx.prompt).toContain("เริ่มบทสอง");
  });

  it("first chapter, no notes, no board: says so plainly and adds no empty blocks", () => {
    const ctx = composeStudioContext({ book, chapters: [ch({ id: "c1", title: "", order: 1 })], notes: [], plotLines: [], plotCards: [], targetChapterId: "c1" });
    expect(ctx.parts).toEqual({ codex: false, outline: false, previous: false });
    expect(ctx.prompt).toContain("นี่คือบทแรกของเล่ม");
    expect(ctx.system.split("\n\n")).toHaveLength(1);
    expect(ctx.system).not.toContain("═══");
  });

  it("English books get the English digest and wording; prefill lands in Studio's slot", () => {
    const ctx = composeStudioContext({ book: { ...book, lang: "en", title: "Shadow" }, chapters: [ch({ id: "c1", title: "One", content: "The end of one.", order: 1 }), ch({ id: "c2", title: "Two", order: 2 })], notes: [note({ type: "PLACE", title: "The Mill", content: "old" })], plotLines: [], plotCards: [], targetChapterId: "c2" });
    expect(ctx.system).toContain("Write in English"); expect(ctx.system).toContain("The Mill");
    expect(ctx.prompt).toContain("End of Chapter 1: One"); expect(ctx.prompt).toContain("Write Chapter 2: Two");
    expect(prefillStudio(ctx)).toBe(true);
    const d = JSON.parse(window.sessionStorage.getItem(STUDIO_PREFILL_KEY)!);
    expect(d.system).toBe(ctx.system); expect(d.prompt).toBe(ctx.prompt);
  });
});
