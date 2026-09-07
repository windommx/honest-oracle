// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { createBook, listChapters, updateChapter, listBooks, exportBundle, getSafetyCopy, restoreSafetyCopy, addNote, listNotes } from "./_writing-store";
import { pushBook, pullBook, listRemote } from "./_writing-sync";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const fake = (h: (url: string, init?: RequestInit) => Response | Promise<Response>) => ((u: string, i?: RequestInit) => Promise.resolve(h(u, i))) as unknown as typeof fetch;

describe("sync client — explicit, typed outcomes; a pull never loses local text", () => {
  it("push sends the book's bundle to its own route; 401/503/403 are named, not numbered", async () => {
    const b = await createBook({ title: "ซิงก์", lang: "th" });
    let seen: { url: string; body: string } | null = null;
    const ok = fake((url, init) => { seen = { url, body: String(init?.body) }; return json(200, { updatedAt: "2026-09-05T00:00:00Z", bytes: 123 }); });
    expect(await pushBook(b.id, ok)).toEqual({ ok: true, updatedAt: "2026-09-05T00:00:00Z", bytes: 123 });
    expect(seen!.url).toBe(`/api/bookisdom/writing/${b.id}`);
    expect(JSON.parse(seen!.body).bundle.books[0].id).toBe(b.id);
    expect((await pushBook(b.id, fake(() => json(401, {})))) as { kind?: string }).toMatchObject({ ok: false, kind: "login" });
    expect((await pushBook(b.id, fake(() => json(503, { error: "ไม่ได้ตั้งค่า" })))) as { kind?: string }).toMatchObject({ ok: false, kind: "server", message: "ไม่ได้ตั้งค่า" });
    expect((await pushBook(b.id, fake(() => json(403, { error: "แผน Free", code: "upgrade_required" })))) as { kind?: string }).toMatchObject({ ok: false, kind: "limit" });
    expect((await pushBook(b.id, fake(() => { throw new TypeError("net"); }))) as { kind?: string }).toMatchObject({ ok: false, kind: "network" });
  });

  it("pull replaces the local book with the account copy, ids intact, after a safety copy — and the safety copy restores", async () => {
    const b = await createBook({ title: "เครื่องนี้", lang: "th" });
    const [c] = await listChapters(b.id);
    await updateChapter(c.id, { content: "ข้อความในเครื่อง" });
    await addNote({ bookId: b.id, type: "IDEA", title: "โน้ตในเครื่อง", content: "" });
    // the account holds a newer version of the same book (same ids), edited elsewhere
    const remote = await exportBundle([b.id]);
    remote.books[0].title = "จากอีกเครื่อง"; remote.chapters[0].content = "ข้อความจากอีกเครื่อง"; remote.notes = [];
    const r = await pullBook(b.id, fake(() => json(200, { bundle: remote, updatedAt: "x", bytes: 1 })));
    expect(r).toMatchObject({ ok: true, replaced: true });
    expect((await listBooks()).find((x) => x.id === b.id)!.title).toBe("จากอีกเครื่อง");
    const chs = await listChapters(b.id);
    expect(chs).toHaveLength(1); expect(chs[0].id).toBe(c.id); expect(chs[0].content).toBe("ข้อความจากอีกเครื่อง");
    expect(await listNotes(b.id)).toEqual([]);
    // the local state before the pull is still here
    const safety = await getSafetyCopy(b.id);
    expect(safety?.title).toBe("เครื่องนี้");
    expect(await restoreSafetyCopy(b.id)).toBe(true);
    expect((await listChapters(b.id))[0].content).toBe("ข้อความในเครื่อง");
    expect((await listNotes(b.id)).map((n) => n.title)).toEqual(["โน้ตในเครื่อง"]);
  });

  it("pull refuses a bundle whose book id does not match, and a book missing on the account is 'notfound'", async () => {
    const b = await createBook({ title: "x", lang: "en" });
    const other = await exportBundle([b.id]); other.books[0].id = "someone-else";
    expect(await pullBook(b.id, fake(() => json(200, { bundle: other, updatedAt: "x", bytes: 1 }))) as { kind?: string }).toMatchObject({ ok: false, kind: "invalid" });
    expect(await pullBook(b.id, fake(() => json(404, {}))) as { kind?: string }).toMatchObject({ ok: false, kind: "notfound" });
    const l = await listRemote(fake(() => json(200, { books: [{ bookId: b.id, title: "x", bytes: 1, updatedAt: "x" }] })));
    expect(l).toMatchObject({ ok: true }); if (l.ok) expect(l.books).toHaveLength(1);
  });
});
