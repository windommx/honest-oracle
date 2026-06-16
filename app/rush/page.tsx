"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Crown,
  Loader2,
  AlertCircle,
  Download,
  Square,
  BookOpen,
  Play,
  Sparkles,
  Trash2,
  RotateCw,
} from "lucide-react";
import {
  BOOK_TYPES,
  buildArchitecture,
  type Architecture,
  type BookConfig,
  type BookTypeKey,
} from "@/lib/rush-engine/engine";

type Status = "waiting" | "writing" | "analyzing" | "revising" | "done" | "error";
type ChapterState = {
  number: number;
  purpose: string;
  status: Status;
  content: string;
};
type SavedBook = {
  id: string;
  title: string;
  type: string;
  subGenre: string;
  updatedAt: string;
  _count: { chapters: number };
};
type AnalysisResult = {
  overall_pass: boolean;
  issues: string[];
  revision_mode: string;
  specific_fixes: string[];
};

const VOICES = ["conversational", "academic", "inspirational", "practical", "storytelling", "witty"];
const CITATIONS = ["APA", "MLA", "Chicago", "inline", "none"];

function titleCase(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function carryForwardSummary(content: string): string {
  const trimmed = content.trim();
  if (trimmed.length <= 900) return trimmed;
  return "…" + trimmed.slice(-900);
}

class StopError extends Error {}

export default function RushPage() {
  const [type, setType] = useState<BookTypeKey>("nonfiction");
  const [subGenre, setSubGenre] = useState<string>(BOOK_TYPES.nonfiction.sub_genres[0]);
  const [title, setTitle] = useState("");
  const [thesis, setThesis] = useState("");
  const [reader, setReader] = useState("");
  const [voice, setVoice] = useState("conversational");
  const [chapters, setChapters] = useState(BOOK_TYPES.nonfiction.default_chapters);
  const [wordsPerChapter, setWordsPerChapter] = useState(BOOK_TYPES.nonfiction.default_words);
  const [citationStyle, setCitationStyle] = useState("inline");
  const [language, setLanguage] = useState<BookConfig["language"]>("thai");
  const [qualityPass, setQualityPass] = useState(true);

  const [running, setRunning] = useState(false);
  const [chapterStates, setChapterStates] = useState<ChapterState[]>([]);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [bookId, setBookId] = useState<string | null>(null);
  const [books, setBooks] = useState<SavedBook[]>([]);

  const stopRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const bibleRef = useRef("");

  const config: BookConfig = useMemo(
    () => ({
      type,
      title: title || "Untitled",
      thesis: thesis || "No thesis specified",
      reader: reader || "General audience",
      voice,
      chapters,
      wordsPerChapter,
      subGenre,
      citationStyle,
      language,
    }),
    [type, title, thesis, reader, voice, chapters, wordsPerChapter, subGenre, citationStyle, language]
  );

  const totalWords = chapters * wordsPerChapter;
  const doneCount = chapterStates.filter((c) => c.status === "done").length;
  const hasOutput = chapterStates.some((c) => c.content.trim());
  const incomplete = chapterStates.length > 0 && doneCount < chapterStates.length;

  useEffect(() => {
    refreshBooks();
  }, []);

  async function refreshBooks() {
    try {
      const res = await fetch("/api/rush/books");
      if (res.ok) {
        const data = await res.json();
        setBooks(data.books ?? []);
      }
    } catch {
      /* ignore */
    }
  }

  function selectType(key: BookTypeKey) {
    setType(key);
    const t = BOOK_TYPES[key];
    setSubGenre(t.sub_genres[0]);
    setChapters(t.default_chapters);
    setWordsPerChapter(t.default_words);
  }

  function setChapterStatus(i: number, status: Status) {
    setChapterStates((prev) => prev.map((c, j) => (j === i ? { ...c, status } : c)));
  }
  function appendChapterContent(i: number, delta: string) {
    setChapterStates((prev) => prev.map((c, j) => (j === i ? { ...c, content: c.content + delta } : c)));
  }
  function resetChapterContent(i: number) {
    setChapterStates((prev) => prev.map((c, j) => (j === i ? { ...c, content: "" } : c)));
  }

  // ── API calls ──────────────────────────────────────────────

  async function streamWrite(
    idx: number,
    extra: Record<string, unknown>,
    signal: AbortSignal,
    onDelta: (t: string) => void
  ): Promise<string> {
    const res = await fetch("/api/rush/write", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config, chapterIndex: idx, ...extra }),
      signal,
    });
    if (!res.ok || !res.body) {
      const data = await res.json().catch(() => ({ error: "Request failed" }));
      throw new Error(data.error || `Server error (${res.status})`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let full = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      if (chunk.includes("[[RUSH_ERROR]]")) {
        throw new Error(chunk.split("[[RUSH_ERROR]]")[1]?.trim() || "Generation failed");
      }
      full += chunk;
      onDelta(chunk);
    }
    return full;
  }

  async function analyze(draft: string, signal: AbortSignal): Promise<AnalysisResult | null> {
    try {
      const res = await fetch("/api/rush/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config, draft }),
        signal,
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.result as AnalysisResult;
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") throw e;
      return null; // analysis is best-effort; don't fail the chapter
    }
  }

  async function digest(chapterNumber: number, content: string, signal: AbortSignal): Promise<string> {
    try {
      const res = await fetch("/api/rush/digest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config, storyBible: bibleRef.current, chapterNumber, chapterContent: content }),
        signal,
      });
      if (!res.ok) return bibleRef.current;
      const data = await res.json();
      return (data.bible as string) || bibleRef.current;
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") throw e;
      return bibleRef.current;
    }
  }

  async function saveChapter(id: string, number: number, content: string) {
    try {
      await fetch(`/api/rush/books/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapter: { number, status: "done", content }, storyBible: bibleRef.current }),
      });
    } catch {
      /* best-effort */
    }
  }

  // ── Orchestration ──────────────────────────────────────────

  async function generate(resume: boolean) {
    if (running) return;
    setError("");
    setNotice("");
    setRunning(true);
    stopRef.current = false;

    const arch: Architecture = buildArchitecture(config);

    let id = bookId;
    if (!resume) {
      bibleRef.current = "";
      setChapterStates(
        arch.chapters.map((c) => ({ number: c.number, purpose: c.purpose, status: "waiting", content: "" }))
      );
      try {
        const res = await fetch("/api/rush/books", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ config }),
        });
        if (res.ok) {
          id = (await res.json()).id as string;
          setBookId(id);
        } else if (res.status === 401) {
          setError("กรุณาเข้าสู่ระบบก่อนใช้งาน");
          setRunning(false);
          return;
        }
      } catch {
        setNotice("บันทึกอัตโนมัติไม่พร้อมใช้งาน — จะเขียนต่อโดยไม่บันทึก");
      }
    }

    // Resume from the first chapter that isn't done.
    const states = resume
      ? chapterStates
      : arch.chapters.map((c) => ({ number: c.number, purpose: c.purpose, status: "waiting" as Status, content: "" }));
    const startIndex = Math.max(0, states.findIndex((c) => c.status !== "done"));
    let previousSummary: string | undefined =
      startIndex > 0 ? carryForwardSummary(states[startIndex - 1].content) : undefined;

    let currentIdx = startIndex;
    try {
      for (let i = startIndex; i < arch.chapters.length; i++) {
        if (stopRef.current) break;
        if (states[i] && states[i].status === "done") continue;

        currentIdx = i;
        setActiveIdx(i);
        const controller = new AbortController();
        abortRef.current = controller;

        // ── DRAFT ──
        resetChapterContent(i);
        setChapterStatus(i, "writing");
        let content = await streamWrite(
          i,
          { previousSummary, storyBible: bibleRef.current },
          controller.signal,
          (d) => appendChapterContent(i, d)
        );

        // ── QUALITY GATE (analyze → revise once) ──
        if (qualityPass && !stopRef.current) {
          setChapterStatus(i, "analyzing");
          const result = await analyze(content, controller.signal);
          if (result && !result.overall_pass) {
            setChapterStatus(i, "revising");
            resetChapterContent(i);
            const feedback =
              `ISSUES:\n- ${result.issues.join("\n- ")}\n\nSPECIFIC FIXES:\n- ${result.specific_fixes.join("\n- ")}`;
            content = await streamWrite(
              i,
              {
                mode: "revise",
                draft: content,
                feedback,
                revisionMode: result.revision_mode,
                storyBible: bibleRef.current,
              },
              controller.signal,
              (d) => appendChapterContent(i, d)
            );
          }
        }

        setChapterStatus(i, "done");
        setChapterStates((prev) => prev.map((c, j) => (j === i ? { ...c, content } : c)));
        previousSummary = carryForwardSummary(content);

        // ── CONTINUITY: update story bible for the next chapter ──
        if (!stopRef.current) {
          bibleRef.current = await digest(arch.chapters[i].number, content, controller.signal);
        }
        if (id) await saveChapter(id, arch.chapters[i].number, content);
      }
    } catch (e) {
      if (e instanceof StopError || (e instanceof DOMException && e.name === "AbortError")) {
        setNotice("หยุดการเขียนแล้ว — กด Continue เพื่อเขียนต่อจากบทที่ค้าง");
        setChapterStatus(currentIdx, "waiting");
      } else {
        setError(e instanceof Error ? e.message : "Generation failed");
        setChapterStatus(currentIdx, "error");
      }
    } finally {
      abortRef.current = null;
      setRunning(false);
      setActiveIdx(null);
      refreshBooks();
    }
  }

  function stop() {
    stopRef.current = true;
    abortRef.current?.abort();
  }

  async function loadBook(id: string) {
    if (running) return;
    setError("");
    setNotice("");
    try {
      const res = await fetch(`/api/rush/books/${id}`);
      if (!res.ok) throw new Error("โหลดหนังสือไม่สำเร็จ");
      const { book } = await res.json();
      const cfg = book.config as BookConfig;
      setType(cfg.type);
      setSubGenre(cfg.subGenre);
      setTitle(cfg.title === "Untitled" ? "" : cfg.title);
      setThesis(cfg.thesis === "No thesis specified" ? "" : cfg.thesis);
      setReader(cfg.reader === "General audience" ? "" : cfg.reader);
      setVoice(cfg.voice);
      setChapters(cfg.chapters);
      setWordsPerChapter(cfg.wordsPerChapter);
      setCitationStyle(cfg.citationStyle);
      setLanguage(cfg.language);
      bibleRef.current = book.storyBible ?? "";
      setBookId(book.id);

      const arch = buildArchitecture(cfg);
      const byNumber = new Map<number, { status: string; content: string }>();
      for (const ch of book.chapters) byNumber.set(ch.number, ch);
      setChapterStates(
        arch.chapters.map((c) => {
          const saved = byNumber.get(c.number);
          return {
            number: c.number,
            purpose: c.purpose,
            status: (saved?.status as Status) ?? "waiting",
            content: saved?.content ?? "",
          };
        })
      );
      setNotice("โหลดหนังสือแล้ว — กด Continue เพื่อเขียนต่อ");
    } catch (e) {
      setError(e instanceof Error ? e.message : "โหลดไม่สำเร็จ");
    }
  }

  async function deleteBook(id: string) {
    try {
      await fetch(`/api/rush/books/${id}`, { method: "DELETE" });
      if (bookId === id) {
        setBookId(null);
        setChapterStates([]);
      }
      refreshBooks();
    } catch {
      /* ignore */
    }
  }

  function newBook() {
    setBookId(null);
    setChapterStates([]);
    bibleRef.current = "";
    setNotice("");
    setError("");
  }

  function downloadBook() {
    const header = `# ${config.title}\n\n_${BOOK_TYPES[config.type].label} · ${titleCase(config.subGenre)} · ${config.chapters} chapters_\n\n`;
    const body = chapterStates
      .filter((c) => c.content.trim())
      .map((c) => c.content.trim())
      .join("\n\n---\n\n");
    const blob = new Blob([header + body], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(config.title || "book").replace(/[^\w\- ]+/g, "").trim() || "book"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-[#08080e]">
      <nav className="fixed top-0 left-0 right-0 z-50 glass-card">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2">
            <Crown className="w-7 h-7 text-[#c9a84c]" />
            <span className="text-lg font-semibold gold-gradient">NaraSuite</span>
          </Link>
          <div className="flex items-center gap-2 text-sm text-gray-300">
            <BookOpen className="w-4 h-4 text-[#c9a84c]" />
            Rush Engine
          </div>
        </div>
      </nav>

      <div className="pt-24 pb-16 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="mb-6 flex items-end justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-3xl font-bold gold-gradient">Rush Engine — Universal Book Generator</h1>
              <p className="text-gray-400 mt-2 text-sm">
                เขียนหนังสือทั้งเล่มจริงด้วย Claude ทีละบท · มี quality pass, story-bible continuity และบันทึก/เขียนต่อได้
              </p>
            </div>
          </div>

          <div className="grid lg:grid-cols-[380px_1fr] gap-6">
            {/* CONFIG */}
            <aside className="glass-card rounded-2xl p-6 h-fit">
              <h2 className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-3">Book Type</h2>
              <div className="grid grid-cols-2 gap-2 mb-6">
                {(Object.keys(BOOK_TYPES) as BookTypeKey[]).map((key) => {
                  const t = BOOK_TYPES[key];
                  const active = type === key;
                  return (
                    <button
                      key={key}
                      onClick={() => selectType(key)}
                      disabled={running}
                      className={`p-3 rounded-xl border text-center transition-colors disabled:opacity-50 ${
                        active ? "border-[#c9a84c] bg-[#c9a84c]/10" : "border-white/10 bg-white/5 hover:border-[#c9a84c]/40"
                      }`}
                    >
                      <div className="text-2xl">{t.icon}</div>
                      <div className={`text-xs mt-1 ${active ? "text-[#c9a84c]" : "text-gray-400"}`}>{t.label}</div>
                    </button>
                  );
                })}
              </div>

              <Field label="Sub-Genre">
                <select value={subGenre} onChange={(e) => setSubGenre(e.target.value)} disabled={running} className="input">
                  {BOOK_TYPES[type].sub_genres.map((g) => (
                    <option key={g} value={g}>
                      {titleCase(g)}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Title / Working Title">
                <input value={title} onChange={(e) => setTitle(e.target.value)} disabled={running} placeholder="e.g. The Deep Work Method" className="input" />
              </Field>

              <Field label="Thesis / Core Idea">
                <textarea value={thesis} onChange={(e) => setThesis(e.target.value)} disabled={running} placeholder="Main argument or premise..." className="input min-h-[64px] resize-y" />
              </Field>

              <Field label="Target Reader">
                <input value={reader} onChange={(e) => setReader(e.target.value)} disabled={running} placeholder="e.g. Thai professionals, 25-40" className="input" />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Author Voice">
                  <select value={voice} onChange={(e) => setVoice(e.target.value)} disabled={running} className="input">
                    {VOICES.map((v) => (
                      <option key={v} value={v}>
                        {titleCase(v)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Language">
                  <select value={language} onChange={(e) => setLanguage(e.target.value as BookConfig["language"])} disabled={running} className="input">
                    <option value="thai">Thai (ภาษาไทย)</option>
                    <option value="english">English</option>
                    <option value="bilingual">Bilingual (TH/EN)</option>
                  </select>
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Chapters">
                  <input type="number" min={1} max={100} value={chapters} onChange={(e) => setChapters(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))} disabled={running} className="input" />
                </Field>
                <Field label="Words / Chapter">
                  <input type="number" min={100} max={15000} value={wordsPerChapter} onChange={(e) => setWordsPerChapter(Math.max(100, parseInt(e.target.value) || 100))} disabled={running} className="input" />
                </Field>
              </div>

              <Field label="Citation Style">
                <select value={citationStyle} onChange={(e) => setCitationStyle(e.target.value)} disabled={running} className="input">
                  {CITATIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>

              <label className="flex items-center gap-2 mt-3 mb-1 cursor-pointer select-none">
                <input type="checkbox" checked={qualityPass} onChange={(e) => setQualityPass(e.target.checked)} disabled={running} className="accent-[#c9a84c]" />
                <span className="text-xs text-gray-300 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-[#c9a84c]" />
                  Quality pass (analyze → auto-revise)
                </span>
              </label>

              <div className="grid grid-cols-3 gap-2 my-4">
                <Stat value={String(chapters)} label="Chapters" />
                <Stat value={totalWords >= 1000 ? `${Math.round(totalWords / 1000)}K` : String(totalWords)} label="Est. Words" />
                <Stat value={`${doneCount}/${chapterStates.length || chapters}`} label="Written" />
              </div>

              {!running ? (
                <div className="space-y-2">
                  {incomplete && bookId ? (
                    <button onClick={() => generate(true)} className="w-full py-3 bg-[#c9a84c] text-black font-semibold rounded-xl hover:bg-[#d4b96a] transition-colors flex items-center justify-center gap-2">
                      <RotateCw className="w-4 h-4" />
                      Continue ({doneCount}/{chapterStates.length})
                    </button>
                  ) : (
                    <button onClick={() => generate(false)} className="w-full py-3 bg-[#c9a84c] text-black font-semibold rounded-xl hover:bg-[#d4b96a] transition-colors flex items-center justify-center gap-2">
                      <Play className="w-4 h-4" />
                      Generate Book
                    </button>
                  )}
                  {chapterStates.length > 0 && (
                    <button onClick={newBook} className="w-full py-2 text-xs text-gray-400 hover:text-[#c9a84c] transition-colors">
                      + New book
                    </button>
                  )}
                </div>
              ) : (
                <button onClick={stop} className="w-full py-3 border border-red-500 text-red-400 font-semibold rounded-xl hover:bg-red-500 hover:text-black transition-colors flex items-center justify-center gap-2">
                  <Square className="w-4 h-4" />
                  Stop
                </button>
              )}

              {hasOutput && (
                <button onClick={downloadBook} className="w-full mt-2 py-2.5 border border-[#c9a84c]/30 text-[#c9a84c] rounded-xl hover:border-[#c9a84c] transition-colors flex items-center justify-center gap-2 text-sm">
                  <Download className="w-4 h-4" />
                  Download .md
                </button>
              )}

              {notice && <div className="mt-4 p-3 bg-[#c9a84c]/10 border border-[#c9a84c]/30 rounded-xl text-[#d4b96a] text-xs">{notice}</div>}
              {error && (
                <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-start gap-2 text-red-400 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {books.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-2">Saved Books</h3>
                  <div className="space-y-1.5">
                    {books.map((b) => (
                      <div key={b.id} className={`flex items-center justify-between gap-2 p-2 rounded-lg border text-xs ${bookId === b.id ? "border-[#c9a84c]/50 bg-[#c9a84c]/5" : "border-white/5 bg-white/5"}`}>
                        <button onClick={() => loadBook(b.id)} disabled={running} className="flex-1 text-left truncate disabled:opacity-50" title={b.title}>
                          <span className="text-gray-200">{b.title}</span>
                          <span className="text-gray-500 ml-1">· {b._count.chapters} ch</span>
                        </button>
                        <button onClick={() => deleteBook(b.id)} disabled={running} className="text-gray-600 hover:text-red-400 disabled:opacity-50" title="Delete">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </aside>

            {/* OUTPUT */}
            <main className="space-y-4">
              {chapterStates.length === 0 && (
                <div className="glass-card rounded-2xl p-10 text-center text-gray-500">
                  <BookOpen className="w-10 h-10 mx-auto mb-3 text-[#c9a84c]/40" />
                  <p>ตั้งค่าหนังสือทางซ้าย แล้วกด Generate Book เพื่อเริ่มเขียน</p>
                  <p className="text-xs mt-2 text-gray-600">แต่ละบทเขียนจริงด้วย Claude (claude-opus-4-8) และสตรีมแบบเรียลไทม์</p>
                </div>
              )}

              {chapterStates.map((c, i) => (
                <div key={c.number} className={`glass-card rounded-2xl overflow-hidden border ${activeIdx === i ? "border-[#c9a84c]/50" : "border-white/5"}`}>
                  <div className="flex items-center justify-between px-5 py-3 border-b border-white/5">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-sm font-semibold text-[#c9a84c] whitespace-nowrap">Ch. {c.number}</span>
                      <span className="text-xs text-gray-500 truncate">{c.purpose}</span>
                    </div>
                    <StatusBadge status={c.status} />
                  </div>
                  {c.content && (
                    <div className="p-5">
                      <pre className="whitespace-pre-wrap font-sans text-sm leading-7 text-gray-200">
                        {c.content}
                        {(c.status === "writing" || c.status === "revising") && <span className="animate-pulse text-[#c9a84c]">▋</span>}
                      </pre>
                    </div>
                  )}
                </div>
              ))}
            </main>
          </div>
        </div>
      </div>

      <style jsx>{`
        :global(.input) {
          width: 100%;
          padding: 8px 10px;
          background: #08080e;
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #f0ece4;
          font-size: 0.85rem;
          border-radius: 0.6rem;
          outline: none;
          transition: border-color 0.2s;
        }
        :global(.input:focus) {
          border-color: rgba(201, 168, 76, 0.6);
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <label className="block text-[0.7rem] text-gray-400 mb-1 tracking-wide">{label}</label>
      {children}
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="p-2 bg-white/5 rounded-lg text-center">
      <div className="text-lg font-bold text-[#c9a84c]">{value}</div>
      <div className="text-[0.6rem] text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: Status }) {
  const map: Record<Status, { text: string; cls: string; spin?: boolean }> = {
    waiting: { text: "Waiting", cls: "text-gray-600" },
    writing: { text: "Writing", cls: "text-[#c9a84c]", spin: true },
    analyzing: { text: "Analyzing", cls: "text-blue-400", spin: true },
    revising: { text: "Revising", cls: "text-purple-400", spin: true },
    done: { text: "✓ Done", cls: "text-green-400" },
    error: { text: "✗ Error", cls: "text-red-400" },
  };
  const s = map[status];
  return (
    <span className={`text-xs flex items-center gap-1 whitespace-nowrap ${s.cls}`}>
      {s.spin && <Loader2 className="w-3 h-3 animate-spin" />}
      {s.text}
    </span>
  );
}
