"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BookOpen, Plus, ChevronUp, ChevronDown, Check, Loader2, Save, Search, BookDown, FileDown, Pin, PinOff,
  Wand2, LayoutGrid, Play, BookMarked, PenLine, StickyNote, Library,
} from "lucide-react";
import { toast } from "../_toast";
import { BookisdomLogo } from "../_logo";
import { DeleteButton } from "../_ui";
import { downloadBlob } from "../_utils";
import { saveManuscript } from "../_manuscript-store";
import { countManuscriptWords } from "../_word-count";
import { buildEpub } from "@/lib/bookisdom-engine/epub";
import {
  createBook, listBooks, updateBook, deleteBook, listChapters, addChapter, updateChapter, deleteChapter, moveChapter,
  addNote, listNotes, updateNote, deleteNote,
  compileBook, chaptersForEpub, exportMarkdown, exportText, bookProgress, countBookWords, notesToCodex, sendCodexToPromptTool,
  STATUS_LABEL, NOTE_META, NOTE_TYPES,
  type WritingBook, type WritingChapter, type WritingNote, type BookStatus, type NoteType,
} from "../_writing-store";

// ╔══════════════════════════════════════════════════════════════════╗
// ║  /bookisdom/write — ห้องเขียน. Absorbed from InkStudio and wired  ║
// ║  into Bookisdom: chapters compile into a manuscript the analyzers  ║
// ║  read; notes become the prompt tool's Story Codex; the book exports║
// ║  as EPUB through the same builder the dashboard uses; every count  ║
// ║  is the analyzers' own tokenizer. Local-first: nothing leaves the  ║
// ║  browser until the writer presses a button that says where it goes.║
// ╚══════════════════════════════════════════════════════════════════╝

const AUTOSAVE_MS = 1200;
const fmt = (n: number) => n.toLocaleString("en-US");

type Pane = "books" | "write" | "notes";

