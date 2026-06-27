"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Copy, Check, Download, Trash2 } from "lucide-react";
import { MODULE_CATALOG, MODULE_GROUPS, type BookConfig, type PromptGroup } from "@/lib/rush-engine/engine";
import { TH_MODULES } from "@/lib/rush-engine/th";
import { analyzeThai, tokenizeThai, formatThaiReport, thaiDeltas, scanThaiManuscript } from "@/lib/rush-engine/thai-analyzer";
import { analyzeProse, formatProseReport, proseDeltas, scanManuscript } from "@/lib/rush-engine/prose-analyzer";
import { wordDiff, diffTokens, type DiffOp } from "@/lib/rush-engine/text-util";
import { listManuscripts, getManuscript, saveManuscript, deleteManuscript, type StoredManuscript } from "./_manuscript-store";

export const GROUP_COLORS: Record<PromptGroup, string> = {
  core: "border-[#c9a84c] text-[#c9a84c]",
  craft: "border-green-400 text-green-400",
  nonfiction: "border-blue-400 text-blue-400",
  prose: "border-purple-400 text-purple-400",
  thai: "border-pink-400 text-pink-400",
  dialect: "border-rose-400 text-rose-400",
  marketing: "border-orange-400 text-orange-400",
  advanced: "border-cyan-400 text-cyan-400",
  agents: "border-emerald-400 text-emerald-400",
  nis: "border-red-400 text-red-400",
};

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <label className="block text-[0.7rem] text-gray-400 mb-1 tracking-wide">{label}</label>
      {children}
    </div>
  );
}

export function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="p-2 bg-white/5 rounded-lg text-center">
      <div className="text-lg font-bold text-[#c9a84c]">{value}</div>
      <div className="text-[0.6rem] text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}

