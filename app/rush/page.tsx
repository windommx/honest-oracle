"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Crown, Loader2, AlertCircle, Download, Square, BookOpen, Play } from "lucide-react";
import {
  BOOK_TYPES,
  buildArchitecture,
  type Architecture,
  type BookConfig,
  type BookTypeKey,
} from "@/lib/rush-engine/engine";

type ChapterState = {
  number: number;
  title: string;
  purpose: string;
  status: "waiting" | "writing" | "done" | "error";
  content: string;
};

const VOICES = ["conversational", "academic", "inspirational", "practical", "storytelling", "witty"];
const CITATIONS = ["APA", "MLA", "Chicago", "inline", "none"];

function titleCase(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function carryForwardSummary(content: string): string {
  // Cheap, deterministic carry-forward: tail of the chapter as continuity anchor.
  const trimmed = content.trim();
  if (trimmed.length <= 900) return trimmed;
  return "…" + trimmed.slice(-900);
}

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

  const [running, setRunning] = useState(false);
  const [chapterStates, setChapterStates] = useState<ChapterState[]>([]);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [stopFlag, setStopFlag] = useState({ stop: false });

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

  function selectType(key: BookTypeKey) {
    setType(key);
    const t = BOOK_TYPES[key];
    setSubGenre(t.sub_genres[0]);
    setChapters(t.default_chapters);
    setWordsPerChapter(t.default_words);
  }

  async function writeChapter(
    arch: Architecture,
    idx: number,
    previousSummary: string | undefined,
    onDelta: (text: string) => void
  ): Promise<string> {
    const res = await fetch("/api/rush/write", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config, chapterIndex: idx, previousSummary }),
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
        const msg = chunk.split("[[RUSH_ERROR]]")[1]?.trim() || "Generation failed";
        throw new Error(msg);
      }
      full += chunk;
      onDelta(chunk);
    }
    return full;
  }

  async function generate() {
    if (running) return;
    setError("");
    setRunning(true);
    const flag = { stop: false };
    setStopFlag(flag);

    const arch = buildArchitecture(config);
    const initial: ChapterState[] = arch.chapters.map((c) => ({
      number: c.number,
      title: `Chapter ${c.number}`,
      purpose: c.purpose,
      status: "waiting",
      content: "",
    }));
    setChapterStates(initial);

    let previousSummary: string | undefined;

    try {
      for (let i = 0; i < arch.chapters.length; i++) {
        if (flag.stop) break;
        setActiveIdx(i);
        setChapterStates((prev) =>
          prev.map((c, j) => (j === i ? { ...c, status: "writing" } : c))
        );

        let content = "";
        try {
          content = await writeChapter(arch, i, previousSummary, (delta) => {
            setChapterStates((prev) =>
              prev.map((c, j) => (j === i ? { ...c, content: c.content + delta } : c))
            );
          });
          setChapterStates((prev) =>
            prev.map((c, j) => (j === i ? { ...c, status: "done" } : c))
          );
          previousSummary = carryForwardSummary(content);
        } catch (chErr) {
          setChapterStates((prev) =>
            prev.map((c, j) => (j === i ? { ...c, status: "error" } : c))
          );
          throw chErr;
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setRunning(false);
      setActiveIdx(null);
    }
  }

  function stop() {
    stopFlag.stop = true;
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

  const doneCount = chapterStates.filter((c) => c.status === "done").length;
  const hasOutput = chapterStates.some((c) => c.content.trim());

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
          <div className="mb-8">
            <h1 className="text-3xl font-bold gold-gradient">Rush Engine — Universal Book Generator</h1>
            <p className="text-gray-400 mt-2 text-sm">
              เลือกประเภทหนังสือ ตั้งค่ารายละเอียด แล้วให้ Claude เขียนทั้งเล่มทีละบท (เขียนจริงผ่าน API)
            </p>
          </div>

          <div className="grid lg:grid-cols-[380px_1fr] gap-6">
            {/* CONFIG */}
            <aside className="glass-card rounded-2xl p-6 h-fit">
              <h2 className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-3">
                Book Type
              </h2>
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
                        active
                          ? "border-[#c9a84c] bg-[#c9a84c]/10"
                          : "border-white/10 bg-white/5 hover:border-[#c9a84c]/40"
                      }`}
                    >
                      <div className="text-2xl">{t.icon}</div>
                      <div className={`text-xs mt-1 ${active ? "text-[#c9a84c]" : "text-gray-400"}`}>
                        {t.label}
                      </div>
                    </button>
                  );
                })}
              </div>

              <Field label="Sub-Genre">
                <select
                  value={subGenre}
                  onChange={(e) => setSubGenre(e.target.value)}
                  disabled={running}
                  className="input"
                >
                  {BOOK_TYPES[type].sub_genres.map((g) => (
                    <option key={g} value={g}>
                      {titleCase(g)}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Title / Working Title">
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={running}
                  placeholder="e.g. The Deep Work Method"
                  className="input"
                />
              </Field>

              <Field label="Thesis / Core Idea">
                <textarea
                  value={thesis}
                  onChange={(e) => setThesis(e.target.value)}
                  disabled={running}
                  placeholder="Main argument or premise..."
                  className="input min-h-[64px] resize-y"
                />
              </Field>

              <Field label="Target Reader">
                <input
                  value={reader}
                  onChange={(e) => setReader(e.target.value)}
                  disabled={running}
                  placeholder="e.g. Thai professionals, 25-40"
                  className="input"
                />
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
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value as BookConfig["language"])}
                    disabled={running}
                    className="input"
                  >
                    <option value="thai">Thai (ภาษาไทย)</option>
                    <option value="english">English</option>
                    <option value="bilingual">Bilingual (TH/EN)</option>
                  </select>
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Chapters">
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={chapters}
                    onChange={(e) => setChapters(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
                    disabled={running}
                    className="input"
                  />
                </Field>
                <Field label="Words / Chapter">
                  <input
                    type="number"
                    min={100}
                    max={15000}
                    value={wordsPerChapter}
                    onChange={(e) => setWordsPerChapter(Math.max(100, parseInt(e.target.value) || 100))}
                    disabled={running}
                    className="input"
                  />
                </Field>
              </div>

              <Field label="Citation Style">
                <select
                  value={citationStyle}
                  onChange={(e) => setCitationStyle(e.target.value)}
                  disabled={running}
                  className="input"
                >
                  {CITATIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>

              <div className="grid grid-cols-3 gap-2 my-4">
                <Stat value={String(chapters)} label="Chapters" />
                <Stat value={totalWords >= 1000 ? `${Math.round(totalWords / 1000)}K` : String(totalWords)} label="Est. Words" />
                <Stat value={String(doneCount)} label="Written" />
              </div>

              {!running ? (
                <button
                  onClick={generate}
                  className="w-full py-3 bg-[#c9a84c] text-black font-semibold rounded-xl hover:bg-[#d4b96a] transition-colors flex items-center justify-center gap-2"
                >
                  <Play className="w-4 h-4" />
                  Generate Book
                </button>
              ) : (
                <button
                  onClick={stop}
                  className="w-full py-3 border border-red-500 text-red-400 font-semibold rounded-xl hover:bg-red-500 hover:text-black transition-colors flex items-center justify-center gap-2"
                >
                  <Square className="w-4 h-4" />
                  Stop after current chapter
                </button>
              )}

              {hasOutput && (
                <button
                  onClick={downloadBook}
                  className="w-full mt-2 py-2.5 border border-[#c9a84c]/30 text-[#c9a84c] rounded-xl hover:border-[#c9a84c] transition-colors flex items-center justify-center gap-2 text-sm"
                >
                  <Download className="w-4 h-4" />
                  Download .md
                </button>
              )}

              {error && (
                <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-start gap-2 text-red-400 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}
            </aside>

            {/* OUTPUT */}
            <main className="space-y-4">
              {chapterStates.length === 0 && (
                <div className="glass-card rounded-2xl p-10 text-center text-gray-500">
                  <BookOpen className="w-10 h-10 mx-auto mb-3 text-[#c9a84c]/40" />
                  <p>ตั้งค่าหนังสือทางซ้าย แล้วกด Generate Book เพื่อเริ่มเขียน</p>
                  <p className="text-xs mt-2 text-gray-600">
                    แต่ละบทจะถูกเขียนจริงด้วย Claude (claude-opus-4-8) และสตรีมแบบเรียลไทม์
                  </p>
                </div>
              )}

              {chapterStates.map((c, i) => (
                <div
                  key={c.number}
                  className={`glass-card rounded-2xl overflow-hidden border ${
                    activeIdx === i ? "border-[#c9a84c]/50" : "border-white/5"
                  }`}
                >
                  <div className="flex items-center justify-between px-5 py-3 border-b border-white/5">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-[#c9a84c]">Ch. {c.number}</span>
                      <span className="text-xs text-gray-500">{c.purpose}</span>
                    </div>
                    <StatusBadge status={c.status} />
                  </div>
                  {c.content && (
                    <div className="p-5">
                      <pre className="whitespace-pre-wrap font-[Inter] text-sm leading-7 text-gray-200">
                        {c.content}
                        {c.status === "writing" && <span className="animate-pulse text-[#c9a84c]">▋</span>}
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

function StatusBadge({ status }: { status: ChapterState["status"] }) {
  if (status === "writing")
    return (
      <span className="text-xs text-[#c9a84c] flex items-center gap-1">
        <Loader2 className="w-3 h-3 animate-spin" /> Writing
      </span>
    );
  if (status === "done") return <span className="text-xs text-green-400">✓ Done</span>;
  if (status === "error") return <span className="text-xs text-red-400">✗ Error</span>;
  return <span className="text-xs text-gray-600">Waiting</span>;
}
