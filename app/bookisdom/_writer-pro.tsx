"use client";

import { useEffect, useMemo, useState } from "react";
import { Camera, RotateCcw, Volume2, Square, LayoutTemplate, Send, Plus, ChevronLeft, ChevronRight, Activity } from "lucide-react";
import { toast } from "./_toast";
import { DeleteButton } from "./_ui";
import {
  takeSnapshot, listSnapshots, restoreSnapshot, deleteSnapshot,
  listPlotLines, addPlotLine, renamePlotLine, deletePlotLine, listPlotCards, addPlotCard, updatePlotCard, deletePlotCard, applyTemplate,
  plotToOutline, sendOutlineToPromptTool, heatmapWeeks, heatLevel, HEAT_BUCKETS,
  type ChapterSnapshot, type PlotLine, type PlotCard, type WritingDay,
} from "./_writing-store";
import { STORY_TEMPLATES } from "@/lib/bookisdom-engine/story-templates";

// ╔══════════════════════════════════════════════════════════════════╗
// ║  Writer Room "Pro" panels — absorbed from InkStudio Pro, rebuilt   ║
// ║  on Bookisdom's rules: every number is a count from the engine's  ║
// ║  own analyzers (no readability "grade", no badge), templates are   ║
// ║  conventions the writer lays down by choice, speech is the device's║
// ║  own voice (no server TTS), and nothing leaves the browser.        ║
// ╚══════════════════════════════════════════════════════════════════╝

const fmt = (n: number) => n.toLocaleString("en-US");
const fmtWhen = (t: number) => new Date(t).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });

