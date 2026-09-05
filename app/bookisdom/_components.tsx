"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "./_toast";
import { GROUP_COLORS, Field, Stat, FilterChip } from "./_ui";
// Re-exported so existing importers of these light primitives keep working.
export { GROUP_COLORS, Field, Stat, FilterChip };
import { X, Copy, Check, Download, Trash2 } from "lucide-react";
import { MODULE_CATALOG, MODULE_GROUPS, type BookConfig, type PromptGroup } from "@/lib/bookisdom-engine/engine";
import { TH_MODULES } from "@/lib/bookisdom-engine/th";
import { analyzeThai, tokenizeThai, formatThaiReport } from "@/lib/bookisdom-engine/thai-analyzer";
import { formatProseReport } from "@/lib/bookisdom-engine/prose-analyzer";
import { splitChapters } from "@/lib/bookisdom-engine/chapters";
import { buildEpub } from "@/lib/bookisdom-engine/epub";
import { consistencyLedger, storyBible, formatStoryBible, suggestThaiNames } from "@/lib/bookisdom-engine/consistency";
import { sensoryDensity, SENSE_LABEL, type Sense } from "@/lib/bookisdom-engine/sensory";
import { continuityRadar, sceneReadout } from "@/lib/bookisdom-engine/radar";
import { parseCodex, codexAudit, codexMermaid } from "@/lib/bookisdom-engine/codex";
import { analyzeSaga, type SagaBook } from "@/lib/bookisdom-engine/saga";
import { characterGraph } from "@/lib/bookisdom-engine/relationships";
import { renameTerm } from "@/lib/bookisdom-engine/rename";
import { checkThaiRegister } from "@/lib/bookisdom-engine/register";
import { checkTranslation, expansionReport, type TermRule } from "@/lib/bookisdom-engine/translation";
import { groupByTier, REFUSED_CONSTRUCTS, llmKalamaViolations, YATHABHUTA, warrant } from "@/lib/bookisdom-engine/epistemics";
import { characterArc, pacingProfile, motifTracker, type ChapterSignal } from "@/lib/bookisdom-engine/narrative";
import { downloadBlob } from "./_utils";
import { wordDiff, diffTokens, type DiffOp } from "@/lib/bookisdom-engine/text-util";
import { listManuscripts, getManuscript, saveManuscript, deleteManuscript, storeNearQuota, type StoredManuscript } from "./_manuscript-store";
import { useAnalysisTask } from "./_use-analysis";




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
      <button onClick={copy} className="inline-flex items-center gap-1.5 text-[0.65rem] px-2.5 py-1 rounded border border-[#7a5c12]/40 text-[#7a5c12] hover:bg-[#d9a63a]/15">
        {copied ? <Check className="w-3 h-3 text-green-800" /> : <Copy className="w-3 h-3" />}
        {copied ? "คัดลอกแล้ว / Copied" : "Copy report"}
      </button>
      <button onClick={download} className="inline-flex items-center gap-1.5 text-[0.65rem] px-2.5 py-1 rounded border border-[#7a5c12]/40 text-[#7a5c12] hover:bg-[#d9a63a]/15">
        <Download className="w-3 h-3" />
        Download .md
      </button>
    </div>
  );
}

/** Build a spec-valid .epub from the pasted text (split into chapters) — client-side. */
function EpubButton({ text, lang }: { text: string; lang: "th" | "en" }) {
  const download = () => {
    const chs = splitChapters(text).filter((c) => c.body.trim());
    if (!chs.length) return;
    const bytes = buildEpub({
      title: chs[0].title === "Full text" ? "Manuscript" : chs[0].title,
      language: lang === "th" ? "th" : "en",
      chapters: chs.map((c) => ({ title: c.title, text: c.body })),
      // The engine has no clock by design; the export handler does. Stamping here keeps
      // buildEpub pure while still shipping a real dcterms:modified (EPUB 3 requires one).
      modified: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    });
    const url = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: "application/epub+zip" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "manuscript.epub";
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <button onClick={download} className="inline-flex items-center gap-1.5 text-[0.65rem] px-2.5 py-1 rounded border border-[#7a5c12]/40 text-[#7a5c12] hover:bg-[#d9a63a]/15">
      <Download className="w-3 h-3" /> .epub
    </button>
  );
}