function ReportActions({ report, filename }: { report: string; filename: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(report);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([report], { type: "text/markdown" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="flex gap-2">
      <button onClick={copy} className="inline-flex items-center gap-1.5 text-[0.65rem] px-2.5 py-1 rounded border border-[#c9a84c]/40 text-[#c9a84c] hover:bg-[#c9a84c]/10">
        {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
        {copied ? "คัดลอกแล้ว / Copied" : "Copy report"}
      </button>
      <button onClick={download} className="inline-flex items-center gap-1.5 text-[0.65rem] px-2.5 py-1 rounded border border-[#c9a84c]/40 text-[#c9a84c] hover:bg-[#c9a84c]/10">
        <Download className="w-3 h-3" />
        Download .md
      </button>
    </div>
  );
}

type Delta = { label: string; before: number; after: number; delta: number; good: "lower" | "higher" | "neutral" };

function DeltaTable({ title, deltas, note }: { title: string; deltas: Delta[]; note: string }) {
  return (
    <div className="mt-4">
      <h3 className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-2">{title}</h3>
      <div className="rounded-lg border border-white/10 overflow-hidden">
        {deltas.map((d) => {
          const improved = d.good === "lower" ? d.delta < 0 : d.good === "higher" ? d.delta > 0 : null;
          const color = d.delta === 0 || improved === null ? "text-gray-400" : improved ? "text-green-400" : "text-red-400";
          return (
            <div key={d.label} className="flex items-center justify-between px-3 py-1.5 text-xs border-b border-white/5 last:border-0">
              <span className="text-gray-300">{d.label}</span>
              <span className="flex items-center gap-2">
                <span className="text-gray-500">{d.before} → {d.after}</span>
                <span className={`w-12 text-right tabular-nums ${color}`}>{d.delta > 0 ? `+${d.delta}` : d.delta}</span>
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-[0.6rem] text-gray-500 mt-1">{note}</p>
    </div>
  );
}

function Heatmap({ title, headers, rows, note, onRowClick }: {
  title: string;
  headers: string[];
  rows: { title: string; cells: { value: number; bad?: boolean }[] }[];
  note: string;
  onRowClick?: (i: number) => void;
}) {
  return (
    <div className="mt-3">
      <h3 className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-2">{title}</h3>
      <div className="overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full text-[0.7rem]">
          <thead>
            <tr className="text-gray-500 border-b border-white/10">
              <th className="text-left px-2 py-1.5 font-medium">Chapter</th>
              {headers.map((h) => (
                <th key={h} className="px-2 py-1.5 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={`${r.title}-${i}`}
                onClick={onRowClick ? () => onRowClick(i) : undefined}
                className={`border-b border-white/5 last:border-0 ${onRowClick ? "cursor-pointer hover:bg-white/5" : ""}`}
              >
                <td className="text-left px-2 py-1 text-gray-300 truncate max-w-[160px]" title={r.title}>{r.title}</td>
                {r.cells.map((c, j) => (
                  <td key={j} className={`px-2 py-1 text-center tabular-nums ${c.bad ? "text-red-400 font-semibold" : "text-gray-400"}`}>{c.value}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[0.6rem] text-gray-500 mt-1">{note}</p>
    </div>
  );
}

function DiffView({ ops }: { ops: DiffOp[] | null }) {
  if (!ops) return <p className="text-[0.65rem] text-gray-500 mt-2">ข้อความยาวเกินไปสำหรับ inline diff — ดูที่ตาราง metric ด้านบน / Too long for inline diff.</p>;
  return (
    <div className="mt-2 text-xs leading-6 bg-[#08080e] border border-white/5 rounded-lg p-3 max-h-[200px] overflow-y-auto whitespace-pre-wrap">
      {ops.map((op, i) =>
        op.type === "same" ? (
          <span key={i} className="text-gray-500">{op.text} </span>
        ) : op.type === "add" ? (
          <span key={i} className="text-green-400 bg-green-400/10">{op.text} </span>
        ) : (
          <span key={i} className="text-red-400/80 line-through">{op.text} </span>
        )
      )}
    </div>
  );
}

function Mechanics({ items, title }: { items: { issue: string; count: number }[]; title: string }) {
  return (
    <div>
      <h3 className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-2">{title}</h3>
      {items.length === 0 ? (
        <p className="text-xs text-green-400">✓ —</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {items.map((mm) => (
            <span key={mm.issue} className="text-xs px-2 py-0.5 rounded border border-amber-400/40 text-amber-300">
              {mm.issue} ×{mm.count}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Saved-manuscript bar: load / save / delete named drafts in localStorage. */
function ManuscriptBar({ lang, text, onLoad }: { lang: "th" | "en"; text: string; onLoad: (t: string) => void }) {
  const [items, setItems] = useState<StoredManuscript[]>([]);
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("");
  const refresh = () => setItems(listManuscripts(lang));
  useEffect(refresh, [lang]);

  const load = (id: string) => {
    setSelected(id);
    const m = id ? getManuscript(id) : undefined;
    if (m) onLoad(m.text);
  };
  const save = () => {
    if (!text.trim()) return;
    const title = name.trim() || `${lang === "th" ? "ฉบับ" : "Draft"} ${new Date().toLocaleString()}`;
    const rec = saveManuscript({ title, lang, text });
    setName("");
    refresh();
    setSelected(rec.id);
  };
  const remove = () => {
    if (!selected) return;
    deleteManuscript(selected);
    setSelected("");
    refresh();
  };

  return (
    <div className="flex flex-wrap items-center gap-2 mb-2">
      <select
        value={selected}
        onChange={(e) => load(e.target.value)}
        aria-label={lang === "th" ? "โหลดฉบับที่บันทึก" : "Load saved manuscript"}
        className="text-xs bg-[#08080e] border border-white/10 rounded px-2 py-1 text-gray-300 max-w-[180px]"
      >
        <option value="">{lang === "th" ? `— โหลดฉบับ (${items.length}) —` : `— Load saved (${items.length}) —`}</option>
        {items.map((m) => (
          <option key={m.id} value={m.id}>{m.title}</option>
        ))}
      </select>
      {selected && (
        <button onClick={remove} className="text-[0.65rem] px-2 py-1 rounded border border-red-400/40 text-red-300 hover:bg-red-400/10" aria-label="Delete saved manuscript">
          <Trash2 className="w-3 h-3" />
        </button>
      )}
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={lang === "th" ? "ชื่อฉบับ…" : "name…"}
        className="text-xs bg-[#08080e] border border-white/10 rounded px-2 py-1 text-gray-300 w-28"
      />
      <button onClick={save} className="text-[0.65rem] px-2.5 py-1 rounded border border-[#c9a84c]/40 text-[#c9a84c] hover:bg-[#c9a84c]/10">
        {lang === "th" ? "บันทึกฉบับ" : "Save draft"}
      </button>
    </div>
  );
}

/** useState that persists to localStorage so a pasted draft survives reload. */
function usePersistedState(key: string): [string, (v: string) => void] {
  const [value, setValue] = useState("");
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(key);
      if (saved) setValue(saved);
    } catch {
      /* ignore */
    }
  }, [key]);
  const set = (v: string) => {
    setValue(v);
    try {
      window.localStorage.setItem(key, v);
    } catch {
      /* ignore */
    }
  };
  return [value, set];
}

/** Debounce only large inputs (>instantUnder chars) so analysis doesn't recompute
 *  on every keystroke for a pasted manuscript; short inputs update immediately. */
function useDebounced(value: string, ms = 200, instantUnder = 2000): string {
  const [v, setV] = useState(value);
  useEffect(() => {
    if (value.length < instantUnder) {
      setV(value);
      return;
    }
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms, instantUnder]);
  return v;
}

export function ThaiAnalyzerModal({ onClose, initialText }: { onClose: () => void; initialText?: string }) {
  const [text, setText] = usePersistedState("rush.analyzer.th");
  const [revised, setRevised] = useState("");
  useEffect(() => {
    if (initialText) setText(initialText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [showCompare, setShowCompare] = useState(false);
  const [showScan, setShowScan] = useState(false);
  const [copiedAudit, setCopiedAudit] = useState<string | null>(null);
  const dtext = useDebounced(text);
  const drevised = useDebounced(revised);
  const a = useMemo(() => (dtext.trim() ? analyzeThai(dtext) : null), [dtext]);
  const deltas = useMemo(
    () => (dtext.trim() && drevised.trim() ? thaiDeltas(analyzeThai(dtext), analyzeThai(drevised)) : null),
    [dtext, drevised]
  );
  const scan = useMemo(() => (dtext.trim() ? scanThaiManuscript(dtext) : []), [dtext]);
  const worst = useMemo(() => {
    if (scan.length < 2) return { aiTells: -1, cv: -1 };
    const argTells = scan.reduce((b, c, i) => (c.aiTells > scan[b].aiTells ? i : b), 0);
    const argCv = scan.reduce((b, c, i) => (c.cv < scan[b].cv ? i : b), 0);
    return { aiTells: scan[argTells].aiTells > 0 ? argTells : -1, cv: argCv };
  }, [scan]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Copy a NIS audit prompt with the analyzed text pre-filled into its placeholder —
  // closing the loop from a deterministic signal to its grounded LLM audit.
  const copyAudit = async (id: string) => {
    const build = TH_MODULES[id];
    if (!build) return;
    // Function replacer so `$` sequences in the pasted text aren't treated as
    // special replacement patterns ($&, $1, $$).
    const prompt = build({} as BookConfig).replace(/\[วางต้นฉบับที่นี่\]|\[วางข้อความที่นี่\]/, () => text.trim());
    await navigator.clipboard.writeText(prompt);
    setCopiedAudit(id);
    setTimeout(() => setCopiedAudit((c) => (c === id ? null : c)), 2000);
  };

  const AuditButton = ({ id, label }: { id: string; label: string }) => (
    <button
      onClick={() => copyAudit(id)}
      className="mt-2 inline-flex items-center gap-1.5 text-[0.65rem] px-2.5 py-1 rounded border border-red-400/40 text-red-300 hover:bg-red-400/10"
    >
      {copiedAudit === id ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
      {copiedAudit === id ? "คัดลอกแล้ว — วางใน LLM ได้เลย" : label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Thai Analyzer" className="glass-card rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6 border border-[#c9a84c]/30" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-bold gold-gradient">วิเคราะห์ภาษาไทย</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-3">
          เครื่องมือฝั่งเบราว์เซอร์ (ไม่เรียก AI) — นับคำด้วยตัวตัดคำไทย หาคำซ้ำ/echoes และสแกนคำคลิเชแบบ AI
        </p>
        <ManuscriptBar lang="th" text={text} onLoad={setText} />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="วางข้อความภาษาไทยที่นี่…"
          className="input min-h-[140px] resize-y"
        />
        <button onClick={() => setShowCompare((v) => !v)} className="mt-2 text-[0.7rem] text-[#c9a84c] hover:underline">
          {showCompare ? "− ซ่อนการเทียบฉบับแก้" : "+ เทียบฉบับแก้ (ก่อน → หลัง)"}
        </button>
        {showCompare && (
          <textarea
            value={revised}
            onChange={(e) => setRevised(e.target.value)}
            placeholder="วางฉบับที่แก้แล้วที่นี่ เพื่อดูว่าอะไรดีขึ้นจริง…"
            className="input min-h-[120px] resize-y mt-2"
          />
        )}
        {showCompare && deltas && (
          <>
            <DeltaTable title="ก่อน → หลัง" deltas={deltas} note="เขียว = ดีขึ้นจริงบน signal นั้น · เทา = metric กลาง เป็นการนับ ไม่ใช่คำตัดสินคุณภาพ" />
            <DiffView ops={diffTokens(tokenizeThai(text), tokenizeThai(revised), "")} />
          </>
        )}
        {scan.length > 1 && (
          <button onClick={() => setShowScan((v) => !v)} className="mt-2 ml-3 text-[0.7rem] text-[#c9a84c] hover:underline">
            {showScan ? "− ซ่อนสแกนรายบท" : `+ สแกนรายบท (${scan.length} บท)`}
          </button>
        )}
        {showScan && scan.length > 1 && (
          <Heatmap
            title="heatmap รายบท"
            headers={["คำ", "CV%", "บทพูด%", "บอกอารมณ์", "คลิเช", "echoes"]}
            rows={scan.map((c, i) => ({
              title: c.title,
              cells: [
                { value: c.words },
                { value: c.cv, bad: worst.cv === i },
                { value: c.dialogueRatio },
                { value: c.telling },
                { value: c.aiTells, bad: worst.aiTells === i },
                { value: c.echoes },
              ],
            }))}
            note="คลิกแถวเพื่อโหลดบทนั้นมาวิเคราะห์ + ปุ่ม audit. แดง = บทอ่อนสุดบน signal นั้น เป็นการนับ ไม่ใช่คำตัดสิน"
            onRowClick={(i) => {
              setText(scan[i].body);
              setShowScan(false);
            }}
          />
        )}
        {a && (
          <div className="mt-4 space-y-4 text-sm">
            <ReportActions report={formatThaiReport(a)} filename="thai-analysis.md" />
            <div className="grid grid-cols-3 gap-2">
              <Stat value={String(a.wordCount)} label="คำ" />
              <Stat value={String(a.uniqueWords)} label="คำไม่ซ้ำ" />
              <Stat value={String(a.charCount)} label="อักษร" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Stat value={String(a.sentences.count)} label="ประโยค" />
              <Stat value={String(a.sentences.avgWords)} label="คำ/ประโยค (เฉลี่ย)" />
              <Stat value={String(a.sentences.longest)} label="ประโยคยาวสุด (คำ)" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Stat value={`${a.rhythm.cv}%`} label="ความแปรผัน (CV)" />
              <Stat value={String(a.rhythm.stdev)} label="ส่วนเบี่ยงเบน" />
              <Stat value={String(a.rhythm.monotonyRun)} label="ประโยคยาวพอกันติดกัน" />
            </div>
            {a.sentences.count >= 4 && (a.rhythm.cv < 35 || a.rhythm.monotonyRun >= 5) && (
              <div>
                <p className="text-[0.65rem] text-cyan-300/80">
                  ⚠️ จังหวะค่อนข้างแบน — ความยาวประโยคใกล้เคียงกันมาก (CV {a.rhythm.cv}%
                  {a.rhythm.monotonyRun >= 5 ? ` · ยาวพอกัน ${a.rhythm.monotonyRun} ประโยคติด` : ""}). ลองสลับประโยคสั้น-ยาว
                </p>
                <AuditButton id="NIS_PACING" label="คัดลอก NIS Pacing audit + ข้อความนี้" />
              </div>
            )}
            <div className="grid grid-cols-3 gap-2">
              <Stat value={`${a.dialogue.ratio}%`} label="สัดส่วนบทพูด" />
              <Stat value={String(a.dialogue.lines)} label="บรรทัดบทพูด" />
              <Stat value={String(a.dialogue.talkingHeadRun)} label="พูดต่อเนื่องสุด" />
            </div>
            {(a.dialogue.talkingHeadRun >= 6 || a.dialogue.ratio > 70) && (
              <div>
                <p className="text-[0.65rem] text-orange-300/80">
                  ⚠️ {a.dialogue.talkingHeadRun >= 6 ? `บทพูดต่อเนื่อง ${a.dialogue.talkingHeadRun} บรรทัดโดยไม่มี action คั่น (talking-heads)` : ""}
                  {a.dialogue.ratio > 70 ? ` · บทพูด ${a.dialogue.ratio}% อาจมากเกินไป` : ""}
                </p>
                <AuditButton id="NIS_DIALOGUE" label="คัดลอก NIS Dialogue audit + ข้อความนี้" />
              </div>
            )}

            <div>
              <h3 className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-2">
                บอก vs แสดง — คำบอกอารมณ์ตรง ๆ ({a.telling.ratio}/100 คำ)
              </h3>
              {a.telling.words.length === 0 ? (
                <p className="text-xs text-green-400">✓ ไม่พบกริยากรอง/คำบอกอารมณ์ตรง ๆ</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {a.telling.words.slice(0, 20).map((t) => (
                      <span key={t.word} className="text-xs px-2 py-0.5 rounded border border-fuchsia-400/40 text-fuchsia-300">
                        {t.word} ×{t.count}
                      </span>
                    ))}
                  </div>
                  {a.telling.ratio >= 2 && (
                    <div className="mt-1.5">
                      <p className="text-[0.65rem] text-fuchsia-300/70">
                        ความหนาแน่นของคำ &quot;บอก&quot; ค่อนข้างสูง — ลองเปลี่ยนช่วงที่บอกตรง ๆ ให้ &quot;แสดง&quot;
                      </p>
                      <AuditButton id="NIS_SHOW" label="คัดลอก NIS Show-vs-Tell audit + ข้อความนี้" />
                    </div>
                  )}
                </>
              )}
            </div>

            <div>
              <h3 className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-2">AI-tell / คำคลิเช</h3>
              {a.aiTells.length === 0 ? (
                <p className="text-xs text-green-400">✓ ไม่พบคำคลิเชแบบ AI</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {a.aiTells.map((t) => (
                    <span key={t.phrase} className="text-xs px-2 py-0.5 rounded border border-red-500/40 text-red-400">
                      {t.phrase} ×{t.count}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h3 className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-2">คำซ้ำใกล้กัน (ภายใน 40 คำ)</h3>
              {a.nearRepeats.length === 0 ? (
                <p className="text-xs text-gray-500">— ไม่พบคำเนื้อหาที่ซ้ำใกล้กัน</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {a.nearRepeats.slice(0, 20).map((e) => (
                    <span key={e.word} className="text-xs px-2 py-0.5 rounded border border-yellow-400/40 text-yellow-300">
                      {e.word} ×{e.count}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h3 className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-2">คำซ้ำบ่อย (echoes ≥3)</h3>
              {a.echoes.length === 0 ? (
                <p className="text-xs text-gray-500">— ไม่มีคำเนื้อหาที่ซ้ำเกิน 3 ครั้ง</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {a.echoes.slice(0, 20).map((e) => (
                    <span key={e.word} className="text-xs px-2 py-0.5 rounded border border-orange-400/40 text-orange-300">
                      {e.word} ×{e.count}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <Mechanics items={a.mechanics} title="ข้อผิดพลาดเชิงกล" />

            <div>
              <h3 className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-2">คำที่ใช้บ่อยสุด</h3>
              <div className="flex flex-wrap gap-1.5">
                {a.topWords.map((w) => (
                  <span key={w.word} className="text-xs px-2 py-0.5 rounded border border-white/10 text-gray-300">
                    {w.word} ×{w.count}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function GuideModal({ onClose }: { onClose: () => void }) {
  const steps = [
    "ตั้งค่าหนังสือทางซ้าย (ประเภท / ชื่อ / แก่นเรื่อง / ผู้อ่าน / จำนวนบท) เปิด Extra Modules ที่ต้องการ แล้วกด Generate Prompts",
    "วางแผน: คัดลอก STRUCTURE ไปรันใน LLM เพื่อวางโครงเรื่องรายบท แล้ววางผลกลับในช่อง Outline",
    "ตั้ง MASTER เป็น system prompt ของ LLM (ใช้ตลอดทั้งเล่ม)",
    "ส่ง OVERVIEW หนึ่งครั้ง ให้โมเดลเข้าใจแผน + สร้างบล็อก STATE เริ่มต้น",
    "เขียนทีละบทด้วย CH_1, CH_2, … โมเดลจะออกบล็อก <<<STATE>>> ท้ายแต่ละบท",
    "คัดลอก <<<STATE>>> ล่าสุดมาวางในช่อง Story Bible / STATE แล้วกด Generate ใหม่ → ฉีดเข้าทุกบทอัตโนมัติ (continuity)",
    "ขัดเกลาด้วย ANALYSIS → REVISION, เก็บงานด้วย Front/Back Matter",
    "ตรวจร้อยแก้วฟรีก่อนส่ง LLM: กดปุ่ม วิเคราะห์ไทย / Prose (EN) หาจุดอ่อน แล้วกดคัดลอก NIS audit ที่เกี่ยวพร้อมข้อความ → วางใน LLM เจาะเฉพาะจุด",
    "ตอนจะตีพิมพ์ ใช้กลุ่ม Marketing (Title, Blurb, KDP Metadata, Submission Pack)",
  ];
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Rush Engine วิธีใช้" className="glass-card rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6 border border-[#c9a84c]/30" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold gold-gradient">Rush Engine — วิธีใช้</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-gray-300 mb-5">
          แพลตฟอร์มสร้าง <span className="text-[#c9a84c]">ชุด prompt</span> สำหรับแต่งหนังสือทุกประเภท คัดลอกไปใช้กับ LLM ตัวไหนก็ได้ (ChatGPT / Claude / Gemini) —
          ไม่ต้องมี API key ไม่มีค่า token
        </p>

        <h3 className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-2">เวิร์กโฟลว์แนะนำ</h3>
        <ol className="space-y-2 mb-5">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-3 text-sm text-gray-200">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#c9a84c]/15 text-[#c9a84c] text-xs flex items-center justify-center font-semibold">{i + 1}</span>
              <span className="leading-relaxed">{s}</span>
            </li>
          ))}
        </ol>

        <h3 className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-2">กลุ่ม Module เสริม</h3>
        <div className="space-y-1.5 mb-5">
          {MODULE_GROUPS.map((g) => (
            <div key={g.key} className="text-sm">
              <span className="text-[#c9a84c]">{g.label}</span>
              <span className="text-gray-500"> — {g.desc}</span>
            </div>
          ))}
        </div>

        <h3 className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-2">เลือก module อันไหน?</h3>
        <div className="space-y-2 mb-5 text-sm">
          {[
            { goal: "ทำให้ร้อยแก้วดีขึ้น", items: "Anti-Slop (ลบสำนวนกลาง ๆ แบบ AI) · Anti-Safe (กล้าเสี่ยง ไม่จบแบบเซฟ) · Line Edit (แก้ระดับประโยค) · Readability (คุมระดับความยาก)" },
            { goal: "ตรวจ/ประเมินดราฟต์", items: "Analysis (คะแนนรายบท) · Quality Gate (ผ่าน/ไม่ผ่านก่อนตีพิมพ์) · Feedback (สรุปส่งต่อบทถัดไป)" },
            { goal: "ตรวจต้นฉบับเชิงลึก (อ้างหลักฐาน)", items: "Narrative Intelligence (NIS) — Plot-hole/Continuity · Character · Pacing · Foreshadow · Dialogue · POV · Show-vs-Tell · Theme ทุก audit ต้องอ้างข้อความที่พิสูจน์ได้ (เปิดให้นิยายอัตโนมัติ)" },
            { goal: "ความต่อเนื่อง", items: "Story Bible/STATE (ฉีดทุกบท) · Worldbuilding Codex (สร้าง bible + ตรวจ) · Rolling Recap (สรุปต่อเนื่อง) · Series Bible (canon ข้ามเล่มสำหรับซีรีส์)" },
            { goal: "วางโครง/ตัวละคร", items: "Structure Outline (โครงทั้งเล่ม) · Character Voice/Arc · Scene Builder · Conflict Map (ความตึง)" },
            { goal: "หลายเอเจนต์ (ขั้นสูง)", items: "Agent Pack — ต้องมี multi-agent setup เอง (เช่น Claude Projects); ไม่ได้รันในแอปนี้" },
          ].map((r) => (
            <div key={r.goal}>
              <span className="text-[#c9a84c]">{r.goal}:</span>
              <span className="text-gray-400"> {r.items}</span>
            </div>
          ))}
        </div>

        <h3 className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-2">เครื่องมือวิเคราะห์ (ฟรี ไม่เรียก AI)</h3>
        <div className="space-y-2 mb-5 text-sm">
          <p className="text-gray-400">
            ปุ่ม <span className="text-[#c9a84c]">วิเคราะห์ไทย</span> และ <span className="text-[#c9a84c]">Prose (EN)</span> ที่หัวหน้าจอ —
            ตรวจร้อยแก้วฝั่งเบราว์เซอร์แบบ deterministic (วัดได้ โชว์ทุกคำที่ match ไม่ใช่คะแนนลอย ๆ)
          </p>
          <div><span className="text-[#c9a84c]">หาจุดน่าสงสัย:</span><span className="text-gray-400"> คำคลิเช AI · คำบอกอารมณ์ (telling) · จังหวะประโยคแบน · คำซ้ำ · (EN) AI-slop, filter words, -ly adverbs, passive, Flesch readability</span></div>
          <div><span className="text-[#c9a84c]">เทียบฉบับแก้:</span><span className="text-gray-400"> วางก่อน→หลัง เห็น delta ว่าการแก้ดีขึ้นจริงไหมตามตัวเลข</span></div>
          <div><span className="text-[#c9a84c]">สแกนรายบท:</span><span className="text-gray-400"> วางทั้งเล่ม → heatmap บอกบทที่อ่อนสุดต่อ signal</span></div>
          <div><span className="text-[#c9a84c]">ปิด loop:</span><span className="text-gray-400"> เจอจุดอ่อนแล้วกดปุ่มเดียว คัดลอก NIS audit ที่เกี่ยวพร้อมแปะข้อความให้ → วางใน LLM เจาะเฉพาะจุด (ประหยัด token)</span></div>
          <div><span className="text-[#c9a84c]">ส่งออก:</span><span className="text-gray-400"> Copy report / Download .md เก็บไว้เทียบ draft</span></div>
        </div>

        <h3 className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-2">เคล็ดลับ</h3>
        <ul className="space-y-1.5 text-sm text-gray-300 list-disc list-inside marker:text-[#c9a84c]">
          <li><span className="text-gray-200">ภาษา prompt:</span> สลับ “ไทยทั้งชุด” ได้ที่ Prompt Language</li>
          <li><span className="text-gray-200">Continuity:</span> Story Bible / STATE ฉีดเข้าทุกบท — แก้ที่เดียวใช้ทั้งเล่ม</li>
          <li><span className="text-gray-200">เซฟงาน:</span> ปุ่ม Save เก็บ project ไว้ในบัญชี (ต้องล็อกอิน); การตั้งค่าล่าสุด (รวม Story Bible) ถูกเก็บอัตโนมัติในเบราว์เซอร์ ไม่หายตอน reload</li>
          <li><span className="text-gray-200">ส่งออก:</span> Copy ราย prompt / Copy all / Download .md หรือ .json</li>
          <li><span className="text-gray-200">Preset:</span> แนะนำ / ทั้งหมด / ล้าง เลือกกลุ่ม module ได้เร็ว</li>
        </ul>
      </div>
    </div>
  );
}

export function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
        active ? "border-[#c9a84c] text-[#c9a84c] bg-[#c9a84c]/10" : "border-white/10 text-gray-400 hover:border-[#c9a84c]/40"
      }`}
    >
      {label}
    </button>
  );
}

function Chips({ items, tone }: { items: { word?: string; phrase?: string; count: number }[]; tone: string }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.slice(0, 24).map((e) => (
        <span key={e.word ?? e.phrase} className={`text-xs px-2 py-0.5 rounded border ${tone}`}>
          {e.word ?? e.phrase} ×{e.count}
        </span>
      ))}
    </div>
  );
}

export function ProseAnalyzerModal({ onClose, initialText }: { onClose: () => void; initialText?: string }) {
  const [text, setText] = usePersistedState("rush.analyzer.en");
  const [revised, setRevised] = useState("");
  const [showCompare, setShowCompare] = useState(false);
  const [showScan, setShowScan] = useState(false);
  const [copiedAudit, setCopiedAudit] = useState<string | null>(null);
  const dtext = useDebounced(text);
  const drevised = useDebounced(revised);
  const a = useMemo(() => (dtext.trim() ? analyzeProse(dtext) : null), [dtext]);
  useEffect(() => {
    if (initialText) setText(initialText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const deltas = useMemo(
    () => (dtext.trim() && drevised.trim() ? proseDeltas(analyzeProse(dtext), analyzeProse(drevised)) : null),
    [dtext, drevised]
  );
  const scan = useMemo(() => (dtext.trim() ? scanManuscript(dtext) : []), [dtext]);
  // Indices of the weakest chapter per signal (to flag in the heatmap).
  const worst = useMemo(() => {
    if (scan.length < 2) return { ease: -1, slop: -1, cv: -1 };
    const argEase = scan.reduce((b, c, i) => (c.fleschEase < scan[b].fleschEase ? i : b), 0);
    const argSlop = scan.reduce((b, c, i) => (c.slop > scan[b].slop ? i : b), 0);
    const argCv = scan.reduce((b, c, i) => (c.cv < scan[b].cv ? i : b), 0);
    return { ease: argEase, slop: scan[argSlop].slop > 0 ? argSlop : -1, cv: argCv };
  }, [scan]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Copy an English audit prompt with the analyzed draft pre-filled (signal → audit).
  const copyAudit = async (id: string) => {
    const mod = MODULE_CATALOG.find((m) => m.id === id);
    if (!mod) return;
    // Function replacer so `$` in pasted prose (e.g. "$5") isn't treated as a
    // special replacement pattern.
    const prompt = mod.build({} as BookConfig).replace(/\[INSERT (?:DRAFT|MANUSCRIPT)[^\]]*\]/, () => text.trim());
    await navigator.clipboard.writeText(prompt);
    setCopiedAudit(id);
    setTimeout(() => setCopiedAudit((c) => (c === id ? null : c)), 2000);
  };

  const AuditButton = ({ id, label }: { id: string; label: string }) => (
    <button
      onClick={() => copyAudit(id)}
      className="mt-2 inline-flex items-center gap-1.5 text-[0.65rem] px-2.5 py-1 rounded border border-red-400/40 text-red-300 hover:bg-red-400/10"
    >
      {copiedAudit === id ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
      {copiedAudit === id ? "Copied — paste into any LLM" : label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Prose Analyzer" className="glass-card rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6 border border-[#c9a84c]/30" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-bold gold-gradient">Prose Analyzer (English)</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-3">
          Browser-side, no AI — counts AI-slop words, filter/crutch words, -ly adverbs, told emotions, and sentence rhythm. You see exactly what was matched.
        </p>
        <ManuscriptBar lang="en" text={text} onLoad={setText} />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste English prose here…"
          className="input min-h-[140px] resize-y"
        />
        <button
          onClick={() => setShowCompare((v) => !v)}
          className="mt-2 text-[0.7rem] text-[#c9a84c] hover:underline"
        >
          {showCompare ? "− Hide revision compare" : "+ Compare a revision (before → after)"}
        </button>
        {showCompare && (
          <textarea
            value={revised}
            onChange={(e) => setRevised(e.target.value)}
            placeholder="Paste the revised version here to see what measurably changed…"
            className="input min-h-[120px] resize-y mt-2"
          />
        )}
        {showCompare && deltas && (
          <>
            <DeltaTable title="Before → After" deltas={deltas} note="Green = measurably improved on that signal · gray = neutral metric. Counts, not a quality verdict." />
            <DiffView ops={wordDiff(text, revised)} />
          </>
        )}
        {scan.length > 1 && (
          <button
            onClick={() => setShowScan((v) => !v)}
            className="mt-2 ml-3 text-[0.7rem] text-[#c9a84c] hover:underline"
          >
            {showScan ? "− Hide per-chapter scan" : `+ Per-chapter scan (${scan.length} chapters)`}
          </button>
        )}
        {showScan && scan.length > 1 && (
          <Heatmap
            title="Per-chapter heatmap"
            headers={["words", "ease", "slop", "tell", "passv", "CV%"]}
            rows={scan.map((c, i) => ({
              title: c.title,
              cells: [
                { value: c.words },
                { value: c.fleschEase, bad: worst.ease === i },
                { value: c.slop, bad: worst.slop === i },
                { value: c.telling },
                { value: c.passive },
                { value: c.cv, bad: worst.cv === i },
              ],
            }))}
            note="Click a row to load that chapter for analysis + one-click audit. Red = weakest chapter on that signal. Deterministic counts, not a verdict."
            onRowClick={(i) => {
              setText(scan[i].body);
              setShowScan(false);
            }}
          />
        )}
        {a && (
          <div className="mt-4 space-y-4 text-sm">
            <ReportActions report={formatProseReport(a)} filename="prose-analysis.md" />
            <div className="grid grid-cols-3 gap-2">
              <Stat value={String(a.wordCount)} label="words" />
              <Stat value={String(a.uniqueWords)} label="unique" />
              <Stat value={String(a.sentences.count)} label="sentences" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Stat value={String(a.sentences.avgWords)} label="avg words/sentence" />
              <Stat value={`${a.rhythm.cv}%`} label="rhythm variation (CV)" />
              <Stat value={String(a.rhythm.monotonyRun)} label="same-length run" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Stat value={String(a.readability.fleschEase)} label="Flesch Reading Ease" />
              <Stat value={String(a.readability.fkGrade)} label="grade level (FK)" />
              <Stat value={String(a.readability.syllablesPerWord)} label="syllables/word" />
            </div>
            <div>
              <p className="text-[0.6rem] text-gray-500">
                Reading Ease 60–70 ≈ plain English · higher = easier. Estimate (heuristic syllables).
              </p>
              <AuditButton id="READABILITY" label="Copy Readability Control rewrite + this text" />
            </div>
            {a.sentences.count >= 4 && (a.rhythm.cv < 35 || a.rhythm.monotonyRun >= 5) && (
              <div>
                <p className="text-[0.65rem] text-cyan-300/80">
                  ⚠️ Flat rhythm — sentence lengths are very uniform (CV {a.rhythm.cv}%
                  {a.rhythm.monotonyRun >= 5 ? ` · ${a.rhythm.monotonyRun} same-length in a row` : ""}). Vary short and long.
                </p>
                <AuditButton id="NIS_PACING" label="Copy NIS Pacing audit + this text" />
              </div>
            )}

            <div>
              <h3 className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-2">AI-slop words / formulas</h3>
              {a.slop.length === 0 ? (
                <p className="text-xs text-green-400">✓ No AI-slop terms found</p>
              ) : (
                <>
                  <Chips items={a.slop} tone="border-red-500/40 text-red-400" />
                  <AuditButton id="ANTI_SLOP" label="Copy Anti-AI-Slop rewrite + this text" />
                </>
              )}
            </div>

            <div>
              <h3 className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-2">
                Told emotions ({a.telling.ratio}/100 words)
              </h3>
              {a.telling.words.length === 0 ? (
                <p className="text-xs text-green-400">✓ No directly-named emotions</p>
              ) : (
                <>
                  <Chips items={a.telling.words} tone="border-fuchsia-400/40 text-fuchsia-300" />
                  {a.telling.ratio >= 1.5 && <AuditButton id="NIS_SHOW" label="Copy NIS Show-vs-Tell audit + this text" />}
                </>
              )}
            </div>

            <div>
              <h3 className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-2">
                Filter / crutch words ({a.filterWords.reduce((s, w) => s + w.count, 0)})
              </h3>
              {a.filterWords.length === 0 ? (
                <p className="text-xs text-gray-500">— none</p>
              ) : (
                <Chips items={a.filterWords} tone="border-yellow-400/40 text-yellow-300" />
              )}
            </div>

            <div>
              <h3 className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-2">
                -ly adverbs ({a.adverbs.ratio}/100 words)
              </h3>
              {a.adverbs.words.length === 0 ? (
                <p className="text-xs text-gray-500">— none</p>
              ) : (
                <Chips items={a.adverbs.words} tone="border-orange-400/40 text-orange-300" />
              )}
            </div>

            <div>
              <h3 className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-2">
                Possible passive voice ({a.passive.count})
              </h3>
              {a.passive.count === 0 ? (
                <p className="text-xs text-green-400">✓ No likely passive constructions</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {a.passive.samples.map((s, i) => (
                      <span key={`${s}-${i}`} className="text-xs px-2 py-0.5 rounded border border-blue-400/40 text-blue-300">
                        {s}
                      </span>
                    ))}
                  </div>
                  <p className="text-[0.6rem] text-gray-500 mt-1">Heuristic (be-verb + participle) — verify each; some, like &quot;was tired&quot;, are not passive.</p>
                  <AuditButton id="LINE_EDIT" label="Copy Line Edit + this text" />
                </>
              )}
            </div>

            <div>
              <h3 className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-2">Repeated words (echoes ≥4)</h3>
              {a.echoes.length === 0 ? (
                <p className="text-xs text-gray-500">— no over-repeated content words</p>
              ) : (
                <Chips items={a.echoes} tone="border-orange-400/40 text-orange-300" />
              )}
            </div>

            <Mechanics items={a.mechanics} title="Mechanics" />
          </div>
        )}
      </div>
    </div>
  );
}