// ── snapshots ────────────────────────────────────────────────────────────
export function SnapshotPanel({ chapterId, onRestored }: { chapterId: string; onRestored: () => void }) {
  const [snaps, setSnaps] = useState<ChapterSnapshot[]>([]);
  const [label, setLabel] = useState("");
  const refresh = async () => setSnaps(await listSnapshots(chapterId));
  useEffect(() => { void refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [chapterId]);
  return (
    <div className="mt-4 border-t border-black/10 pt-3" data-testid="snapshot-panel">
      <div className="flex items-center gap-2 mb-2">
        <span className="eyebrow-brand">เวอร์ชันของบท ({snaps.length})</span>
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="ป้ายกำกับ (ไม่บังคับ)" className="input ml-auto max-w-[180px] text-xs py-1" aria-label="ป้ายกำกับเวอร์ชัน" />
        <button onClick={async () => { const s = await takeSnapshot(chapterId, label); setLabel(""); await refresh(); if (s) toast(`บันทึกเวอร์ชันแล้ว (${fmt(s.words)} คำ)`); }} className="text-xs px-2.5 py-1.5 rounded-lg border border-[#1d4ed8]/30 text-[#1d4ed8] hover:bg-[#3c74d4]/10 flex items-center gap-1.5">
          <Camera className="w-3.5 h-3.5" /> บันทึกเวอร์ชัน
        </button>
      </div>
      {snaps.length === 0 ? <p className="text-[0.7rem] text-faint">ยังไม่มีเวอร์ชัน — บันทึกก่อนแก้ครั้งใหญ่ แล้วย้อนกลับได้ทุกเมื่อ (การย้อนกลับจะบันทึกข้อความปัจจุบันไว้ก่อนเสมอ)</p> : (
        <ul className="space-y-1 max-h-40 overflow-y-auto" aria-label="รายการเวอร์ชัน">
          {snaps.map((s) => (
            <li key={s.id} className="flex items-center gap-2 text-xs rounded-lg px-2 py-1.5 hover:bg-black/[0.03]">
              <span className="text-faint font-mono">{fmtWhen(s.createdAt)}</span>
              <span className="flex-1 truncate">{s.label || <span className="text-faint">(ไม่มีป้าย)</span>}</span>
              <span className="text-faint tabular-nums">{fmt(s.words)} คำ</span>
              <button onClick={async () => { await restoreSnapshot(s.id); await refresh(); onRestored(); toast("ย้อนกลับแล้ว — ข้อความก่อนหน้าถูกเก็บเป็นเวอร์ชัน \"ก่อนย้อนกลับ\""); }} className="text-[#1d4ed8] hover:text-[#1e40af] p-1 flex items-center gap-1" aria-label={`ย้อนกลับไปเวอร์ชัน ${s.label || fmtWhen(s.createdAt)}`}><RotateCcw className="w-3.5 h-3.5" /></button>
              <DeleteButton onDelete={async () => { await deleteSnapshot(s.id); await refresh(); }} what={`เวอร์ชัน ${s.label || fmtWhen(s.createdAt)}`} idleClass="text-faint hover:text-red-700 p-1" armedClass="text-[10px] font-semibold px-1.5 py-0.5 rounded-lg bg-red-50 border border-red-500/60 text-red-700 whitespace-nowrap" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── in-place analysis (Bookisdom's own analyzers) ────────────────────────
interface Row { tier: "ประจักษ์" | "อนุมาน"; label: string; value: string }
export function ChapterAnalysis({ text, lang, codexNames }: { text: string; lang: "th" | "en"; codexNames: string[] }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [lists, setLists] = useState<{ title: string; items: string[] }[]>([]);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const { countNames } = await import("@/lib/bookisdom-engine/text-util");
      const out: Row[] = []; const ls: { title: string; items: string[] }[] = [];
      if (lang === "th") {
        const { analyzeThai } = await import("@/lib/bookisdom-engine/thai-analyzer");
        const a = analyzeThai(text);
        out.push({ tier: "ประจักษ์", label: "คำ", value: fmt(a.wordCount) }, { tier: "ประจักษ์", label: "คำไม่ซ้ำ", value: fmt(a.uniqueWords) }, { tier: "ประจักษ์", label: "อนุประโยค", value: fmt(a.sentences.count) },
          { tier: "อนุมาน", label: "คำ/อนุประโยค (เฉลี่ย)", value: String(a.sentences.avgWords) }, { tier: "อนุมาน", label: "จังหวะ CV (stdev÷mean)", value: a.rhythm.cv.toFixed(2) },
          { tier: "ประจักษ์", label: "บรรทัดบทพูด", value: fmt(a.dialogue.lines) }, { tier: "ประจักษ์", label: "คำบอกอารมณ์", value: fmt(a.telling.count) }, { tier: "ประจักษ์", label: "คลิเช AI (จับคู่รายการ)", value: fmt(a.aiTells.reduce((s, t) => s + t.count, 0)) });
        ls.push({ title: "คำซ้ำบ่อย", items: a.echoes.slice(0, 6).map((e) => `${e.word} ×${e.count}`) }, { title: "ซ้ำในช่วงสั้น", items: a.nearRepeats.slice(0, 6).map((e) => `${e.word} ×${e.count}`) }, { title: "กลไก", items: a.mechanics.map((m) => `${m.issue} ×${m.count}`) });
      } else {
        const { analyzeProse } = await import("@/lib/bookisdom-engine/prose-analyzer");
        const a = analyzeProse(text);
        out.push({ tier: "ประจักษ์", label: "words", value: fmt(a.wordCount) }, { tier: "ประจักษ์", label: "unique", value: fmt(a.uniqueWords) }, { tier: "ประจักษ์", label: "sentences", value: fmt(a.sentences.count) },
          { tier: "อนุมาน", label: "words/sentence", value: String(a.sentences.avgWords) }, { tier: "อนุมาน", label: "rhythm CV", value: a.rhythm.cv.toFixed(2) },
          { tier: "ประจักษ์", label: "adverbs (-ly)", value: fmt(a.adverbs.count) }, { tier: "ประจักษ์", label: "named emotions", value: fmt(a.telling.count) }, { tier: "ประจักษ์", label: "slop phrases", value: fmt(a.slop.reduce((s, t) => s + t.count, 0)) });
        ls.push({ title: "echoes", items: a.echoes.slice(0, 6).map((e) => `${e.word} ×${e.count}`) }, { title: "filter words", items: a.filterWords.slice(0, 6).map((e) => `${e.word} ×${e.count}`) }, { title: "mechanics", items: a.mechanics.map((m) => `${m.issue} ×${m.count}`) });
      }
      if (codexNames.length) {
        const m = countNames(text, codexNames, lang);
        ls.push({ title: "การเอ่ยถึงจาก Codex", items: Array.from(m.entries()).map(([n, c]) => `${n} ×${c}`) });
      }
      setRows(out); setLists(ls);
    } finally { setBusy(false); }
  }

  return (
    <div className="mt-4 border-t border-black/10 pt-3" data-testid="chapter-analysis">
      <div className="flex items-center gap-2 mb-2">
        <span className="eyebrow-brand">วิเคราะห์บทนี้</span>
        <button onClick={() => void run()} disabled={busy || !text.trim()} className="ml-auto text-xs px-2.5 py-1.5 rounded-lg border border-[#1d4ed8]/30 text-[#1d4ed8] hover:bg-[#3c74d4]/10 disabled:opacity-50 flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5" /> {busy ? "กำลังนับ…" : rows ? "นับใหม่" : "นับสัญญาณ"}
        </button>
      </div>
      {!rows ? <p className="text-[0.7rem] text-faint">ตัววิเคราะห์ตัวเดียวกับหน้าเครื่องมือ — นับได้เท่านั้น ไม่มีเกรด &quot;อ่านง่าย&quot; หรือคะแนน</p> : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {rows.map((r) => (
              <div key={r.label} className="rounded-lg bg-black/[0.03] border border-black/10 p-2">
                <div className="text-[0.6rem] text-faint flex justify-between"><span>{r.label}</span><span className={r.tier === "ประจักษ์" ? "text-[#166534]" : "text-[#075985]"}>{r.tier}</span></div>
                <div className="text-lg font-semibold tabular-nums">{r.value}</div>
              </div>
            ))}
          </div>
          <div className="grid sm:grid-cols-2 gap-2 mt-2 text-xs">
            {lists.filter((l) => l.items.length).map((l) => (
              <div key={l.title}><div className="text-faint mb-0.5">{l.title}</div><div className="flex flex-wrap gap-1">{l.items.map((it) => <span key={it} className="px-1.5 py-0.5 rounded bg-[#eff6ff] text-[#1d4ed8] border border-[#1d4ed8]/20">{it}</span>)}</div></div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── local speech (the device's voices — no server) ───────────────────────
export function SpeakButton({ text, lang }: { text: string; lang: "th" | "en" }) {
  const [speaking, setSpeaking] = useState(false);
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;
  useEffect(() => () => { if (supported) window.speechSynthesis.cancel(); }, [supported]);
  if (!supported) return null;
  function start() {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === "th" ? "th-TH" : "en-US";
    const v = window.speechSynthesis.getVoices().find((x) => x.lang.toLowerCase().startsWith(lang === "th" ? "th" : "en"));
    if (v) u.voice = v;
    u.onend = () => setSpeaking(false); u.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(u);
  }
  return speaking ? (
    <button onClick={() => { window.speechSynthesis.cancel(); setSpeaking(false); }} className="text-xs px-2.5 py-1.5 rounded-lg border border-black/10 text-slate-700 hover:bg-black/[0.04] flex items-center gap-1.5" aria-label="หยุดอ่านออกเสียง"><Square className="w-3.5 h-3.5" /> หยุด</button>
  ) : (
    <button onClick={start} disabled={!text.trim()} title="ใช้เสียงที่ติดตั้งในเครื่องคุณ — คุณภาพขึ้นกับอุปกรณ์" className="text-xs px-2.5 py-1.5 rounded-lg border border-black/10 text-slate-700 hover:bg-black/[0.04] disabled:opacity-50 flex items-center gap-1.5" aria-label="อ่านออกเสียง"><Volume2 className="w-3.5 h-3.5" /> ฟัง</button>
  );
}

// ── heatmap ──────────────────────────────────────────────────────────────
const HEAT_FILL = ["#f3f4f6", "rgba(60,116,212,0.22)", "rgba(60,116,212,0.45)", "rgba(60,116,212,0.72)", "#3c74d4"];
export function WritingHeatmap({ days }: { days: WritingDay[] }) {
  const weeks = useMemo(() => heatmapWeeks(days), [days]);
  const total = days.reduce((s, d) => s + d.words, 0);
  const CELL = 11, GAP = 3;
  return (
    <div data-testid="heatmap">
      <div className="flex items-baseline justify-between mb-1">
        <span className="eyebrow-brand">คำที่เขียน 26 สัปดาห์</span>
        <span className="text-xs text-faint tabular-nums">{fmt(total)} คำ</span>
      </div>
      <svg width={weeks.length * (CELL + GAP)} height={7 * (CELL + GAP)} role="img" aria-label={`แผนที่การเขียน ${fmt(total)} คำใน 26 สัปดาห์`} className="max-w-full">
        {weeks.map((w, x) => w.map((d, y) => (
          <rect key={d.date} x={x * (CELL + GAP)} y={y * (CELL + GAP)} width={CELL} height={CELL} rx={2} fill={d.future ? "transparent" : HEAT_FILL[heatLevel(d.words)]} stroke={d.future ? "#e5e7eb" : "none"}>
            <title>{d.date}: {fmt(d.words)} คำ</title>
          </rect>
        )))}
      </svg>
      <div className="flex items-center gap-1 text-[0.6rem] text-faint mt-1">
        <span>น้อย</span>{HEAT_FILL.map((f, i) => <span key={i} className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: f }} title={`${HEAT_BUCKETS[i]}${i < 4 ? `–${HEAT_BUCKETS[i + 1] - 1}` : "+"} คำ`} />)}<span>มาก</span>
        <span className="ml-auto">ช่วง: 0 · 1–249 · 250–499 · 500–999 · 1000+ — นับเฉพาะคำที่เพิ่มขึ้นระหว่างบันทึก</span>
      </div>
    </div>
  );
}

// ── plot board ───────────────────────────────────────────────────────────
export function PlotBoard({ bookId }: { bookId: string }) {
  const [lines, setLines] = useState<PlotLine[]>([]);
  const [cards, setCards] = useState<PlotCard[]>([]);
  const [tpl, setTpl] = useState(STORY_TEMPLATES[2].id);
  const [scenes, setScenes] = useState("12");
  const [adding, setAdding] = useState<{ lineId: string; col: number } | null>(null);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const refresh = async () => { setLines(await listPlotLines(bookId)); setCards(await listPlotCards(bookId)); };
  useEffect(() => { void refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [bookId]);

  const cols = Math.max(6, cards.reduce((m, c) => Math.max(m, c.colIndex + 1), 0));
  async function submitAdd() {
    if (!adding || !draft.trim()) { setAdding(null); return; }
    await addPlotCard(adding.lineId, adding.col, draft); setDraft(""); setAdding(null); await refresh();
  }
  function sendOutline() {
    const text = plotToOutline(lines, cards);
    if (!text) { toast("ผังยังว่าง — วางเทมเพลตหรือเพิ่มการ์ดก่อน", { variant: "error" }); return; }
    const r = sendOutlineToPromptTool(text);
    toast(r.ok ? "ส่งผังเป็น outline ให้เครื่องมือ prompt แล้ว — เปิดเครื่องมือเพื่อใช้" : `ส่งไม่สำเร็จ: ${r.reason}`, { variant: r.ok ? "info" : "error", duration: 6000 });
  }
  const t = STORY_TEMPLATES.find((x) => x.id === tpl)!;

  return (
    <div className="card-premium rounded-3xl p-4" data-testid="plot-board">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="eyebrow-brand">ผังเรื่อง</span>
        <span className="text-[0.65rem] text-faint">{lines.length} เส้น · {cards.length} การ์ด · {cols} ฉาก</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select value={tpl} onChange={(e) => setTpl(e.target.value)} className="input w-auto text-xs py-1" aria-label="เทมเพลตโครงเรื่อง">
            {STORY_TEMPLATES.map((s) => <option key={s.id} value={s.id}>{s.emoji} {s.nameTh} ({s.beats.length} จังหวะ)</option>)}
          </select>
          <input value={scenes} onChange={(e) => setScenes(e.target.value)} type="number" min={1} className="input w-20 text-xs py-1" aria-label="จำนวนฉาก" title="จำนวนฉาก (คอลัมน์)" />
          <button onClick={async () => { const l = await applyTemplate(bookId, tpl, Number(scenes) || undefined); await refresh(); if (l) toast(`วาง "${t.nameTh}" เป็นเส้นเรื่องใหม่แล้ว`); }} className="text-xs px-2.5 py-1.5 rounded-lg border border-[#1d4ed8]/30 text-[#1d4ed8] hover:bg-[#3c74d4]/10 flex items-center gap-1.5"><LayoutTemplate className="w-3.5 h-3.5" /> วางโครง</button>
          <button onClick={async () => { await addPlotLine(bookId, ""); await refresh(); }} className="text-xs px-2.5 py-1.5 rounded-lg border border-black/10 text-slate-700 hover:bg-black/[0.04] flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" /> เส้นเรื่อง</button>
          <button onClick={sendOutline} className="btn-brand text-xs px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5"><Send className="w-3.5 h-3.5" /> ส่งผังเป็น outline</button>
        </div>
      </div>
      <p className="text-[0.65rem] text-faint mb-3">{t.tagline} · เหมาะกับ {t.bestFor} · {t.sceneMap} — โครงเป็นธรรมเนียม ไม่ใช่กฎ และไม่มีการให้คะแนนว่าเรื่องของคุณ &quot;ตรงโครง&quot; แค่ไหน</p>
      {lines.length === 0 ? <p className="text-sm text-faint py-6 text-center">ยังไม่มีเส้นเรื่อง — วางโครงจากเทมเพลต หรือเพิ่มเส้นเรื่องเปล่า</p> : (
        <div className="overflow-x-auto">
          <table className="border-separate border-spacing-1 min-w-full">
            <thead><tr><th className="text-left text-[0.65rem] text-faint font-normal px-1 w-36">เส้นเรื่อง</th>{Array.from({ length: cols }, (_, i) => <th key={i} className="text-[0.65rem] text-faint font-normal min-w-[150px]">ฉาก {i + 1}</th>)}</tr></thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id}>
                  <td className="align-top px-1 py-1">
                    <input value={l.title} onChange={(e) => { const v = e.target.value; setLines((ls) => ls.map((x) => (x.id === l.id ? { ...x, title: v } : x))); void renamePlotLine(l.id, v); }} className="w-full text-xs font-semibold bg-transparent outline-none border-b border-transparent focus:border-[#1d4ed8]/40" aria-label={`ชื่อเส้นเรื่อง ${l.title}`} />
                    <DeleteButton onDelete={async () => { await deletePlotLine(l.id); await refresh(); }} what={`เส้นเรื่อง ${l.title}`} idleClass="text-faint hover:text-red-700 p-0.5 mt-1" armedClass="text-[10px] font-semibold px-1.5 py-0.5 rounded-lg bg-red-50 border border-red-500/60 text-red-700 whitespace-nowrap mt-1" />
                  </td>
                  {Array.from({ length: cols }, (_, col) => (
                    <td key={col} className="align-top rounded-lg bg-black/[0.02] border border-black/5 p-1 min-h-[56px]">
                      {cards.filter((c) => c.plotLineId === l.id && c.colIndex === col).map((c) => (
                        <div key={c.id} className="rounded-lg bg-white border border-black/10 p-1.5 mb-1 text-xs">
                          {editing === c.id ? (
                            <div>
                              <input defaultValue={c.title} onBlur={async (e) => { await updatePlotCard(c.id, { title: e.target.value }); await refresh(); }} className="input text-xs py-0.5 mb-1" aria-label="ชื่อการ์ด" />
                              <textarea defaultValue={c.description} onBlur={async (e) => { await updatePlotCard(c.id, { description: e.target.value }); setEditing(null); await refresh(); }} className="input text-xs py-0.5 min-h-[48px]" aria-label="รายละเอียดการ์ด" />
                            </div>
                          ) : (
                            <button onClick={() => setEditing(c.id)} className="text-left w-full" aria-label={`แก้การ์ด ${c.title}`}>
                              <div className="font-medium">{c.title}</div>
                              {c.description && <div className="text-[0.65rem] text-slate-600 line-clamp-3">{c.description}</div>}
                            </button>
                          )}
                          <div className="flex items-center gap-0.5 mt-1">
                            <button onClick={async () => { await updatePlotCard(c.id, { colIndex: Math.max(0, c.colIndex - 1) }); await refresh(); }} className="text-faint hover:text-[#111827] p-0.5" aria-label="เลื่อนการ์ดไปซ้าย"><ChevronLeft className="w-3 h-3" /></button>
                            <button onClick={async () => { await updatePlotCard(c.id, { colIndex: c.colIndex + 1 }); await refresh(); }} className="text-faint hover:text-[#111827] p-0.5" aria-label="เลื่อนการ์ดไปขวา"><ChevronRight className="w-3 h-3" /></button>
                            <span className="ml-auto"><DeleteButton onDelete={async () => { await deletePlotCard(c.id); await refresh(); }} what={`การ์ด ${c.title}`} idleClass="text-faint hover:text-red-700 p-0.5" armedClass="text-[10px] font-semibold px-1.5 py-0.5 rounded-lg bg-red-50 border border-red-500/60 text-red-700 whitespace-nowrap" /></span>
                          </div>
                        </div>
                      ))}
                      {adding && adding.lineId === l.id && adding.col === col ? (
                        <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void submitAdd(); if (e.key === "Escape") setAdding(null); }} onBlur={() => void submitAdd()} placeholder="ชื่อการ์ด ↵" className="input text-xs py-0.5" aria-label="ชื่อการ์ดใหม่" />
                      ) : (
                        <button onClick={() => { setAdding({ lineId: l.id, col }); setDraft(""); }} className="w-full text-[0.65rem] text-faint hover:text-[#1d4ed8] py-0.5" aria-label={`เพิ่มการ์ดใน ${l.title} ฉาก ${col + 1}`}>+</button>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