/** Export a deterministic Story Bible (recurring entities + chapter spans) as Markdown. */
function BibleButton({ text, lang, protect }: { text: string; lang: "th" | "en"; protect?: string[] }) {
  const download = () => {
    const bible = storyBible(text, lang, 3, protect);
    if (!bible.entries.length) return;
    const url = URL.createObjectURL(new Blob([formatStoryBible(bible, lang)], { type: "text/markdown" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "story-bible.md";
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <button onClick={download} className="inline-flex items-center gap-1.5 text-[0.65rem] px-2.5 py-1 rounded border border-[#7a5c12]/40 text-[#7a5c12] hover:bg-[#d9a63a]/15">
      <Download className="w-3 h-3" /> {lang === "th" ? "คลังเนื้อเรื่อง" : "Story Bible"}
    </button>
  );
}

/** Deterministic sensory-detail density by sense (the measurable core of "immersion"). */
function SensoryView({ text, lang }: { text: string; lang: "th" | "en" }) {
  const led = useMemo(() => sensoryDensity(text, lang), [text, lang]);
  if (led.words < 20 || led.total === 0) return null;
  const max = Math.max(...led.senses.map((s) => s.per1k), 1);
  const th = lang === "th";
  return (
    <div>
      <h3 className="text-xs font-semibold tracking-widest text-slate-600 uppercase mb-2">
        {th ? "ความหนาแน่นประสาทสัมผัส" : "Sensory density"}
      </h3>
      <div className="space-y-1.5">
        {led.senses.map((s) => (
          <div key={s.sense} className="flex items-center gap-2 text-xs">
            <span className="w-20 shrink-0 text-slate-600">{SENSE_LABEL[s.sense as Sense][th ? "th" : "en"]}</span>
            <div className="flex-1 h-3 rounded bg-black/[0.03] overflow-hidden">
              <div className="h-full bg-[#d9a63a]/50" style={{ width: `${(s.per1k / max) * 100}%` }} />
            </div>
            <span className="w-24 shrink-0 text-right tabular-nums text-faint">
              {s.count}× · {s.per1k}/1k
            </span>
          </div>
        ))}
      </div>
      {led.unused.length > 0 && (
        <p className="text-[0.65rem] text-orange-800 mt-1.5">
          {th ? "ไม่ได้ใช้เลย: " : "Never used: "}
          {led.unused.map((u) => SENSE_LABEL[u][th ? "th" : "en"]).join(", ")}
        </p>
      )}
      <p className="text-[0.6rem] text-faint mt-1">
        {th
          ? "นับจากรายการคำจริง ไม่ใช่คะแนนคุณภาพ · ขึ้นกับการตัดคำและรายการคำ"
          : "Counts from a fixed word list, not a quality score · bounded by the lexicon."}
      </p>
    </div>
  );
}

/** Parse a comma/newline glossary string into a protect list (names ≥ 2 chars). */
function parseGlossary(names: string): string[] {
  return names.split(/[,\n]+/).map((n) => n.trim()).filter((n) => n.length >= 2);
}

/** Thai glossary input — writer's cast/place names, kept atomic despite the segmenter.
 *  `suggestions` are candidate names auto-found in the text; clicking one appends it. */
function GlossaryInput({ value, onChange, suggestions = [] }: { value: string; onChange: (v: string) => void; suggestions?: string[] }) {
  const add = (name: string) => {
    const base = value.trim().replace(/[,\s]+$/, "");
    onChange(base ? `${base}, ${name}` : name);
  };
  return (
    <div className="mb-2.5">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="ชื่อตัวละคร/สถานที่ คั่นด้วยจุลภาค เช่น มะลี, ธนกร"
        aria-label="ชื่อเฉพาะสำหรับกันการตัดคำ"
        className="w-full text-xs px-2.5 py-1.5 rounded border border-black/10 bg-black/[0.03] text-slate-800 placeholder:text-faint focus:border-[#7a5c12]/50 focus:outline-none"
      />
      {suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          <span className="text-[0.6rem] text-faint">น่าจะเป็นชื่อ (กดเพื่อเพิ่ม):</span>
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => add(s)}
              className="text-[0.7rem] px-2 py-0.5 rounded-full border border-[#7a5c12]/40 text-[#7a5c12] hover:bg-[#d9a63a]/15"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
      <p className="text-[0.6rem] text-faint mt-1">
        ชื่อที่ตัวตัดคำไทยอาจแยกผิด → ช่วยให้ทั้งการตรวจชื่อสะกดต่างและคลังเนื้อเรื่องแม่นขึ้น (บันทึกอัตโนมัติ)
      </p>
    </div>
  );
}

/** Deterministic cross-chapter consistency: name-spelling variants + dropped terms. */
function ConsistencyView({ text, lang, protect }: { text: string; lang: "th" | "en"; protect?: string[] }) {
  const led = useMemo(() => consistencyLedger(text, lang, protect), [text, lang, protect]);
  if (led.chapters < 2 || (led.variantClusters.length === 0 && led.dropped.length === 0)) return null;
  return (
    <div>
      <h3 className="text-xs font-semibold tracking-widest text-slate-600 uppercase mb-2">
        {lang === "th" ? "ความสม่ำเสมอข้ามบท" : "Cross-chapter consistency"}
      </h3>
      {led.variantClusters.length > 0 && (
        <div className="mb-2">
          <p className="text-[0.65rem] text-faint mb-1">{lang === "th" ? "สะกดไม่ตรงกัน (อาจเป็นชื่อเดียวกัน):" : "Spelling variants (maybe the same name):"}</p>
          <div className="flex flex-wrap gap-1.5">
            {led.variantClusters.slice(0, 12).map((c, i) => (
              <span key={i} className="text-xs px-2 py-0.5 rounded border border-amber-700/40 text-amber-800">
                {c.map((t) => `${t.term}×${t.count}`).join(" ≈ ")}
              </span>
            ))}
          </div>
        </div>
      )}
      {led.dropped.length > 0 && (
        <div>
          <p className="text-[0.65rem] text-faint mb-1">{lang === "th" ? "โผล่แล้วหายกลางเล่ม:" : "Introduced then dropped:"}</p>
          <div className="flex flex-wrap gap-1.5">
            {led.dropped.slice(0, 12).map((t) => (
              <span key={t.term} className="text-xs px-2 py-0.5 rounded border border-orange-700/40 text-orange-800">
                {t.term} ×{t.count} ({lang === "th" ? "บท" : "ch"} {t.chapters.join(",")})
              </span>
            ))}
          </div>
        </div>
      )}
      <p className="text-[0.6rem] text-faint mt-1">
        {lang === "th" ? "นับจริง ไม่ใช่คำตัดสิน · ภาษาไทยขึ้นกับการตัดคำ อาจไม่จับชื่อทุกตัว" : "Real counts, not a verdict."}
      </p>
    </div>
  );
}

/** Continuity radar: canon names never used + off-canon names that recur. The `canon`
 *  list is the writer's glossary — no extra input needed. Counts vs. the glossary, not a
 *  verdict; the honest, LLM-free version of a "continuity radar" panel. */
function RadarView({ text, lang, canon }: { text: string; lang: "th" | "en"; canon: string[] }) {
  const findings = useMemo(() => (canon.length ? continuityRadar(text, canon, lang) : []), [text, lang, canon]);
  if (!canon.length) return null;
  const unused = findings.filter((f) => f.kind === "unused-canon");
  const off = findings.filter((f) => f.kind === "off-canon");
  const th = lang === "th";
  return (
    <div>
      <h3 className="text-xs font-semibold tracking-widest text-slate-600 uppercase mb-2">
        {th ? "เรดาร์ความต่อเนื่อง (เทียบ canon)" : "Continuity radar (vs. canon)"}
      </h3>
      {findings.length === 0 ? (
        <p className="text-xs text-green-800">
          ✓ {th ? "ชื่อใน canon ถูกใช้ครบ และไม่มีชื่อแปลกปลอมโผล่ซ้ำ" : "Every canon name is used and no undeclared name recurs."}
        </p>
      ) : (
        <div className="space-y-2">
          {unused.length > 0 && (
            <div>
              <p className="text-[0.65rem] text-faint mb-1">{th ? "ชื่อใน canon ที่ไม่พบในเนื้อหา:" : "Canon names never used:"}</p>
              <div className="flex flex-wrap gap-1.5">
                {unused.map((f) => (
                  <span key={f.term} className="text-xs px-2 py-0.5 rounded border border-sky-400/40 text-sky-700">{f.term}</span>
                ))}
              </div>
            </div>
          )}
          {off.length > 0 && (
            <div>
              <p className="text-[0.65rem] text-faint mb-1">{th ? "ชื่อที่ใช้ซ้ำแต่ไม่อยู่ใน canon (ดริฟต์/เปลี่ยนชื่อ/พิมพ์ผิด?):" : "Recurring names not in canon (drift/rename/typo?):"}</p>
              <div className="flex flex-wrap gap-1.5">
                {off.map((f) => (
                  <span key={f.term} className="text-xs px-2 py-0.5 rounded border border-rose-700/40 text-rose-700">{f.term} ×{f.count}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      <p className="text-[0.6rem] text-faint mt-1">
        {th ? "นับเทียบกับ glossary ของคุณ ไม่ใช่คำตัดสิน · ประกาศการเปลี่ยนชื่อใน glossary เพื่อล้าง flag" : "Counts vs. your glossary, not a verdict · declare renames in the glossary to clear a flag."}
      </p>
    </div>
  );
}

// Opener monotony — how often sentences/clauses start with the same word.
// Reads the analyzed draft directly; same engine as `bookisdom openers`.
function OpenerView({ text, lang }: { text: string; lang: "th" | "en" }) {
  const th = lang === "th";
  const report = useAnalysisTask("openers", text.trim() ? [text, lang] : null);
  if (!report || report.units === 0) return null;
  const pct = (r: number) => `${Math.round(r * 100)}%`;
  return (
    <div>
      <h3 className="text-xs font-semibold tracking-widest text-slate-600 uppercase mb-2">
        {th ? "คำขึ้นต้นประโยค/วรรค" : "Sentence / clause openers"}
      </h3>
      {report.monotone.length > 0 ? (
        <div>
          <p className="text-[0.65rem] text-faint mb-1">{th ? "ขึ้นต้นซ้ำมาก (ลองสลับจังหวะ):" : "over-used openers (consider varying):"}</p>
          <div className="flex flex-wrap gap-1.5">
            {report.monotone.map((s) => (
              <span key={s.opener} className="text-xs px-2 py-0.5 rounded border border-amber-700/40 text-amber-800">
                {s.opener} ×{s.count} · {pct(s.ratio)}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-green-800">
          ✓ {th ? "ไม่มีคำขึ้นต้นที่ซ้ำเกินเกณฑ์ — จังหวะเปิดหลากหลายดี" : "No opener repeats past the threshold — varied openings."}
        </p>
      )}
      <p className="text-[0.65rem] text-faint mt-2 mb-1">{th ? "พบบ่อยสุด:" : "most frequent:"}</p>
      <div className="flex flex-wrap gap-1.5">
        {report.top.map((s) => (
          <span key={s.opener} className="text-xs px-2 py-0.5 rounded border border-black/10 text-slate-600">
            {s.opener} ×{s.count}
          </span>
        ))}
      </div>
      <p className="text-[0.6rem] text-faint mt-2">
        {th ? `${report.units} หน่วย · ${report.distinct} แบบ · นับได้ ไม่ใช่คำตัดสิน` : `${report.units} units · ${report.distinct} distinct · counts, not a verdict`}
      </p>
    </div>
  );
}

// Verbatim restatements — the countable slice of "redundant exposition"
// (top-3 human-editor fix in AI prose, LAMP corpus / CHI 2025).
function RestatementView({ text, lang }: { text: string; lang: "th" | "en" }) {
  const th = lang === "th";
  const report = useAnalysisTask("restatements", text.trim() ? [text, lang] : null);
  if (!report || report.totalTokens < 40) return null;
  return (
    <div>
      <h3 className="text-xs font-semibold tracking-widest text-slate-600 uppercase mb-2">
        {th ? "เล่าซ้ำคำต่อคำ (verbatim)" : "Verbatim restatements"}
      </h3>
      {report.found.length === 0 ? (
        <p className="text-xs text-green-800">✓ {th ? "ไม่พบวลียาวที่ซ้ำคำต่อคำ" : "No long word-for-word repeats."}</p>
      ) : (
        <div className="space-y-1">
          {report.found.slice(0, 8).map((r) => (
            <div key={r.phrase} className="text-xs text-slate-700">
              <span className="text-amber-800">×{r.count}</span>
              {r.chapters.length > 1 && <span className="text-faint"> ({th ? "บท" : "ch"} {r.chapters.join(",")})</span>}
              <span className="text-slate-600"> “{r.phrase.length > 70 ? r.phrase.slice(0, 70) + "…" : r.phrase}”</span>
            </div>
          ))}
        </div>
      )}
      <p className="text-[0.6rem] text-faint mt-1.5">
        {th
          ? "จับเฉพาะซ้ำคำต่อคำ (≥6 คำ) — เล่าซ้ำแบบเปลี่ยนถ้อยคำต้องอ่านเอง · อิงงานวิจัย LAMP: การเล่าซ้ำคือ ~18% ของสิ่งที่บรรณาธิการมนุษย์แก้ใน prose ของ AI"
          : "Word-for-word repeats only (≥6 tokens) — paraphrased redundancy needs a human read · grounded in LAMP: restatement is ~18% of human edits to AI prose."}
      </p>
    </div>
  );
}

// Saga — series-level continuity across books. Self-contained (its own per-book
// codex inputs); the same deterministic engine as `bookisdom saga`.
function SagaView({ lang }: { lang: "th" | "en" }) {
  const th = lang === "th";
  const [books, setBooks] = useState<Array<{ title: string; bible: string }>>([
    { title: "", bible: "" },
    { title: "", bible: "" },
  ]);
  const report = useMemo(() => {
    // Number the default titles by SERIES position (post-filter), so leaving a
    // middle book blank doesn't skip a number in the report.
    const declared: SagaBook[] = books
      .map((b) => ({ rawTitle: b.title.trim(), codex: parseCodex(b.bible) }))
      .filter((b) => b.codex.entities.length > 0)
      .map((b, i) => ({ title: b.rawTitle || `${th ? "เล่ม" : "Book"} ${i + 1}`, codex: b.codex }));
    return declared.length >= 2 ? analyzeSaga(declared) : null;
  }, [books, th]);

  const set = (i: number, patch: Partial<{ title: string; bible: string }>) =>
    setBooks((prev) => prev.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  const chip = (name: string, cls: string) => (
    <span key={name} className={`text-xs px-2 py-0.5 rounded border ${cls}`}>{name}</span>
  );

  return (
    <div>
      <h3 className="text-xs font-semibold tracking-widest text-slate-600 uppercase mb-1">
        {th ? "ความต่อเนื่องซีรีส์ (Saga — หลายเล่ม)" : "Series continuity (Saga — multi-book)"}
      </h3>
      <p className="text-[0.62rem] text-faint mb-2">
        {th ? "ประกาศคาสต์ของแต่ละเล่ม (เรียงตามลำดับซีรีส์) แล้วดูว่าใครถูกแนะนำใหม่ / สืบเนื่อง / หายไป และใครเป็นแกนซีรีส์" : "Declare each book's cast (in series order); see who is introduced / carried / dropped, and the series backbone."}
      </p>
      <div className="space-y-2">
        {books.map((b, i) => (
          <div key={i} className="flex gap-2 items-start">
            <span className="text-[0.7rem] text-faint mt-2 w-4 shrink-0 tabular-nums">{i + 1}</span>
            <div className="flex-1 space-y-1">
              <input
                value={b.title}
                onChange={(e) => set(i, { title: e.target.value })}
                placeholder={th ? `ชื่อเล่ม ${i + 1}` : `Book ${i + 1} title`}
                className="input text-xs w-full"
              />
              <textarea
                value={b.bible}
                onChange={(e) => set(i, { bible: e.target.value })}
                placeholder={th ? "[ตัวละคร]\nอนันต์: ...\nมาลี: ..." : "[CHARACTERS]\nAnan: ...\nMali: ..."}
                className="input min-h-[52px] resize-y font-mono text-[0.7rem] w-full"
              />
            </div>
            {books.length > 2 && (
              <button onClick={() => setBooks((p) => p.filter((_, j) => j !== i))} className="text-faint hover:text-red-700 mt-2" aria-label="remove book">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
      <button
        onClick={() => setBooks((p) => [...p, { title: "", bible: "" }])}
        className="mt-2 text-[0.65rem] text-[#7a5c12] hover:text-[#6b5010]"
      >
        {th ? "+ เพิ่มเล่ม" : "+ add book"}
      </button>

      {report && (
        <div className="mt-3 space-y-3">
          {report.books.map((b) => (
            <div key={b.index} className="border-l-2 border-[#7a5c12]/30 pl-2.5">
              <p className="text-[0.7rem] text-slate-700 mb-1">[{b.index}] {b.title}</p>
              <div className="flex flex-wrap gap-1.5">
                {b.introduced.map((e) => chip(e.name, "border-emerald-700/40 text-emerald-700"))}
                {b.carried.map((n) => chip(n, "border-sky-400/30 text-sky-700"))}
                {b.dropped.map((n) => chip(`${n} ↓`, "border-amber-700/40 text-amber-800"))}
              </div>
            </div>
          ))}
          <div className="text-[0.68rem] text-faint pt-1">
            <p>{th ? "แกนซีรีส์ (อยู่ ≥2 เล่ม): " : "series backbone (≥2 books): "}<span className="text-slate-700">{report.recurring.join(", ") || "—"}</span></p>
            <p className="mt-0.5">{th ? "ปรากฏเล่มเดียว: " : "single-book: "}<span className="text-slate-600">{report.standalone.join(", ") || "—"}</span></p>
          </div>
          <p className="text-[0.6rem] text-faint">
            {th ? "สีเขียว=แนะนำใหม่ · ฟ้า=สืบเนื่อง · เหลือง↓=หายจากเล่มก่อน (สัญญาณ ไม่ใช่ error) · deterministic ไม่มี LLM" : "green=introduced · blue=carried · amber↓=dropped vs prev (a signal, not an error) · deterministic, no LLM"}
          </p>
        </div>
      )}
    </div>
  );
}

// Story Codex audit — declare the cast in sections, check THIS draft against it.
// Same deterministic engine as `bookisdom codex`; the codex textarea IS the canon.
function CodexView({ text, lang }: { text: string; lang: "th" | "en" }) {
  const [bible, setBible] = useState("");
  const [copied, setCopied] = useState(false);
  const codex = useMemo(() => parseCodex(bible), [bible]);
  const audit = useMemo(() => codexAudit(codex, text, lang), [codex, text, lang]);
  const mermaid = useMemo(() => codexMermaid(codex), [codex]);
  const th = lang === "th";
  return (
    <div>
      <h3 className="text-xs font-semibold tracking-widest text-slate-600 uppercase mb-2">
        {th ? "ตรวจ Codex (เทียบคาสต์ที่ประกาศ)" : "Codex audit (vs. declared cast)"}
      </h3>
      <textarea
        value={bible}
        onChange={(e) => setBible(e.target.value)}
        placeholder={th
          ? "ประกาศคาสต์ใต้หัวข้อ — [ตัวละคร] / [สถานที่] / [สิ่งของ] / [ความสัมพันธ์]\nอนันต์: นักสืบ\nมาลี: น้องสาว"
          : "Declare the cast under sections — [CHARACTERS] / [PLACES] / [ITEMS] / [RELATIONS]\nAnan: detective\nMali: sister"}
        className="input min-h-[72px] resize-y font-mono text-[0.72rem] w-full"
      />
      {audit.canonSize === 0 ? (
        <p className="text-[0.62rem] text-faint mt-1">
          {th ? "ยังไม่ได้ประกาศ entity — พิมพ์คาสต์ใต้หัวข้อ [ตัวละคร] ฯลฯ แล้วจะตรวจกับดราฟต์ให้" : "No entities declared yet — list a cast under [CHARACTERS] etc. to audit the draft."}
        </p>
      ) : (
        <div className="space-y-2 mt-2">
          <div>
            <p className="text-[0.65rem] text-faint mb-1">
              {th ? `ปรากฏในดราฟต์ (${audit.present.length}/${audit.canonSize}):` : `Present in draft (${audit.present.length}/${audit.canonSize}):`}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {audit.present.length === 0 && <span className="text-xs text-faint">—</span>}
              {audit.present.map((e) => (
                <span key={e.name} className="text-xs px-2 py-0.5 rounded border border-emerald-700/40 text-emerald-700">{e.name}</span>
              ))}
            </div>
          </div>
          {audit.statusConflicts.length > 0 && (
            <div>
              <p className="text-[0.65rem] text-faint mb-1">{th ? "⚠ สถานะขัดแย้ง — ตาย/หายตัว แต่ปรากฏ (ย้อนอดีต? ผี? หลุด?):" : "⚠ Status conflict — dead/missing yet appears (flashback? ghost? slip?):"}</p>
              <div className="flex flex-wrap gap-1.5">
                {audit.statusConflicts.map((e) => (
                  <span key={e.name} className="text-xs px-2 py-0.5 rounded border border-rose-700/40 text-rose-700">{e.name} — {e.status}</span>
                ))}
              </div>
            </div>
          )}
          {audit.forbiddenHits.length > 0 && (
            <div>
              <p className="text-[0.65rem] text-faint mb-1">{th ? "🗣 voice guard — คำต้องห้ามปรากฏในดราฟต์ (ตรวจเองว่าใครพูด):" : "🗣 Voice guard — a never-says word occurs (check who says it):"}</p>
              <div className="flex flex-wrap gap-1.5">
                {audit.forbiddenHits.map((h) => (
                  <span key={`${h.name}-${h.word}`} className="text-xs px-2 py-0.5 rounded border border-amber-700/40 text-amber-800">{h.name}: “{h.word}” ×{h.count}</span>
                ))}
              </div>
            </div>
          )}
          {audit.variants.length > 0 && (
            <div>
              <p className="text-[0.65rem] text-faint mb-1">{th ? "อาจสะกดเพี้ยน (เช็กความสอดคล้อง):" : "Possible misspellings (check consistency):"}</p>
              <div className="flex flex-wrap gap-1.5">
                {audit.variants.map((v) => (
                  <span key={v.declared} className="text-xs px-2 py-0.5 rounded border border-amber-700/40 text-amber-800">{v.declared} ~ {v.found}</span>
                ))}
              </div>
            </div>
          )}
          {audit.missing.length > 0 && (
            <div>
              <p className="text-[0.65rem] text-faint mb-1">{th ? "ไม่ถูกอ้างถึง (ตั้งใจ หรือช่องว่าง continuity?):" : "Not referenced (intentional, or a continuity gap?):"}</p>
              <div className="flex flex-wrap gap-1.5">
                {audit.missing.map((e) => (
                  <span key={e.name} className="text-xs px-2 py-0.5 rounded border border-gray-500/40 text-slate-600">{e.name}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      {mermaid && (
        <details className="mt-2">
          <summary className="text-[0.65rem] text-[#7a5c12] cursor-pointer hover:text-[#6b5010]">
            {th ? "กราฟความสัมพันธ์ (Mermaid — คัดลอกไปเรนเดอร์ที่ไหนก็ได้)" : "Relationship graph (Mermaid — copy & render anywhere)"}
          </summary>
          <div className="relative mt-1.5">
            <button
              onClick={() => { navigator.clipboard?.writeText(mermaid); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
              className="absolute top-1.5 right-1.5 flex items-center gap-1 text-[0.6rem] px-1.5 py-0.5 rounded border border-black/15 text-slate-700 hover:border-[#7a5c12]/50 bg-black/[0.05]"
            >
              {copied ? <Check className="w-3 h-3 text-green-800" /> : <Copy className="w-3 h-3" />}
              {copied ? (th ? "คัดลอกแล้ว" : "copied") : (th ? "คัดลอก" : "copy")}
            </button>
            <pre className="text-[0.62rem] text-slate-600 bg-black/[0.05] border border-black/10 rounded p-2 pr-16 overflow-x-auto font-mono whitespace-pre">{mermaid}</pre>
          </div>
        </details>
      )}
      <p className="text-[0.6rem] text-faint mt-1">
        {th ? "deterministic ล้วน ไม่มี LLM · นับได้ ไม่ใช่คำตัดสิน · 'ไม่ถูกอ้างถึง' เป็นสัญญาณ ไม่ใช่ error" : "Pure/deterministic, no LLM · counts, not a verdict · 'not referenced' is a signal, not an error."}
      </p>
    </div>
  );
}

/** Character relationship graph: who shares chapters with whom. `names` is the writer's
 *  glossary. The structure (co-occurrence weight) is a real count; the semantic label
 *  (mentor/rival) is left to the writer — never invented. */
function RelationshipView({ text, lang, names }: { text: string; lang: "th" | "en"; names: string[] }) {
  const g = useMemo(() => (names.length ? characterGraph(text, names, lang) : null), [text, lang, names]);
  if (!g || g.nodes.length === 0) return null;
  const maxW = Math.max(...g.edges.map((e) => e.weight), 1);
  const th = lang === "th";
  return (
    <div>
      <h3 className="text-xs font-semibold tracking-widest text-slate-600 uppercase mb-2">
        {th ? "ความสัมพันธ์ตัวละคร (แชร์ฉากกัน)" : "Character relationships (shared scenes)"}
      </h3>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {g.nodes.map((n) => (
          <span key={n.name} className="text-xs px-2 py-0.5 rounded border border-black/10 text-slate-700">
            {n.name} ×{n.mentions} · {th ? "บท" : "ch"} {n.chapters.join(",")}
          </span>
        ))}
      </div>
      {g.edges.length === 0 ? (
        <p className="text-xs text-faint">— {th ? "ไม่มีตัวละครที่แชร์บทเดียวกัน" : "No characters share a chapter."}</p>
      ) : (
        <div className="space-y-1.5">
          {g.edges.slice(0, 12).map((e) => (
            <div key={`${e.a}-${e.b}`} className="flex items-center gap-2 text-xs">
              <span className="w-40 shrink-0 text-slate-700 truncate" title={`${e.a} ↔ ${e.b}`}>{e.a} ↔ {e.b}</span>
              <div className="flex-1 h-3 rounded bg-black/[0.03] overflow-hidden">
                <div className="h-full bg-[#d9a63a]/50" style={{ width: `${(e.weight / maxW) * 100}%` }} />
              </div>
              <span className="w-28 shrink-0 text-right tabular-nums text-faint">{e.weight}× ({th ? "บท" : "ch"} {e.chapters.join(",")})</span>
            </div>
          ))}
        </div>
      )}
      <p className="text-[0.6rem] text-faint mt-1">
        {th ? "โครงสร้างเป็นการนับจริง · ป้ายความสัมพันธ์ (พี่เลี้ยง/คู่แข่ง) เป็นการตีความของคุณ" : "The structure is a real count · the relationship label (mentor/rival) is your call."}
      </p>
    </div>
  );
}

/** The honest "Scene Intelligence" card — the panel competitors render with an LLM as
 *  Momentum/Clarity/Tension 0–100 dials. Here every field is a real, re-derivable count.
 *  Thai only (the analyzers it reuses are deterministic Thai). */
function SceneReadoutView({ text }: { text: string }) {
  const r = useMemo(() => {
    if (!text.trim()) return null;
    const sens = sensoryDensity(text, "th");
    return sceneReadout(text, analyzeThai, sens.per1k);
  }, [text]);
  if (!r || r.words < 12) return null;
  const cells: { label: string; value: string; hint: string }[] = [
    { label: "คำ", value: String(r.words), hint: "ความยาวฉาก" },
    { label: "อนุประโยค", value: String(r.clauses), hint: "จำนวนท่อน" },
    { label: "จังหวะ (CV)", value: `${r.rhythmCv}%`, hint: "ยิ่งต่ำ = ยาวพอกัน อ่านแบน" },
    { label: "บทพูด", value: `${r.dialogueRatio}%`, hint: "สัดส่วนคำในเครื่องหมายพูด" },
    { label: "บอกอารมณ์ /100", value: String(r.tellingPer100), hint: "ความหนาแน่นคำบอก/กริยากรอง" },
    { label: "ประสาทสัมผัส /1k", value: String(r.sensoryPer1k), hint: "คำผัสสะต่อพันคำ" },
    { label: "คลิเช AI", value: String(r.aiTells), hint: "วลีคลิเชที่ตรวจพบ" },
  ];
  return (
    <div className="rounded-xl border border-[#7a5c12]/25 bg-[#d9a63a]/[0.04] p-3">
      <h3 className="text-xs font-semibold tracking-widest text-[#7a5c12] uppercase mb-2">
        อ่านค่าฉากนี้ — สัญญาณที่วัดได้ (ไม่ใช่คะแนน 0–100)
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {cells.map((c) => (
          <div key={c.label} className="rounded-lg border border-black/10 bg-black/[0.02] px-2.5 py-1.5" title={c.hint}>
            <div className="tabular-nums text-base font-semibold text-slate-900">{c.value}</div>
            <div className="text-[0.6rem] text-faint leading-tight">{c.label}</div>
          </div>
        ))}
      </div>
      <p className="text-[0.6rem] text-faint mt-2">
        ทุกตัวเลขคือการนับที่คุณตรวจซ้ำเองได้ — ไม่มี momentum/clarity/tension แบบเดา
      </p>
    </div>
  );
}

/** In-browser character/term rename across the whole manuscript, with a per-chapter
 *  audit and a collision warning. The rewrite happens locally; the writer downloads it. */
function RenameView({ text, lang }: { text: string; lang: "th" | "en" }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const th = lang === "th";
  const res = useMemo(() => (from.trim() && to.trim() ? renameTerm(text, from.trim(), to.trim(), lang) : null), [text, from, to, lang]);
  return (
    <div>
      <h3 className="text-xs font-semibold tracking-widest text-slate-600 uppercase mb-2">
        {th ? "เปลี่ยนชื่อทั้งเล่ม (ในเบราว์เซอร์)" : "Rename across the manuscript (in-browser)"}
      </h3>
      <div className="flex items-center gap-2 mb-2">
        <input
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          placeholder={th ? "ชื่อเดิม" : "old name"}
          aria-label={th ? "ชื่อเดิม" : "old name"}
          className="flex-1 text-xs px-2.5 py-1.5 rounded border border-black/10 bg-black/[0.03] text-slate-800 placeholder:text-faint focus:border-[#7a5c12]/50 focus:outline-none"
        />
        <span className="text-faint text-xs">→</span>
        <input
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder={th ? "ชื่อใหม่" : "new name"}
          aria-label={th ? "ชื่อใหม่" : "new name"}
          className="flex-1 text-xs px-2.5 py-1.5 rounded border border-black/10 bg-black/[0.03] text-slate-800 placeholder:text-faint focus:border-[#7a5c12]/50 focus:outline-none"
        />
      </div>
      {res && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className="text-slate-700">{res.total} {th ? "จุดที่พบ" : "hit(s)"}</span>
            {res.perChapter.map((p) => (
              <span key={p.chapter} className="px-2 py-0.5 rounded border border-black/10 text-slate-600">
                {th ? "บท" : "ch"} {p.chapter}: {p.count}
              </span>
            ))}
          </div>
          {res.targetPreexisting > 0 && (
            <p className="text-[0.65rem] text-amber-800">
              ⚠ {th ? `"${to}" มีอยู่แล้ว ${res.targetPreexisting} ครั้ง (อาจชนกัน)` : `"${to}" already appears ${res.targetPreexisting}× (possible collision)`}
            </p>
          )}
          {res.total > 0 && (
            <button
              onClick={() => downloadBlob(`renamed-${to.trim() || "manuscript"}.md`, res.text, "text/markdown")}
              className="inline-flex items-center gap-1.5 text-[0.7rem] px-2.5 py-1 rounded border border-[#7a5c12]/40 text-[#7a5c12] hover:bg-[#d9a63a]/15"
            >
              <Download className="w-3 h-3" />
              {th ? "ดาวน์โหลดฉบับที่เปลี่ยนชื่อแล้ว" : "Download the rewritten manuscript"}
            </button>
          )}
        </div>
      )}
      <p className="text-[0.6rem] text-faint mt-1">
        {th
          ? "แทนที่แบบตรงตัวทุกบท · ตรวจการชนชื่อให้ก่อน · ไฟล์ถูกเขียนใหม่ในเครื่องคุณ ไม่ส่งขึ้นเซิร์ฟเวอร์"
          : "Literal substitution across every chapter · checks for collisions first · rewritten locally, never uploaded."}
      </p>
    </div>
  );
}

/** Thai register/spelling suggestions — loanwords & informal spellings with their
 *  Royal-Institute-standard equivalents. Skips glossary proper nouns (a coined name is
 *  never "wrong"). Suggestions, not errors. */
function RegisterView({ text, protect }: { text: string; protect?: string[] }) {
  const findings = useMemo(() => (text.trim() ? checkThaiRegister(text, { skip: protect }) : []), [text, protect]);
  if (findings.length === 0) return null;
  return (
    <div>
      <h3 className="text-xs font-semibold tracking-widest text-slate-600 uppercase mb-2">คำ/การสะกด (ภาษาไทยมาตรฐาน — ไม่ใช่ข้อผิด)</h3>
      <div className="space-y-1">
        {findings.slice(0, 20).map((r) => (
          <div key={r.term} className="flex items-center gap-2 text-xs">
            <span className="px-2 py-0.5 rounded border border-teal-700/40 text-teal-700">{r.term} ×{r.count}</span>
            <span className="text-faint">→</span>
            <span className="text-slate-800">{r.suggest}</span>
            {r.note && <span className="text-[0.6rem] text-faint">({r.note})</span>}
          </div>
        ))}
      </div>
      <p className="text-[0.6rem] text-faint mt-1">คำยืม/สะกดไม่เป็นทางการ พร้อมคำมาตรฐาน · เว้นชื่อเฉพาะใน glossary · เป็นคำแนะนำ ไม่ใช่คำตัดสิน</p>
    </div>
  );
}

/** Parse a "ไทย=English" term map (one per line) into TermRule[] for the translation check. */
function parseTermMap(raw: string): TermRule[] {
  return raw
    .split(/\n+/)
    .map((line) => line.split(/[=:]/).map((s) => s.trim()))
    .filter((p) => p.length >= 2 && p[0] && p[1])
    .map(([source, target]) => ({ source, target, caseSensitive: /^[A-Z]/.test(target) }));
}

/** Translation faithfulness (Thai source → English target). Two deterministic signals:
 *  per-chapter length-ratio drift (added/summarised content) and a term-map check
 *  (dropped canon terms / wrong case). Collapsible — the writer pastes the translation. */
function TranslationView({ source }: { source: string }) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState("");
  const [map, setMap] = useState("");
  const dtarget = useDebounced(target);
  const rules = useMemo(() => parseTermMap(map), [map]);
  const exp = useMemo(() => (source.trim() && dtarget.trim() ? expansionReport(source, dtarget) : null), [source, dtarget]);
  const terms = useMemo(() => (source.trim() && dtarget.trim() && rules.length ? checkTranslation(source, dtarget, rules) : []), [source, dtarget, rules]);
  return (
    <div>
      <button onClick={() => setOpen((v) => !v)} className="text-[0.7rem] text-[#7a5c12] hover:underline">
        {open ? "− ซ่อนการตรวจการแปล" : "+ ตรวจการแปล (ไทย → อังกฤษ)"}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          <textarea
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="วางคำแปลภาษาอังกฤษที่นี่ (แบ่งบทด้วย ## เหมือนต้นฉบับ เพื่อเทียบความยาวรายบท)…"
            className="input min-h-[110px] resize-y"
          />
          <textarea
            value={map}
            onChange={(e) => setMap(e.target.value)}
            placeholder="ศัพท์เฉพาะ (ไม่บังคับ) บรรทัดละคู่ เช่น&#10;ธนกร=Thanakorn&#10;ดาบเทวะ=Deva Blade"
            className="input min-h-[64px] resize-y text-xs"
          />
          {exp && exp.chunks.length > 0 && (
            <Heatmap
              title={`ความยาวรายบท (มัธยฐาน ${exp.medianRatio}× อังกฤษ÷ไทย)`}
              headers={["ต้นฉบับ (ตัวอักษร)", "คำแปล (ตัวอักษร)", "อัตราส่วน"]}
              rows={exp.chunks.map((c) => ({
                title: `${c.flag === "expanded" ? "▲ " : c.flag === "shrunk" ? "▼ " : ""}บท ${c.chapter}`,
                cells: [{ value: c.sourceChars }, { value: c.targetChars }, { value: c.ratio, bad: c.flag !== null }],
              }))}
              note="▲ ยาวกว่ามัธยฐานมาก = อาจเติมเนื้อหา · ▼ สั้นกว่ามาก = อาจสรุปตัด · เป็นสัญญาณ ไม่ใช่คำตัดสิน"
            />
          )}
          {terms.length > 0 && (
            <div>
              <p className="text-[0.65rem] text-faint mb-1">ศัพท์เฉพาะ:</p>
              <div className="space-y-1">
                {terms.map((t, i) => (
                  <div key={`${t.rule}-${i}`} className="flex items-center gap-2 text-xs">
                    <span className="px-2 py-0.5 rounded border border-rose-700/40 text-rose-700">
                      {t.kind === "dropped-term" ? "หาย" : t.kind === "wrong-case" ? "ตัวพิมพ์" : "คำต้องห้าม"} ×{t.count}
                    </span>
                    <span className="text-slate-700">{t.detail}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {exp && terms.length === 0 && rules.length > 0 && (
            <p className="text-xs text-green-800">✓ ศัพท์เฉพาะครบตามที่ประกาศไว้</p>
          )}
          <p className="text-[0.6rem] text-faint">ทุกอย่างทำงานในเบราว์เซอร์ ไม่เรียก AI · อัตราส่วนความยาวและการนับศัพท์เป็นสัญญาณ ไม่ใช่คำตัดสินคุณภาพการแปล</p>
        </div>
      )}
    </div>
  );
}

/** A tiny per-chapter presence strip — each cell shaded by mention count. A sparkline of
 *  a real count series, not a curve fit to an invented arc score. */
function PresenceStrip({ series }: { series: number[] }) {
  const max = Math.max(...series, 1);
  return (
    <div className="flex gap-0.5" title={series.join(" · ")}>
      {series.map((c, i) => (
        <span
          key={i}
          className="inline-block w-2.5 h-4 rounded-sm"
          style={{ background: c === 0 ? "rgba(20,22,28,0.05)" : `rgba(217,166,58,${0.25 + 0.6 * (c / max)})` }}
        />
      ))}
    </div>
  );
}

/** Narrative Intelligence, the HONEST way — the deterministic replacement for a competitor's
 *  "narrative_consistency 73 / arc_coherence 68" panel. Character presence across chapters
 *  (with gap/exit flags), pacing across the three acts (measured averages + threshold flags),
 *  and motif distribution. Every value is a count or a disclosed flag — never a 0–100 score. */
function NarrativeView({ text, lang, names, chapterSignals }: { text: string; lang: "th" | "en"; names: string[]; chapterSignals: ChapterSignal[] }) {
  const [motifRaw, setMotifRaw] = useState("");
  const arcs = useMemo(() => (names.length ? characterArc(text, names, lang) : null), [text, names, lang]);
  const pacing = useMemo(() => pacingProfile(chapterSignals), [chapterSignals]);
  const motifTerms = useMemo(() => motifRaw.split(/[,\n]+/).map((m) => m.trim()).filter(Boolean), [motifRaw]);
  const motifs = useMemo(() => (motifTerms.length ? motifTracker(text, motifTerms, lang) : null), [text, motifTerms, lang]);
  const th = lang === "th";
  if (chapterSignals.length < 2) return null;
  return (
    <div className="space-y-4">
      <h3 className="text-xs font-semibold tracking-widest text-slate-600 uppercase">
        {th ? "ปัญญาการเล่าเรื่อง (นับได้ · ไม่ใช่คะแนน 0–100)" : "Narrative intelligence (counted · not a 0–100 score)"}
      </h3>

      {arcs && arcs.characters.some((c) => c.total > 0) && (
        <div>
          <p className="text-[0.65rem] text-faint mb-1.5">{th ? "การปรากฏของตัวละครรายบท:" : "Character presence by chapter:"}</p>
          <div className="space-y-1.5">
            {arcs.characters.filter((c) => c.total > 0).map((c) => (
              <div key={c.name} className="flex items-center gap-2 flex-wrap text-xs">
                <span className="w-24 shrink-0 truncate text-slate-700" title={c.name}>{c.name}</span>
                <PresenceStrip series={c.perChapter} />
                <span className="text-[0.62rem] text-faint">{th ? "บท" : "ch"} {c.firstChapter}–{c.lastChapter}</span>
                {c.gaps.length > 0 && <span className="text-[0.62rem] text-amber-800">⚠ {th ? "หายช่วงบท" : "gap ch"} {c.gaps.map((g) => `${g.from}-${g.to}`).join(", ")}</span>}
                {c.exitsEarly && <span className="text-[0.62rem] text-orange-800">⚠ {th ? "หายก่อนจบ" : "exits early"}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {pacing.acts.length > 0 && (
        <div>
          <p className="text-[0.65rem] text-faint mb-1.5">{th ? "จังหวะรายองก์ (ค่าเฉลี่ยสัญญาณที่วัดได้):" : "Pacing by act (measured-signal averages):"}</p>
          <div className="overflow-x-auto rounded-lg border border-black/10">
            <table className="w-full text-[0.7rem]">
              <thead>
                <tr className="text-faint border-b border-black/10">
                  <th className="text-left px-2 py-1.5 font-medium">{th ? "องก์" : "Act"}</th>
                  <th className="px-2 py-1.5 font-medium">{th ? "คำ/บท" : "words"}</th>
                  <th className="px-2 py-1.5 font-medium">{th ? "บทพูด%" : "dialogue%"}</th>
                  <th className="px-2 py-1.5 font-medium">{th ? "บอก/100" : "telling/100"}</th>
                  <th className="px-2 py-1.5 font-medium">{th ? "ผัสสะ/1k" : "sensory/1k"}</th>
                </tr>
              </thead>
              <tbody>
                {pacing.acts.map((a) => (
                  <tr key={a.act} className="border-b border-black/5 last:border-0">
                    <td className="text-left px-2 py-1 text-slate-700">{th ? { beginning: "เปิด", middle: "กลาง", end: "ปิด" }[a.act] : a.act} <span className="text-faint">({a.chapters[0]}–{a.chapters[a.chapters.length - 1]})</span></td>
                    <td className="px-2 py-1 text-center tabular-nums text-slate-600">{a.avgWords}</td>
                    <td className="px-2 py-1 text-center tabular-nums text-slate-600">{a.avgDialogue}</td>
                    <td className="px-2 py-1 text-center tabular-nums text-slate-600">{a.avgTelling}</td>
                    <td className="px-2 py-1 text-center tabular-nums text-slate-600">{a.avgSensory}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pacing.flags.map((f, i) => (
            <p key={i} className="text-[0.62rem] text-cyan-700 mt-1">• {f}</p>
          ))}
        </div>
      )}

      <div>
        <p className="text-[0.65rem] text-faint mb-1">{th ? "ติดตาม motif/แก่น (ใส่คำ คั่นด้วยจุลภาค):" : "Track motifs/themes (comma-separated):"}</p>
        <input
          value={motifRaw}
          onChange={(e) => setMotifRaw(e.target.value)}
          placeholder={th ? "เช่น ดาบ, คำสัญญา, สายฝน" : "e.g. sword, promise, rain"}
          className="w-full text-xs px-2.5 py-1.5 rounded border border-black/10 bg-black/[0.03] text-slate-800 placeholder:text-faint focus:border-[#7a5c12]/50 focus:outline-none"
        />
        {motifs && motifs.motifs.length > 0 && (
          <div className="space-y-1.5 mt-2">
            {motifs.motifs.map((m) => (
              <div key={m.term} className="flex items-center gap-2 flex-wrap text-xs">
                <span className="w-24 shrink-0 truncate text-slate-700" title={m.term}>{m.term}</span>
                <PresenceStrip series={m.perChapter} />
                <span className="text-[0.62rem] text-faint">{m.total}× · {th ? "อยู่" : "in"} {m.chaptersPresent}/{motifs.chapters} {th ? "บท" : "ch"}</span>
                {m.longestAbsentRun >= 3 && <span className="text-[0.62rem] text-amber-800">⚠ {th ? "เงียบยาว" : "silent"} {m.longestAbsentRun} {th ? "บท" : "ch"}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
      <p className="text-[0.6rem] text-faint">
        {th ? "ทุกค่าเป็นการนับ/ธงที่ตรวจซ้ำได้ · ไม่มีคะแนน consistency/arc/resonance แบบเดา (ดูชั้นญาณวิทยา)" : "Every value is a re-derivable count or flag · no invented consistency/arc/resonance score."}
      </p>
    </div>
  );
}

/** The epistemic panel — the honesty engine made visible. It badges the analyzer's own
 *  outputs by WHAT KIND OF KNOWING each is (ประจักษ์ direct count → อนุมาน derived → สัญญา
 *  heuristic label), then shows the constructs Bookisdom REFUSES to score and why. Foldable;
 *  it's the "why you can trust this number — and where its limit is" layer. */
const TIER_TONE: Record<string, string> = {
  paccakkha: "var(--tier-1, #166534)",
  anumana: "var(--tier-2, #1d4ed8)",
  sanna: "var(--tier-3, #92400e)",
};
function EpistemicPanel({ ids }: { ids: string[] }) {
  const [open, setOpen] = useState(false);
  const groups = useMemo(() => groupByTier(ids), [ids]);
  const kalama = useMemo(() => llmKalamaViolations(), []);
  if (!groups.length) return null;
  return (
    <div className="rounded-xl border border-[#7a5c12]/25 bg-[#d9a63a]/[0.04] p-3">
      <button onClick={() => setOpen((v) => !v)} className="w-full text-left">
        <h3 className="text-xs font-semibold tracking-widest text-[#7a5c12] uppercase">
          ญาณวิทยา · ทำไมเชื่อตัวเลขนี้ได้ (และเส้นที่เราไม่ข้าม) {open ? "−" : "+"}
        </h3>
      </button>
      <p className="text-[0.62rem] text-faint mt-1">{YATHABHUTA}</p>
      {open && (
        <div className="mt-3 space-y-3">
          {groups.map((g) => (
            <div key={g.tier.id}>
              <div className="flex items-center gap-2 mb-1">
                <span className="inline-block w-2 h-2 rounded-full" style={{ background: TIER_TONE[g.tier.id] ?? "#4b5563" }} />
                <span className="text-xs font-semibold text-slate-800">{g.tier.thai}</span>
                <span className="text-[0.6rem] text-faint italic">{g.tier.pali}</span>
              </div>
              <p className="text-[0.62rem] text-faint mb-1.5 pl-4">{g.tier.gloss}</p>
              <div className="flex flex-wrap gap-1.5 pl-4">
                {g.signals.map((s) => (
                  <span
                    key={s.id}
                    title={warrant(s.id) ?? ""}
                    className="text-[0.68rem] px-2 py-0.5 rounded border cursor-help"
                    style={{ borderColor: (TIER_TONE[g.tier.id] ?? "#4b5563") + "66", color: TIER_TONE[g.tier.id] ?? "#4b5563" }}
                  >
                    {s.thai} · {s.level}
                  </span>
                ))}
              </div>
            </div>
          ))}
          <div className="pt-1 border-t border-black/10">
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-block w-2 h-2 rounded-full bg-rose-400/70" />
              <span className="text-xs font-semibold text-rose-700">อวิสัย · เกินวิสัยของเครื่องนี้ — เราปฏิเสธที่จะให้คะแนน</span>
            </div>
            <div className="flex flex-col gap-1 pl-4">
              {REFUSED_CONSTRUCTS.map((c) => (
                <div key={c.id} className="text-[0.66rem] text-slate-600">
                  <span className="text-rose-700 line-through">{c.thai}</span> — {c.why}
                </div>
              ))}
            </div>
          </div>
          <p className="text-[0.62rem] text-faint pl-4 pt-1 border-t border-black/10">
            กาลามสูตรระบุ {kalama.length} ใน 10 ฐานที่คะแนน LLM พึ่งพา — รวมข้อ 6 “เพราะการอนุมาน” และข้อ 9 “เพราะดูน่าเชื่อถือ”.
            ตัวเลขทุกตัวข้างบนตรวจซ้ำเองได้ (paccakkha/anumāna) — เราเปิดเผยเครื่องมือเสมอ (ชี้ที่ป้ายเพื่อดู warrant)
          </p>
        </div>
      )}
    </div>
  );
}

type Delta = { label: string; before: number; after: number; delta: number; good: "lower" | "higher" | "neutral" };

function DeltaTable({ title, deltas, note }: { title: string; deltas: Delta[]; note: string }) {
  return (
    <div className="mt-4">
      <h3 className="text-xs font-semibold tracking-widest text-slate-600 uppercase mb-2">{title}</h3>
      <div className="rounded-lg border border-black/10 overflow-hidden">
        {deltas.map((d) => {
          const improved = d.good === "lower" ? d.delta < 0 : d.good === "higher" ? d.delta > 0 : null;
          const color = d.delta === 0 || improved === null ? "text-slate-600" : improved ? "text-green-800" : "text-red-700";
          return (
            <div key={d.label} className="flex items-center justify-between px-3 py-1.5 text-xs border-b border-black/5 last:border-0">
              <span className="text-slate-700">{d.label}</span>
              <span className="flex items-center gap-2">
                <span className="text-faint">{d.before} → {d.after}</span>
                <span className={`w-12 text-right tabular-nums ${color}`}>{d.delta > 0 ? `+${d.delta}` : d.delta}</span>
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-[0.6rem] text-faint mt-1">{note}</p>
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
      <h3 className="text-xs font-semibold tracking-widest text-slate-600 uppercase mb-2">{title}</h3>
      <div className="overflow-x-auto rounded-lg border border-black/10">
        <table className="w-full text-[0.7rem]">
          <thead>
            <tr className="text-faint border-b border-black/10">
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
                className={`border-b border-black/5 last:border-0 ${onRowClick ? "cursor-pointer hover:bg-black/[0.04]" : ""}`}
              >
                <td className="text-left px-2 py-1 text-slate-700 truncate max-w-[160px]" title={r.title}>{r.title}</td>
                {r.cells.map((c, j) => (
                  <td key={j} className={`px-2 py-1 text-center tabular-nums ${c.bad ? "text-red-700 font-semibold" : "text-slate-600"}`}>{c.value}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[0.6rem] text-faint mt-1">{note}</p>
    </div>
  );
}

function DiffView({ ops }: { ops: DiffOp[] | null }) {
  if (!ops) return <p className="text-[0.65rem] text-faint mt-2">ข้อความยาวเกินไปสำหรับ inline diff — ดูที่ตาราง metric ด้านบน / Too long for inline diff.</p>;
  return (
    <div className="mt-2 text-xs leading-6 bg-[#f3f5f9] border border-black/5 rounded-lg p-3 max-h-[200px] overflow-y-auto whitespace-pre-wrap">
      {ops.map((op, i) =>
        op.type === "same" ? (
          <span key={i} className="text-faint">{op.text} </span>
        ) : op.type === "add" ? (
          <span key={i} className="text-green-800 bg-green-400/10">{op.text} </span>
        ) : (
          <span key={i} className="text-red-700 line-through">{op.text} </span>
        )
      )}
    </div>
  );
}

function Mechanics({ items, title }: { items: { issue: string; count: number }[]; title: string }) {
  return (
    <div>
      <h3 className="text-xs font-semibold tracking-widest text-slate-600 uppercase mb-2">{title}</h3>
      {items.length === 0 ? (
        <p className="text-xs text-green-800">✓ —</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {items.map((mm) => (
            <span key={mm.issue} className="text-xs px-2 py-0.5 rounded border border-amber-700/40 text-amber-800">
              {mm.issue} ×{mm.count}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Saved-manuscript bar: load / save / delete named drafts in IndexedDB. */
function ManuscriptBar({ lang, text, onLoad }: { lang: "th" | "en"; text: string; onLoad: (t: string) => void }) {
  const [items, setItems] = useState<StoredManuscript[]>([]);
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("");
  const refresh = () => void listManuscripts(lang).then(setItems);
  useEffect(refresh, [lang]);

  const load = (id: string) => {
    setSelected(id);
    if (!id) return;
    void getManuscript(id).then((m) => {
      if (m) onLoad(m.text);
    });
  };
  const save = async () => {
    if (!text.trim()) return;
    const title = name.trim() || `${lang === "th" ? "ฉบับ" : "Draft"} ${new Date().toLocaleString()}`;
    let rec;
    try {
      rec = await saveManuscript({ title, lang, text });
    } catch {
      // Both stores failed (storage full) — the draft was NOT saved. Tell the writer
      // instead of pretending success, and point them at the .md download as a lifeboat.
      toast(lang === "th"
        ? "บันทึกไม่สำเร็จ — พื้นที่เก็บของเบราว์เซอร์เต็ม ฉบับนี้ยังไม่ถูกบันทึก กรุณาดาวน์โหลด .md เก็บไว้ แล้วลบฉบับเก่าออกก่อน"
        : "Save failed — the browser's storage is full, so this draft was NOT saved. Download the .md to keep it, then delete old drafts.", { variant: "error" });
      return;
    }
    setName("");
    refresh();
    setSelected(rec.id);
    // A mature app confirms the save instead of leaving the writer guessing.
    toast(lang === "th" ? `บันทึก "${rec.title}" แล้ว` : `Saved "${rec.title}"`, { variant: "success" });
    if (await storeNearQuota()) {
      toast(lang === "th"
        ? "พื้นที่เก็บฉบับใกล้เต็ม (~70% ของเพดานเบราว์เซอร์) — แนะนำลบฉบับเก่า หรือดาวน์โหลด .md เก็บไว้ก่อน"
        : "Draft storage is near the browser's ceiling (~70%) — delete old drafts or download .md backups.", { variant: "info" });
    }
  };
  const remove = async () => {
    if (!selected) return;
    await deleteManuscript(selected);
    setSelected("");
    refresh();
  };

  return (
    <div className="flex flex-wrap items-center gap-2 mb-2">
      <select
        value={selected}
        onChange={(e) => load(e.target.value)}
        aria-label={lang === "th" ? "โหลดฉบับที่บันทึก" : "Load saved manuscript"}
        className="text-xs bg-[#f3f5f9] border border-black/10 rounded px-2 py-1 text-slate-700 max-w-[180px]"
      >
        <option value="">{lang === "th" ? `— โหลดฉบับ (${items.length}) —` : `— Load saved (${items.length}) —`}</option>
        {items.map((m) => (
          <option key={m.id} value={m.id}>{m.title}</option>
        ))}
      </select>
      {selected && (
        <button onClick={remove} className="text-[0.65rem] px-2 py-1 rounded border border-red-700/40 text-red-700 hover:bg-red-400/10" aria-label="Delete saved manuscript">
          <Trash2 className="w-3 h-3" />
        </button>
      )}
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={lang === "th" ? "ชื่อฉบับ…" : "name…"}
        className="text-xs bg-[#f3f5f9] border border-black/10 rounded px-2 py-1 text-slate-700 w-28"
      />
      <button onClick={save} className="text-[0.65rem] px-2.5 py-1 rounded border border-[#7a5c12]/40 text-[#7a5c12] hover:bg-[#d9a63a]/15">
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
  const [text, setText] = usePersistedState("bookisdom.analyzer.th");
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
  // Heavy passes (measured 90–215ms at 140k chars) run in the analysis worker;
  // null while in flight — the same nullable shape the render already guards.
  const a = useAnalysisTask("analyzeThai", dtext.trim() ? [dtext] : null);
  const deltas = useAnalysisTask("thaiDeltas", dtext.trim() && drevised.trim() ? [dtext, drevised] : null);
  const scanReport = useAnalysisTask("scanThai", dtext.trim() ? [dtext] : null);
  const scan = useMemo(() => scanReport ?? [], [scanReport]);
  const [glossary, setGlossary] = usePersistedState("bookisdom.analyzer.th.glossary");
  const protect = useMemo(() => parseGlossary(glossary), [glossary]);
  const nameSuggestions = useMemo(
    () => (dtext.trim() ? suggestThaiNames(dtext, protect) : []),
    [dtext, protect]
  );
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
      className="mt-2 inline-flex items-center gap-1.5 text-[0.65rem] px-2.5 py-1 rounded border border-red-700/40 text-red-700 hover:bg-red-400/10"
    >
      {copiedAudit === id ? <Check className="w-3 h-3 text-green-800" /> : <Copy className="w-3 h-3" />}
      {copiedAudit === id ? "คัดลอกแล้ว — วางใน LLM ได้เลย" : label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Thai Analyzer" className="glass-card rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6 border border-[#7a5c12]/30" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-bold accent-gradient">วิเคราะห์ภาษาไทย</h2>
          <button onClick={onClose} className="text-slate-600 hover:text-[#14161c]" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-xs text-faint mb-3">
          เครื่องมือฝั่งเบราว์เซอร์ (ไม่เรียก AI) — นับคำด้วยตัวตัดคำไทย หาคำซ้ำ/echoes และสแกนคำคลิเชแบบ AI
        </p>
        <ManuscriptBar lang="th" text={text} onLoad={setText} />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="วางข้อความภาษาไทยที่นี่…"
          className="input min-h-[140px] resize-y"
        />
        <button onClick={() => setShowCompare((v) => !v)} className="mt-2 text-[0.7rem] text-[#7a5c12] hover:underline">
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
          <button onClick={() => setShowScan((v) => !v)} className="mt-2 ml-3 text-[0.7rem] text-[#7a5c12] hover:underline">
            {showScan ? "− ซ่อนสแกนรายบท" : `+ สแกนรายบท (${scan.length} บท)`}
          </button>
        )}
        {showScan && scan.length > 1 && (
          <Heatmap
            title="heatmap รายบท — อ่านค่าฉากทุกบท (สัญญาณที่วัดได้ ไม่ใช่คะแนน 0–100)"
            headers={["คำ", "CV%", "บทพูด%", "บอกอารมณ์", "ผัสสะ/1k", "คลิเช", "echoes"]}
            rows={scan.map((c, i) => ({
              title: c.title,
              cells: [
                { value: c.words },
                { value: c.cv, bad: worst.cv === i },
                { value: c.dialogueRatio },
                { value: c.telling },
                { value: sensoryDensity(c.body, "th").per1k },
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
        {a && <div className="mt-4"><SceneReadoutView text={dtext} /></div>}
        {a && (
          <div className="mt-4">
            <EpistemicPanel ids={["wordCount", "sentenceCount", "rhythmCv", "dialogueRatio", "tellingPer100", "sensoryPer1k", "aiTells", "echoes", ...(scan.length > 1 ? ["variantClusters", "droppedTerms", "storyBibleEntries"] : []), ...(protect.length > 0 ? ["offCanon", "coEdgeWeight"] : []), "registerSuggestions"]} />
          </div>
        )}
        {a && <div className="mt-4"><SensoryView text={dtext} lang="th" /></div>}
        {a && <div className="mt-4"><RegisterView text={dtext} protect={protect} /></div>}
        {a && <div className="mt-4"><RenameView text={dtext} lang="th" /></div>}
        {a && <div className="mt-4"><OpenerView text={dtext} lang="th" /></div>}
        {a && <div className="mt-4"><RestatementView text={dtext} lang="th" /></div>}
        {a && <div className="mt-4"><TranslationView source={dtext} /></div>}
        {a && <div className="mt-4"><CodexView text={dtext} lang="th" /></div>}
        {a && <div className="mt-4"><SagaView lang="th" /></div>}
        {scan.length > 1 && (
          <div className="mt-4">
            <GlossaryInput value={glossary} onChange={setGlossary} suggestions={nameSuggestions} />
            <ConsistencyView text={dtext} lang="th" protect={protect} />
            {protect.length > 0 && (
              <div className="mt-4 space-y-4">
                <RadarView text={dtext} lang="th" canon={protect} />
                <RelationshipView text={dtext} lang="th" names={protect} />
              </div>
            )}
            <div className="mt-4">
              <NarrativeView
                text={dtext}
                lang="th"
                names={protect}
                chapterSignals={scan.map((c) => ({
                  words: c.words,
                  dialogueRatio: c.dialogueRatio,
                  tellingPer100: c.words ? Math.round((c.telling / c.words) * 1000) / 10 : 0,
                  sensoryPer1k: sensoryDensity(c.body, "th").per1k,
                }))}
              />
            </div>
          </div>
        )}
        {a && (
          <div className="mt-4 space-y-4 text-sm">
            <div className="flex gap-2 flex-wrap items-center">
              <ReportActions report={formatThaiReport(a)} filename="thai-analysis.md" />
              <EpubButton text={text} lang="th" />
              {scan.length > 1 && <BibleButton text={dtext} lang="th" protect={protect} />}
            </div>
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
                <p className="text-[0.65rem] text-cyan-700">
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
                <p className="text-[0.65rem] text-orange-800">
                  ⚠️ {a.dialogue.talkingHeadRun >= 6 ? `บทพูดต่อเนื่อง ${a.dialogue.talkingHeadRun} บรรทัดโดยไม่มี action คั่น (talking-heads)` : ""}
                  {a.dialogue.ratio > 70 ? ` · บทพูด ${a.dialogue.ratio}% อาจมากเกินไป` : ""}
                </p>
                <AuditButton id="NIS_DIALOGUE" label="คัดลอก NIS Dialogue audit + ข้อความนี้" />
              </div>
            )}

            <div>
              <h3 className="text-xs font-semibold tracking-widest text-slate-600 uppercase mb-2">
                บอก vs แสดง — คำบอกอารมณ์ตรง ๆ ({a.telling.ratio}/100 คำ)
              </h3>
              {a.telling.words.length === 0 ? (
                <p className="text-xs text-green-800">✓ ไม่พบกริยากรอง/คำบอกอารมณ์ตรง ๆ</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {a.telling.words.slice(0, 20).map((t) => (
                      <span key={t.word} className="text-xs px-2 py-0.5 rounded border border-fuchsia-700/40 text-fuchsia-700">
                        {t.word} ×{t.count}
                      </span>
                    ))}
                  </div>
                  {a.telling.ratio >= 2 && (
                    <div className="mt-1.5">
                      <p className="text-[0.65rem] text-fuchsia-700">
                        ความหนาแน่นของคำ &quot;บอก&quot; ค่อนข้างสูง — ลองเปลี่ยนช่วงที่บอกตรง ๆ ให้ &quot;แสดง&quot;
                      </p>
                      <AuditButton id="NIS_SHOW" label="คัดลอก NIS Show-vs-Tell audit + ข้อความนี้" />
                    </div>
                  )}
                </>
              )}
            </div>

            <div>
              <h3 className="text-xs font-semibold tracking-widest text-slate-600 uppercase mb-2">AI-tell / คำคลิเช</h3>
              {a.aiTells.length === 0 ? (
                <p className="text-xs text-green-800">✓ ไม่พบคำคลิเชแบบ AI</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {a.aiTells.map((t) => (
                    <span key={t.phrase} className="text-xs px-2 py-0.5 rounded border border-red-500/40 text-red-700">
                      {t.phrase} ×{t.count}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h3 className="text-xs font-semibold tracking-widest text-slate-600 uppercase mb-2">คำซ้ำใกล้กัน (ภายใน 40 คำ)</h3>
              {a.nearRepeats.length === 0 ? (
                <p className="text-xs text-faint">— ไม่พบคำเนื้อหาที่ซ้ำใกล้กัน</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {a.nearRepeats.slice(0, 20).map((e) => (
                    <span key={e.word} className="text-xs px-2 py-0.5 rounded border border-yellow-700/40 text-yellow-800">
                      {e.word} ×{e.count}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h3 className="text-xs font-semibold tracking-widest text-slate-600 uppercase mb-2">คำซ้ำบ่อย (echoes ≥3)</h3>
              {a.echoes.length === 0 ? (
                <p className="text-xs text-faint">— ไม่มีคำเนื้อหาที่ซ้ำเกิน 3 ครั้ง</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {a.echoes.slice(0, 20).map((e) => (
                    <span key={e.word} className="text-xs px-2 py-0.5 rounded border border-orange-700/40 text-orange-800">
                      {e.word} ×{e.count}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <Mechanics items={a.mechanics} title="ข้อผิดพลาดเชิงกล" />

            <div>
              <h3 className="text-xs font-semibold tracking-widest text-slate-600 uppercase mb-2">คำที่ใช้บ่อยสุด</h3>
              <div className="flex flex-wrap gap-1.5">
                {a.topWords.map((w) => (
                  <span key={w.word} className="text-xs px-2 py-0.5 rounded border border-black/10 text-slate-700">
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
    "เคล็ดจากงานวิจัย: เปิดแชทใหม่ต่อบทแทนการลากแชทเดียวยาว ๆ (บทสนทนายาวทำคุณภาพตกเฉลี่ย ~39% — arXiv:2505.06120) และอย่าคาดหวังให้โมเดลจำรายละเอียดที่ลึกเกิน ~32k token — บล็อก STATE + Codex ต่อบทของระบบนี้คือทางแก้ที่ตรงกับหลักฐาน",
  ];
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Bookisdom วิธีใช้" className="glass-card rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6 border border-[#7a5c12]/30" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold accent-gradient">Bookisdom — วิธีใช้</h2>
          <button onClick={onClose} className="text-slate-600 hover:text-[#14161c]" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-slate-700 mb-5">
          แพลตฟอร์มสร้าง <span className="text-[#7a5c12]">ชุด prompt</span> สำหรับแต่งหนังสือทุกประเภท คัดลอกไปใช้กับ LLM ตัวไหนก็ได้ (ChatGPT / Claude / Gemini) —
          ไม่ต้องมี API key ไม่มีค่า token
        </p>

        <h3 className="text-xs font-semibold tracking-widest text-slate-600 uppercase mb-2">เวิร์กโฟลว์แนะนำ</h3>
        <ol className="space-y-2 mb-5">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-3 text-sm text-slate-800">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#d9a63a]/15 text-[#7a5c12] text-xs flex items-center justify-center font-semibold">{i + 1}</span>
              <span className="leading-relaxed">{s}</span>
            </li>
          ))}
        </ol>

        <h3 className="text-xs font-semibold tracking-widest text-slate-600 uppercase mb-2">กลุ่ม Module เสริม</h3>
        <div className="space-y-1.5 mb-5">
          {MODULE_GROUPS.map((g) => (
            <div key={g.key} className="text-sm">
              <span className="text-[#7a5c12]">{g.label}</span>
              <span className="text-faint"> — {g.desc}</span>
            </div>
          ))}
        </div>

        <h3 className="text-xs font-semibold tracking-widest text-slate-600 uppercase mb-2">เลือก module อันไหน?</h3>
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
              <span className="text-[#7a5c12]">{r.goal}:</span>
              <span className="text-slate-600"> {r.items}</span>
            </div>
          ))}
        </div>

        <h3 className="text-xs font-semibold tracking-widest text-slate-600 uppercase mb-2">เครื่องมือวิเคราะห์ (ฟรี ไม่เรียก AI)</h3>
        <div className="space-y-2 mb-5 text-sm">
          <p className="text-slate-600">
            ปุ่ม <span className="text-[#7a5c12]">วิเคราะห์ไทย</span> และ <span className="text-[#7a5c12]">Prose (EN)</span> ที่หัวหน้าจอ —
            ตรวจร้อยแก้วฝั่งเบราว์เซอร์แบบ deterministic (วัดได้ โชว์ทุกคำที่ match ไม่ใช่คะแนนลอย ๆ)
          </p>
          <div><span className="text-[#7a5c12]">หาจุดน่าสงสัย:</span><span className="text-slate-600"> คำคลิเช AI · คำบอกอารมณ์ (telling) · จังหวะประโยคแบน · คำซ้ำ · (EN) AI-slop, filter words, -ly adverbs, passive, Flesch readability</span></div>
          <div><span className="text-[#7a5c12]">เทียบฉบับแก้:</span><span className="text-slate-600"> วางก่อน→หลัง เห็น delta ว่าการแก้ดีขึ้นจริงไหมตามตัวเลข</span></div>
          <div><span className="text-[#7a5c12]">สแกนรายบท:</span><span className="text-slate-600"> วางทั้งเล่ม → heatmap บอกบทที่อ่อนสุดต่อ signal</span></div>
          <div><span className="text-[#7a5c12]">ปิด loop:</span><span className="text-slate-600"> เจอจุดอ่อนแล้วกดปุ่มเดียว คัดลอก NIS audit ที่เกี่ยวพร้อมแปะข้อความให้ → วางใน LLM เจาะเฉพาะจุด (ประหยัด token)</span></div>
          <div><span className="text-[#7a5c12]">ส่งออก:</span><span className="text-slate-600"> Copy report / Download .md เก็บไว้เทียบ draft</span></div>
        </div>

        <h3 className="text-xs font-semibold tracking-widest text-slate-600 uppercase mb-2">เคล็ดลับ</h3>
        <ul className="space-y-1.5 text-sm text-slate-700 list-disc list-inside marker:text-[#7a5c12]">
          <li><span className="text-slate-800">ภาษา prompt:</span> สลับ “ไทยทั้งชุด” ได้ที่ Prompt Language</li>
          <li><span className="text-slate-800">Continuity:</span> Story Bible / STATE ฉีดเข้าทุกบท — แก้ที่เดียวใช้ทั้งเล่ม</li>
          <li><span className="text-slate-800">เซฟงาน:</span> ปุ่ม Save เก็บ project ไว้ในบัญชี (ต้องล็อกอิน); การตั้งค่าล่าสุด (รวม Story Bible) ถูกเก็บอัตโนมัติในเบราว์เซอร์ ไม่หายตอน reload</li>
          <li><span className="text-slate-800">ส่งออก:</span> Copy ราย prompt / Copy all / Download .md หรือ .json</li>
          <li><span className="text-slate-800">Preset:</span> แนะนำ / ทั้งหมด / ล้าง เลือกกลุ่ม module ได้เร็ว</li>
        </ul>
      </div>
    </div>
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
  const [text, setText] = usePersistedState("bookisdom.analyzer.en");
  const [revised, setRevised] = useState("");
  const [showCompare, setShowCompare] = useState(false);
  const [showScan, setShowScan] = useState(false);
  const [copiedAudit, setCopiedAudit] = useState<string | null>(null);
  const dtext = useDebounced(text);
  const drevised = useDebounced(revised);
  // Heavy passes run in the analysis worker (see _analysis-tasks.ts for the
  // measured-threshold rule); null while in flight — render already guards.
  const a = useAnalysisTask("analyzeProse", dtext.trim() ? [dtext] : null);
  useEffect(() => {
    if (initialText) setText(initialText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const deltas = useAnalysisTask("proseDeltas", dtext.trim() && drevised.trim() ? [dtext, drevised] : null);
  const scanReport = useAnalysisTask("scanProse", dtext.trim() ? [dtext] : null);
  const scan = useMemo(() => scanReport ?? [], [scanReport]);
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
      className="mt-2 inline-flex items-center gap-1.5 text-[0.65rem] px-2.5 py-1 rounded border border-red-700/40 text-red-700 hover:bg-red-400/10"
    >
      {copiedAudit === id ? <Check className="w-3 h-3 text-green-800" /> : <Copy className="w-3 h-3" />}
      {copiedAudit === id ? "Copied — paste into any LLM" : label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Prose Analyzer" className="glass-card rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6 border border-[#7a5c12]/30" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-bold accent-gradient">Prose Analyzer (English)</h2>
          <button onClick={onClose} className="text-slate-600 hover:text-[#14161c]" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-xs text-faint mb-3">
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
          className="mt-2 text-[0.7rem] text-[#7a5c12] hover:underline"
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
            className="mt-2 ml-3 text-[0.7rem] text-[#7a5c12] hover:underline"
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
        {a && <div className="mt-4"><SensoryView text={dtext} lang="en" /></div>}
        {a && (
          <div className="mt-4">
            <EpistemicPanel ids={["wordCount", "sentenceCount", "rhythmCv", "dialogueRatio", "tellingPer100", "sensoryPer1k", "aiTells", "echoes", ...(scan.length > 1 ? ["variantClusters", "droppedTerms", "storyBibleEntries"] : [])]} />
          </div>
        )}
        {a && <div className="mt-4"><RenameView text={dtext} lang="en" /></div>}
        {a && <div className="mt-4"><OpenerView text={dtext} lang="en" /></div>}
        {a && <div className="mt-4"><RestatementView text={dtext} lang="en" /></div>}
        {a && <div className="mt-4"><CodexView text={dtext} lang="en" /></div>}
        {a && <div className="mt-4"><SagaView lang="en" /></div>}
        {scan.length > 1 && <ConsistencyView text={dtext} lang="en" />}
        {a && (
          <div className="mt-4 space-y-4 text-sm">
            <div className="flex gap-2 flex-wrap items-center">
              <ReportActions report={formatProseReport(a)} filename="prose-analysis.md" />
              <EpubButton text={text} lang="en" />
              {scan.length > 1 && <BibleButton text={dtext} lang="en" />}
            </div>
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
              <p className="text-[0.6rem] text-faint">
                Reading Ease 60–70 ≈ plain English · higher = easier. Estimate (heuristic syllables).
              </p>
              <AuditButton id="READABILITY" label="Copy Readability Control rewrite + this text" />
            </div>
            {a.sentences.count >= 4 && (a.rhythm.cv < 35 || a.rhythm.monotonyRun >= 5) && (
              <div>
                <p className="text-[0.65rem] text-cyan-700">
                  ⚠️ Flat rhythm — sentence lengths are very uniform (CV {a.rhythm.cv}%
                  {a.rhythm.monotonyRun >= 5 ? ` · ${a.rhythm.monotonyRun} same-length in a row` : ""}). Vary short and long.
                </p>
                <AuditButton id="NIS_PACING" label="Copy NIS Pacing audit + this text" />
              </div>
            )}

            <div>
              <h3 className="text-xs font-semibold tracking-widest text-slate-600 uppercase mb-2">AI-slop words / formulas</h3>
              {a.slop.length === 0 ? (
                <p className="text-xs text-green-800">✓ No AI-slop terms found</p>
              ) : (
                <>
                  <Chips items={a.slop} tone="border-red-500/40 text-red-700" />
                  <AuditButton id="ANTI_SLOP" label="Copy Anti-AI-Slop rewrite + this text" />
                </>
              )}
            </div>

            <div>
              <h3 className="text-xs font-semibold tracking-widest text-slate-600 uppercase mb-2">
                Told emotions ({a.telling.ratio}/100 words)
              </h3>
              {a.telling.words.length === 0 ? (
                <p className="text-xs text-green-800">✓ No directly-named emotions</p>
              ) : (
                <>
                  <Chips items={a.telling.words} tone="border-fuchsia-700/40 text-fuchsia-700" />
                  {a.telling.ratio >= 1.5 && <AuditButton id="NIS_SHOW" label="Copy NIS Show-vs-Tell audit + this text" />}
                </>
              )}
            </div>

            <div>
              <h3 className="text-xs font-semibold tracking-widest text-slate-600 uppercase mb-2">
                Filter / crutch words ({a.filterWords.reduce((s, w) => s + w.count, 0)})
              </h3>
              {a.filterWords.length === 0 ? (
                <p className="text-xs text-faint">— none</p>
              ) : (
                <Chips items={a.filterWords} tone="border-yellow-700/40 text-yellow-800" />
              )}
            </div>

            <div>
              <h3 className="text-xs font-semibold tracking-widest text-slate-600 uppercase mb-2">
                -ly adverbs ({a.adverbs.ratio}/100 words)
              </h3>
              {a.adverbs.words.length === 0 ? (
                <p className="text-xs text-faint">— none</p>
              ) : (
                <Chips items={a.adverbs.words} tone="border-orange-700/40 text-orange-800" />
              )}
            </div>

            <div>
              <h3 className="text-xs font-semibold tracking-widest text-slate-600 uppercase mb-2">
                Possible passive voice ({a.passive.count})
              </h3>
              {a.passive.count === 0 ? (
                <p className="text-xs text-green-800">✓ No likely passive constructions</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {a.passive.samples.map((s, i) => (
                      <span key={`${s}-${i}`} className="text-xs px-2 py-0.5 rounded border border-blue-700/40 text-blue-700">
                        {s}
                      </span>
                    ))}
                  </div>
                  <p className="text-[0.6rem] text-faint mt-1">Heuristic (be-verb + participle) — verify each; some, like &quot;was tired&quot;, are not passive.</p>
                  <AuditButton id="LINE_EDIT" label="Copy Line Edit + this text" />
                </>
              )}
            </div>

            <div>
              <h3 className="text-xs font-semibold tracking-widest text-slate-600 uppercase mb-2">Repeated words (echoes ≥4)</h3>
              {a.echoes.length === 0 ? (
                <p className="text-xs text-faint">— no over-repeated content words</p>
              ) : (
                <Chips items={a.echoes} tone="border-orange-700/40 text-orange-800" />
              )}
            </div>

            <Mechanics items={a.mechanics} title="Mechanics" />
          </div>
        )}
      </div>
    </div>
  );
}