export default function WritePage() {
  const router = useRouter();
  const [books, setBooks] = useState<WritingBook[]>([]);
  const [bookId, setBookId] = useState<string | null>(null);
  const [chapters, setChapters] = useState<WritingChapter[]>([]);
  const [chapterId, setChapterId] = useState<string | null>(null);
  const [notes, setNotes] = useState<WritingNote[]>([]);
  const [pane, setPane] = useState<Pane>("books");
  const [bookWords, setBookWords] = useState<number | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newLang, setNewLang] = useState<"th" | "en">("th");
  const [newTarget, setNewTarget] = useState("");

  const book = useMemo(() => books.find((b) => b.id === bookId) ?? null, [books, bookId]);
  const chapter = useMemo(() => chapters.find((c) => c.id === chapterId) ?? null, [chapters, chapterId]);

  const refreshBooks = useCallback(async () => {
    const rows = await listBooks();
    setBooks(rows);
    return rows;
  }, []);
  const refreshChapters = useCallback(async (id: string) => {
    const rows = await listChapters(id);
    setChapters(rows);
    return rows;
  }, []);
  const refreshNotes = useCallback(async (id: string) => setNotes(await listNotes(id)), []);

  useEffect(() => {
    void refreshBooks().then((rows) => { if (rows.length && !bookId) setBookId(rows[0].id); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!bookId) { setChapters([]); setNotes([]); setChapterId(null); setBookWords(null); return; }
    void refreshChapters(bookId).then((rows) => setChapterId((cur) => (rows.some((c) => c.id === cur) ? cur : rows[0]?.id ?? null)));
    void refreshNotes(bookId);
  }, [bookId, refreshChapters, refreshNotes]);

  // Book-level word count: the analyzers' tokenizers over every chapter — recomputed after
  // each save, not on every keystroke (Thai segmentation is not free).
  const recountBook = useCallback(async (b: WritingBook | null, chs: WritingChapter[]) => {
    if (!b) return setBookWords(null);
    setBookWords(await countBookWords(b, chs));
  }, []);
  useEffect(() => { void recountBook(book, chapters); }, [book, chapters, recountBook]);

  async function onCreateBook() {
    if (!newTitle.trim()) { toast("ใส่ชื่อเล่มก่อน", { variant: "error" }); return; }
    const b = await createBook({ title: newTitle, lang: newLang, targetWords: Number(newTarget) || 0 });
    setNewTitle(""); setNewTarget("");
    await refreshBooks();
    setBookId(b.id);
    setPane("write");
    toast(`สร้าง "${b.title}" แล้ว`);
  }
  async function onAddChapter() {
    if (!bookId) return;
    const ch = await addChapter(bookId);
    await refreshChapters(bookId);
    setChapterId(ch.id);
    setPane("write");
  }
  async function onMove(id: string, dir: "up" | "down") {
    if (!bookId) return;
    const moved = await moveChapter(id, dir);
    if (!moved) toast(dir === "up" ? "บทนี้อยู่บนสุดแล้ว" : "บทนี้อยู่ล่างสุดแล้ว");
    await refreshChapters(bookId);
  }
  async function onDeleteChapter(id: string) {
    if (!bookId) return;
    await deleteChapter(id);
    const rows = await refreshChapters(bookId);
    if (chapterId === id) setChapterId(rows[0]?.id ?? null);
  }
  async function onDeleteBook(id: string) {
    await deleteBook(id);
    const rows = await refreshBooks();
    setBookId(rows[0]?.id ?? null);
  }

  // ── bridges ──
  async function compileAndAnalyze() {
    if (!book) return;
    const text = compileBook(book, chapters);
    if (!text.trim()) { toast("ยังไม่มีเนื้อหาให้วิเคราะห์", { variant: "error" }); return; }
    try {
      const m = await saveManuscript({ title: book.title, lang: book.lang, text });
      toast("รวมเล่มเป็นต้นฉบับแล้ว — กำลังเปิดตัววิเคราะห์");
      router.push(`/bookisdom?analyze=${encodeURIComponent(m.id)}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "บันทึกต้นฉบับไม่สำเร็จ", { variant: "error" });
    }
  }
  function exportEpub() {
    if (!book) return;
    const bytes = buildEpub({ title: book.title, author: book.author || undefined, language: book.lang, chapters: chaptersForEpub(book, chapters) });
    const blob = new Blob([bytes as BlobPart], { type: "application/epub+zip" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${book.title}.epub`; a.click();
    URL.revokeObjectURL(url);
  }
  function sendCodex() {
    if (!book) return;
    const { text, included, skipped } = notesToCodex(notes);
    if (!included) { toast("ยังไม่มีโน้ตประเภทตัวละคร/สถานที่/สิ่งของ/ปมค้าง — โน้ตประเภทอื่นไม่เข้า Codex", { variant: "error" }); return; }
    const r = sendCodexToPromptTool(text);
    if (!r.ok) { toast(`ส่งไม่สำเร็จ: ${r.reason}`, { variant: "error" }); return; }
    toast(`ส่งโน้ต ${included} รายการเข้า Story Codex แล้ว${skipped ? ` (ข้าม ${skipped} ที่ไม่ใช่ entity)` : ""} — เปิดเครื่องมือ prompt เพื่อใช้`, { duration: 6000 });
  }

  const progress = book && bookWords !== null ? bookProgress(bookWords, book.targetWords) : null;

  return (
    <div className="min-h-screen">
      <nav className="nav-premium sticky top-0 z-50">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-3 flex justify-between items-center">
          <BookisdomLogo />
          <div className="flex items-center gap-3 text-xs">
            <Link href="/bookisdom/dashboard" className="hidden sm:flex text-slate-600 hover:text-[#1e40af] items-center gap-1"><LayoutGrid className="w-3.5 h-3.5" />แดชบอร์ด</Link>
            <Link href="/bookisdom" className="hidden sm:flex text-slate-600 hover:text-[#1e40af] items-center gap-1"><Wand2 className="w-3.5 h-3.5" />เครื่องมือ prompt</Link>
            <Link href="/bookisdom/studio" className="hidden sm:flex text-slate-600 hover:text-[#1e40af] items-center gap-1"><Play className="w-3.5 h-3.5" />Studio</Link>
            <Link href="/bookisdom/kdp" className="hidden sm:flex text-slate-600 hover:text-[#1e40af] items-center gap-1"><BookMarked className="w-3.5 h-3.5" />KDP</Link>
            <span className="flex items-center gap-1.5 text-[#1d4ed8] border border-[#1d4ed8]/30 rounded-lg px-3 py-1.5"><PenLine className="w-3.5 h-3.5" /> ห้องเขียน</span>
          </div>
        </div>
      </nav>

      {/* Mobile pane switcher */}
      <div className="lg:hidden sticky top-[57px] z-40 bg-[#f8f8f8]/95 backdrop-blur border-b border-black/10 px-4 py-2 flex gap-2" role="tablist" aria-label="ส่วนของห้องเขียน">
        {([["books", "เล่ม", Library], ["write", "เขียน", PenLine], ["notes", "โน้ต", StickyNote]] as const).map(([k, label, Icon]) => (
          <button key={k} role="tab" aria-selected={pane === k} onClick={() => setPane(k)}
            className={`flex-1 flex items-center justify-center gap-1.5 text-xs px-3 py-2 rounded-xl border ${pane === k ? "btn-brand border-transparent font-semibold" : "border-black/10 text-slate-600 bg-white"}`}>
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      <main className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6 grid lg:grid-cols-[290px_1fr_340px] gap-5 items-start">
        {/* ── left: books + TOC ── */}
        <aside className={`${pane === "books" ? "" : "hidden"} lg:block space-y-4`}>
          <section className="card-premium rounded-3xl p-4">
            <div className="eyebrow-brand mb-3">เล่มใหม่</div>
            <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="ชื่อเล่ม" className="input mb-2" aria-label="ชื่อเล่ม" />
            <div className="grid grid-cols-2 gap-2 mb-2">
              <select value={newLang} onChange={(e) => setNewLang(e.target.value as "th" | "en")} className="input" aria-label="ภาษาของเล่ม">
                <option value="th">ไทย</option><option value="en">English</option>
              </select>
              <input value={newTarget} onChange={(e) => setNewTarget(e.target.value)} type="number" min={0} inputMode="numeric" placeholder="เป้าหมายคำ" className="input" aria-label="เป้าหมายคำ" />
            </div>
            <button onClick={() => void onCreateBook()} className="btn-brand w-full py-2 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5"><Plus className="w-4 h-4" /> สร้างเล่ม</button>
          </section>

          <section className="card-premium rounded-3xl p-2">
            <div className="eyebrow-brand px-2 pt-2 mb-2">เล่มทั้งหมด ({books.length})</div>
            {books.length === 0 && <p className="text-xs text-faint px-2 pb-3">ยังไม่มีเล่ม — สร้างด้านบน</p>}
            <ul className="space-y-1" aria-label="รายการเล่ม">
              {books.map((b) => (
                <li key={b.id}>
                  <div className={`flex items-center gap-2 rounded-xl px-3 py-2 ${b.id === bookId ? "bg-[#3c74d4]/15 border border-[#1d4ed8]/25" : "hover:bg-black/[0.03]"}`}>
                    <button onClick={() => { setBookId(b.id); setPane("write"); }} className="flex-1 text-left min-w-0" aria-current={b.id === bookId ? "true" : undefined}>
                      <div className="text-sm font-medium truncate">{b.title}</div>
                      <div className="text-[0.65rem] text-faint">{STATUS_LABEL[b.status]} · {b.lang.toUpperCase()}</div>
                    </button>
                    <DeleteButton onDelete={() => void onDeleteBook(b.id)} what={`เล่ม ${b.title}`} idleClass="text-faint hover:text-red-700 p-1" armedClass="text-[10px] font-semibold px-2 py-1 rounded-lg bg-red-50 border border-red-500/60 text-red-700 whitespace-nowrap" />
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {book && (
            <section className="card-premium rounded-3xl p-2">
              <div className="flex items-center justify-between px-2 pt-2 mb-2">
                <div className="eyebrow-brand">สารบัญ · {book.title}</div>
                <button onClick={() => void onAddChapter()} className="text-xs text-[#1d4ed8] hover:text-[#1e40af] flex items-center gap-1" aria-label="เพิ่มบท"><Plus className="w-3.5 h-3.5" /> เพิ่มบท</button>
              </div>
              <ol className="space-y-1" aria-label="สารบัญ">
                {chapters.map((c, i) => (
                  <li key={c.id} className={`flex items-center gap-1 rounded-xl px-2 py-1.5 ${c.id === chapterId ? "bg-[#3c74d4]/15 border border-[#1d4ed8]/25" : "hover:bg-black/[0.03]"}`}>
                    <button onClick={() => { setChapterId(c.id); setPane("write"); }} className="flex-1 text-left text-sm min-w-0 truncate" aria-current={c.id === chapterId ? "true" : undefined}>
                      <span className="text-faint font-mono text-[0.65rem] mr-1.5">{i + 1}</span>{c.title || "(ไม่มีชื่อ)"}
                    </button>
                    <button onClick={() => void onMove(c.id, "up")} className="text-faint hover:text-[#111827] p-0.5" aria-label={`เลื่อน ${c.title} ขึ้น`}><ChevronUp className="w-3.5 h-3.5" /></button>
                    <button onClick={() => void onMove(c.id, "down")} className="text-faint hover:text-[#111827] p-0.5" aria-label={`เลื่อน ${c.title} ลง`}><ChevronDown className="w-3.5 h-3.5" /></button>
                    <DeleteButton onDelete={() => void onDeleteChapter(c.id)} what={`บท ${c.title}`} idleClass="text-faint hover:text-red-700 p-0.5" armedClass="text-[10px] font-semibold px-1.5 py-0.5 rounded-lg bg-red-50 border border-red-500/60 text-red-700 whitespace-nowrap" />
                  </li>
                ))}
              </ol>
            </section>
          )}
        </aside>

        {/* ── centre: editor ── */}
        <section className={`${pane === "write" ? "" : "hidden"} lg:block`}>
          {book && chapter ? (
            <ChapterEditor
              key={chapter.id}
              chapter={chapter}
              lang={book.lang}
              onSaved={async () => { if (bookId) await refreshChapters(bookId); }}
            />
          ) : (
            <div className="card-premium rounded-3xl p-10 text-center">
              <BookOpen className="w-10 h-10 mx-auto mb-3 text-[#1d4ed8]/40" />
              <p className="text-slate-700">{books.length ? "เลือกเล่มและบททางซ้ายเพื่อเริ่มเขียน" : "สร้างเล่มแรกเพื่อเริ่มเขียน"}</p>
              <p className="text-xs text-faint mt-2">บันทึกอัตโนมัติในเบราว์เซอร์ของคุณ — ไม่ขึ้นเซิร์ฟเวอร์</p>
            </div>
          )}
        </section>

        {/* ── right: book panel + notes ── */}
        <aside className={`${pane === "notes" ? "" : "hidden"} lg:block space-y-4`}>
          {book && (
            <section className="card-premium rounded-3xl p-4">
              <div className="eyebrow-brand mb-3">เล่มนี้</div>
              <input value={book.title} onChange={(e) => { const v = e.target.value; setBooks((bs) => bs.map((b) => (b.id === book.id ? { ...b, title: v } : b))); void updateBook(book.id, { title: v }); }} className="input mb-2 font-semibold" aria-label="ชื่อเล่ม (แก้ไข)" />
              <input value={book.author} onChange={(e) => { const v = e.target.value; setBooks((bs) => bs.map((b) => (b.id === book.id ? { ...b, author: v } : b))); void updateBook(book.id, { author: v }); }} placeholder="ผู้เขียน" className="input mb-2" aria-label="ผู้เขียน" />
              <div className="grid grid-cols-2 gap-2 mb-3">
                <select value={book.status} onChange={(e) => { const v = e.target.value as BookStatus; setBooks((bs) => bs.map((b) => (b.id === book.id ? { ...b, status: v } : b))); void updateBook(book.id, { status: v }); }} className="input" aria-label="สถานะเล่ม">
                  {(Object.keys(STATUS_LABEL) as BookStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </select>
                <input type="number" min={0} inputMode="numeric" value={book.targetWords || ""} placeholder="เป้าหมายคำ" onChange={(e) => { const v = Math.max(0, Number(e.target.value) || 0); setBooks((bs) => bs.map((b) => (b.id === book.id ? { ...b, targetWords: v } : b))); void updateBook(book.id, { targetWords: v }); }} className="input" aria-label="เป้าหมายคำของเล่ม" />
              </div>
              <div className="text-sm" data-testid="book-progress">
                <div className="flex justify-between text-xs text-faint mb-1">
                  <span>{bookWords === null ? "กำลังนับ…" : `${fmt(bookWords)} คำ · ${chapters.length} บท`}</span>
                  <span>{progress === null ? (book.targetWords ? "" : "ยังไม่ตั้งเป้า") : `${progress}%`}</span>
                </div>
                <div className="h-2 rounded-full bg-black/10 overflow-hidden" aria-hidden="true">
                  <div className="h-full bg-[#3c74d4] transition-all" style={{ width: `${Math.min(100, progress ?? 0)}%` }} />
                </div>
                <p className="text-[0.65rem] text-faint mt-1">คำ ÷ เป้าหมาย × 100 — นับด้วยตัวตัดคำเดียวกับตัววิเคราะห์ ไม่มีคะแนน &quot;ความเร็ว&quot;</p>
              </div>

              <div className="rule-brand my-4" />
              <div className="eyebrow-brand mb-2">ส่งต่อ</div>
              <div className="space-y-2">
                <button onClick={() => void compileAndAnalyze()} className="w-full text-xs py-2 rounded-xl border border-[#1d4ed8]/30 text-[#1d4ed8] hover:bg-[#3c74d4]/10 flex items-center justify-center gap-1.5"><Search className="w-3.5 h-3.5" /> รวมเล่มเป็นต้นฉบับ → วิเคราะห์</button>
                <button onClick={exportEpub} className="w-full text-xs py-2 rounded-xl border border-black/10 text-slate-700 hover:bg-black/[0.04] flex items-center justify-center gap-1.5"><BookDown className="w-3.5 h-3.5" /> ดาวน์โหลด EPUB</button>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => downloadBlob(`${book.title}.md`, exportMarkdown(book, chapters), "text/markdown")} className="text-xs py-2 rounded-xl border border-black/10 text-slate-700 hover:bg-black/[0.04] flex items-center justify-center gap-1.5"><FileDown className="w-3.5 h-3.5" /> .md</button>
                  <button onClick={() => downloadBlob(`${book.title}.txt`, exportText(book, chapters), "text/plain")} className="text-xs py-2 rounded-xl border border-black/10 text-slate-700 hover:bg-black/[0.04] flex items-center justify-center gap-1.5"><FileDown className="w-3.5 h-3.5" /> .txt</button>
                </div>
                <button onClick={sendCodex} className="w-full text-xs py-2 rounded-xl border border-[#1d4ed8]/30 text-[#1d4ed8] hover:bg-[#3c74d4]/10 flex items-center justify-center gap-1.5"><Wand2 className="w-3.5 h-3.5" /> ส่งโน้ตเข้า Story Codex</button>
                <p className="text-[0.65rem] text-faint">Codex รับเฉพาะโน้ตประเภท ตัวละคร · สถานที่ · สิ่งของ · ปมค้าง — บรรทัด &quot;อยาก: …&quot; / &quot;เสียง: …&quot; ในโน้ตตัวละครกลายเป็น trait</p>
              </div>
            </section>
          )}

          {book && <NotesPanel bookId={book.id} notes={notes} onChange={() => void refreshNotes(book.id)} />}
        </aside>
      </main>
    </div>
  );
}

// ── editor (remounted per chapter via key) ─────────────────────────────
function ChapterEditor({ chapter, lang, onSaved }: { chapter: WritingChapter; lang: "th" | "en"; onSaved: () => Promise<void> }) {
  const [title, setTitle] = useState(chapter.title);
  const [content, setContent] = useState(chapter.content);
  const [state, setState] = useState<"idle" | "dirty" | "saving" | "saved">("idle");
  const [words, setWords] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ title, content });
  latest.current = { title, content };

  const recount = useCallback(async (text: string) => setWords(await countManuscriptWords({ lang, text })), [lang]);
  useEffect(() => { void recount(chapter.content); }, [chapter.content, recount]);

  const persist = useCallback(async () => {
    setState("saving");
    const { title: t, content: c } = latest.current;
    await updateChapter(chapter.id, { title: t, content: c });
    await recount(c);
    await onSaved();
    setState("saved");
  }, [chapter.id, onSaved, recount]);

  const schedule = () => {
    setState("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void persist(); }, AUTOSAVE_MS);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <div className="card-premium rounded-3xl p-4 sm:p-6" data-testid="chapter-editor" data-chapter-id={chapter.id}>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-xs text-faint flex items-center gap-1" aria-live="polite">
          {state === "idle" && "ยังไม่มีการแก้ไข"}
          {state === "dirty" && <><span className="text-[#92400e]" aria-hidden="true">●</span> ยังไม่บันทึก — จะบันทึกอัตโนมัติ</>}
          {state === "saving" && <><Loader2 className="w-3 h-3 animate-spin" /> กำลังบันทึก…</>}
          {state === "saved" && <><Check className="w-3 h-3 text-[#166534]" /> บันทึกแล้ว</>}
        </span>
        <button onClick={() => { if (timer.current) clearTimeout(timer.current); void persist(); }} disabled={state === "idle" || state === "saving"} className="ml-auto text-xs px-3 py-1.5 rounded-lg border border-black/10 text-slate-700 hover:bg-black/[0.04] disabled:opacity-50 flex items-center gap-1.5">
          <Save className="w-3.5 h-3.5" /> บันทึกเดี๋ยวนี้
        </button>
      </div>
      <input value={title} onChange={(e) => { setTitle(e.target.value); schedule(); }} placeholder="ชื่อบท" className="w-full text-lg font-semibold bg-transparent outline-none border-b border-transparent focus:border-[#1d4ed8]/40 py-1 mb-2" aria-label="ชื่อบท" />
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-faint border-y border-black/10 py-2 mb-3" data-testid="chapter-counts">
        <span>{words === null ? "…" : fmt(words)} คำ</span>
        <span>{fmt(content.length)} ตัวอักษร</span>
        <span className="text-slate-600">{lang === "th" ? "นับด้วยตัวตัดคำไทย" : "นับด้วย tokenizer อังกฤษ"}</span>
      </div>
      <textarea value={content} onChange={(e) => { setContent(e.target.value); schedule(); }} placeholder="เริ่มพิมพ์เรื่องราวของคุณ… ระบบบันทึกอัตโนมัติเมื่อหยุดพิมพ์ 1.2 วินาที" className="w-full min-h-[440px] leading-relaxed text-[15px] bg-transparent outline-none resize-y" aria-label="เนื้อหาบท" />
    </div>
  );
}

// ── notes ────────────────────────────────────────────────────────────────
function NotesPanel({ bookId, notes, onChange }: { bookId: string; notes: WritingNote[]; onChange: () => void }) {
  const [type, setType] = useState<NoteType>("CHARACTER");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [filter, setFilter] = useState<"ALL" | NoteType>("ALL");
  const shown = filter === "ALL" ? notes : notes.filter((n) => n.type === filter);

  async function add() {
    if (!title.trim()) { toast("ใส่ชื่อโน้ตก่อน", { variant: "error" }); return; }
    await addNote({ bookId, type, title, content });
    setTitle(""); setContent("");
    onChange();
  }
  return (
    <section className="card-premium rounded-3xl p-4">
      <div className="eyebrow-brand mb-3">โน้ต ({notes.length})</div>
      <div className="grid grid-cols-[1fr_auto] gap-2 mb-2">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={type === "CHARACTER" ? "ชื่อตัวละคร" : "หัวข้อโน้ต"} className="input" aria-label="ชื่อโน้ต" />
        <select value={type} onChange={(e) => setType(e.target.value as NoteType)} className="input w-auto" aria-label="ประเภทโน้ต">
          {NOTE_TYPES.map((t) => <option key={t} value={t}>{NOTE_META[t].label}</option>)}
        </select>
      </div>
      <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder={type === "CHARACTER" ? "บรรทัดแรก = คำอธิบาย\nอยาก: …\nเสียง: …" : "รายละเอียด"} className="input min-h-[72px] resize-y mb-2" aria-label="รายละเอียดโน้ต" />
      <button onClick={() => void add()} className="btn-brand w-full py-2 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 mb-3"><Plus className="w-4 h-4" /> เพิ่มโน้ต</button>

      <div className="flex flex-wrap gap-1 mb-2">
        {(["ALL", ...NOTE_TYPES] as const).map((t) => (
          <button key={t} onClick={() => setFilter(t)} aria-pressed={filter === t} className={`text-[0.65rem] px-2 py-0.5 rounded-full border ${filter === t ? "border-[#1d4ed8] text-[#1d4ed8] bg-[#3c74d4]/10" : "border-black/10 text-slate-600"}`}>
            {t === "ALL" ? "ทั้งหมด" : NOTE_META[t].label}
          </button>
        ))}
      </div>
      <ul className="space-y-2 max-h-[420px] overflow-y-auto" aria-label="รายการโน้ต">
        {shown.length === 0 && <li className="text-xs text-faint py-3 text-center">ยังไม่มีโน้ต</li>}
        {shown.map((n) => (
          <li key={n.id} className="rounded-xl border border-black/10 bg-white p-2.5">
            <div className="flex items-start gap-2">
              <span className={`text-[0.6rem] px-1.5 py-px rounded border ${NOTE_META[n.type].codexSection ? "border-[#1d4ed8]/40 text-[#1d4ed8]" : "border-black/10 text-slate-600"}`}>{NOTE_META[n.type].label}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{n.title}</div>
                {n.content && <div className="text-xs text-slate-600 whitespace-pre-line line-clamp-4">{n.content}</div>}
              </div>
              <button onClick={async () => { await updateNote(n.id, { pinned: !n.pinned }); onChange(); }} className={`p-1 ${n.pinned ? "text-[#1d4ed8]" : "text-faint hover:text-[#111827]"}`} aria-label={n.pinned ? "เลิกปักหมุด" : "ปักหมุด"} aria-pressed={n.pinned}>
                {n.pinned ? <Pin className="w-3.5 h-3.5" /> : <PinOff className="w-3.5 h-3.5" />}
              </button>
              <DeleteButton onDelete={async () => { await deleteNote(n.id); onChange(); }} what={`โน้ต ${n.title}`} idleClass="text-faint hover:text-red-700 p-1" armedClass="text-[10px] font-semibold px-1.5 py-0.5 rounded-lg bg-red-50 border border-red-500/60 text-red-700 whitespace-nowrap" />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
