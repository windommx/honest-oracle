"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Crown, BookMarked, Copy, Check, LayoutGrid, Play, Wand2, AlertTriangle } from "lucide-react";
import { toast } from "../_toast";
import {
  kdpReadiness, kdpMetadataChecks, formatKdpPackage, TRIM, KDP_LIMITS, KDP_AI_DISCLOSURE, MIN_PAGES_PAPERBACK, MIN_PAGES_HARDCOVER,
  type TrimSize, type PaperWeight, type KdpMeta,
} from "@/lib/bookisdom-engine/kdp";
import { listManuscripts, type StoredManuscript } from "../_manuscript-store";
import { countManuscriptWords } from "../_word-count";

// ╔══════════════════════════════════════════════════════════════════╗
// ║  /bookisdom/kdp — the screen kdp.ts never had.                    ║
// ║                                                                    ║
// ║  Every number here is either Amazon's published formula (spine =  ║
// ║  pages ÷ PPI; bleed 0.125"; field limits) or a count the writer    ║
// ║  supplied. The page estimate is labelled an ESTIMATE because it    ║
// ║  is one (words ÷ a per-trim words-per-page figure) — verify in the ║
// ║  KDP previewer. There is no "readiness score": the checklist is a  ║
// ║  list of rules, each true or false, and "ready" means all are true.║
// ║  What the page cannot do is printed at the bottom, not hidden.     ║
// ╚══════════════════════════════════════════════════════════════════╝

const PAPERS: { id: PaperWeight; label: string }[] = [
  { id: "50_white", label: "50 lb ขาว (444 หน้า/นิ้ว)" },
  { id: "60_cream", label: "60 lb ครีม (400 หน้า/นิ้ว)" },
  { id: "70_white", label: "70 lb ขาว (370 หน้า/นิ้ว)" },
];
const TRIMS = Object.keys(TRIM) as TrimSize[];

const splitList = (s: string) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);

export default function KdpPage() {
  const [manuscripts, setManuscripts] = useState<StoredManuscript[]>([]);
  const [sourceId, setSourceId] = useState<string>("");
  const [words, setWords] = useState<string>("");
  const [counting, setCounting] = useState(false);
  const [trim, setTrim] = useState<TrimSize>("6x9");
  const [paper, setPaper] = useState<PaperWeight>("60_cream");
  const [binding, setBinding] = useState<"paperback" | "hardcover">("paperback");
  const [meta, setMeta] = useState<KdpMeta & { keywordsText: string; categoriesText: string }>({
    title: "", subtitle: "", author: "", description: "", keywordsText: "", categoriesText: "",
  });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    listManuscripts().then(setManuscripts).catch(() => setManuscripts([]));
  }, []);

  async function pickManuscript(id: string) {
    setSourceId(id);
    const m = manuscripts.find((x) => x.id === id);
    if (!m) return;
    setCounting(true);
    try {
      const n = await countManuscriptWords(m);
      setWords(String(n));
      if (!meta.title) setMeta((s) => ({ ...s, title: m.title }));
    } finally {
      setCounting(false);
    }
  }

  const wordsNum = Number(words);
  const hasWords = Number.isFinite(wordsNum) && wordsNum > 0;
  const metaInput: KdpMeta = useMemo(() => ({
    title: meta.title?.trim() || undefined,
    subtitle: meta.subtitle?.trim() || undefined,
    author: meta.author?.trim() || undefined,
    description: meta.description?.trim() || undefined,
    keywords: splitList(meta.keywordsText),
    categories: splitList(meta.categoriesText),
  }), [meta]);
  const input = useMemo(() => ({ words: hasWords ? wordsNum : NaN, trim, paper, binding, meta: metaInput }), [hasWords, wordsNum, trim, paper, binding, metaInput]);
  const r = useMemo(() => kdpReadiness(input), [input]);
  // Without a word count the print rules have nothing to judge — showing them would print
  // "NaN words" and a 0.003" spine as if measured. Only the metadata rules are checkable
  // then; the print rules join the list the moment a count exists.
  const checks = hasWords ? r.checks : kdpMetadataChecks(metaInput);
  const failing = checks.filter((c) => !c.ok).length;

  async function copyPackage() {
    const md = formatKdpPackage(input);
    try {
      await navigator.clipboard.writeText(md);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast("คัดลอก KDP package (Markdown) แล้ว");
    } catch {
      toast("คัดลอกไม่สำเร็จ — เบราว์เซอร์ไม่อนุญาตให้เข้าถึงคลิปบอร์ด", { variant: "error" });
    }
  }

  const desc = meta.description ?? "";
  const kw = splitList(meta.keywordsText);
  const cats = splitList(meta.categoriesText);
  const minPages = binding === "hardcover" ? MIN_PAGES_HARDCOVER : MIN_PAGES_PAPERBACK;

  return (
    <div className="min-h-screen bg-[#0b0e17]">
      <nav className="fixed top-0 left-0 right-0 z-50 glass-card">
        <div className="max-w-5xl mx-auto px-4 py-4 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2">
            <Crown className="w-7 h-7 text-[#ab5bf7]" />
            <span className="text-lg font-semibold accent-gradient">NaraClear</span>
          </Link>
          <div className="flex items-center gap-3 text-xs">
            <Link href="/bookisdom" className="text-slate-400 hover:text-[#ab5bf7] flex items-center gap-1"><Wand2 className="w-3.5 h-3.5" />เครื่องมือ prompt</Link>
            <Link href="/bookisdom/dashboard" className="text-slate-400 hover:text-[#ab5bf7] flex items-center gap-1"><LayoutGrid className="w-3.5 h-3.5" />แดชบอร์ด</Link>
            <Link href="/bookisdom/studio" className="text-slate-400 hover:text-[#ab5bf7] flex items-center gap-1"><Play className="w-3.5 h-3.5" />Studio</Link>
            <span className="flex items-center gap-1.5 text-[#ab5bf7] border border-[#ab5bf7]/30 rounded-lg px-3 py-1.5">
              <BookMarked className="w-3.5 h-3.5" /> KDP
            </span>
          </div>
        </div>
      </nav>

      <div className="pt-24 pb-16 px-4">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-3xl font-bold accent-gradient">เตรียมส่ง KDP</h1>
          <p className="text-slate-400 mt-1 text-sm mb-6 max-w-2xl">
            สันปก ขนาดปกเต็ม และเช็กลิสต์ metadata จากสูตรที่ Amazon เผยแพร่ — ไม่มีคะแนน มีแต่กฎที่ผ่านหรือไม่ผ่าน
            จำนวนหน้าเป็น<span className="text-slate-300">ค่าประมาณ</span> (คำ ÷ คำต่อหน้าของขนาดเล่ม) ตรวจซ้ำใน KDP previewer เสมอ
          </p>

          <div className="grid lg:grid-cols-2 gap-5">
            {/* left: inputs */}
            <div className="space-y-4">
              <section className="rounded-xl border border-white/10 bg-[#151a27] p-4 space-y-3">
                <h2 className="text-xs uppercase tracking-wider text-faint font-semibold">ต้นฉบับ</h2>
                <label className="block">
                  <span className="block text-[0.7rem] text-slate-400 mb-1">นับคำจากต้นฉบับที่บันทึกไว้</span>
                  <select value={sourceId} onChange={(e) => void pickManuscript(e.target.value)} className="input" aria-label="เลือกต้นฉบับ">
                    <option value="">— พิมพ์จำนวนคำเอง —</option>
                    {manuscripts.map((m) => <option key={m.id} value={m.id}>{m.title} ({m.lang.toUpperCase()})</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-[0.7rem] text-slate-400 mb-1">จำนวนคำ {counting && <span className="text-faint">(กำลังนับ…)</span>}</span>
                  <input type="number" min={1} inputMode="numeric" value={words} onChange={(e) => { setWords(e.target.value); setSourceId(""); }} placeholder="เช่น 60000" className="input" aria-label="จำนวนคำ" />
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <label className="block">
                    <span className="block text-[0.7rem] text-slate-400 mb-1">ขนาดเล่ม (นิ้ว)</span>
                    <select value={trim} onChange={(e) => setTrim(e.target.value as TrimSize)} className="input" aria-label="ขนาดเล่ม">
                      {TRIMS.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="block text-[0.7rem] text-slate-400 mb-1">กระดาษ</span>
                    <select value={paper} onChange={(e) => setPaper(e.target.value as PaperWeight)} className="input" aria-label="กระดาษ">
                      {PAPERS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="block text-[0.7rem] text-slate-400 mb-1">การเข้าเล่ม</span>
                    <select value={binding} onChange={(e) => setBinding(e.target.value as "paperback" | "hardcover")} className="input" aria-label="การเข้าเล่ม">
                      <option value="paperback">ปกอ่อน (≥ {MIN_PAGES_PAPERBACK} หน้า)</option>
                      <option value="hardcover">ปกแข็ง (≥ {MIN_PAGES_HARDCOVER} หน้า)</option>
                    </select>
                  </label>
                </div>
              </section>

              <section className="rounded-xl border border-white/10 bg-[#151a27] p-4 space-y-3">
                <h2 className="text-xs uppercase tracking-wider text-faint font-semibold">Metadata (ขีดจำกัดจริงของ Amazon)</h2>
                <label className="block">
                  <span className="flex justify-between text-[0.7rem] text-slate-400 mb-1"><span>ชื่อเรื่อง</span><span className="tabular-nums">{(meta.title ?? "").length}/{KDP_LIMITS.title}</span></span>
                  <input value={meta.title} onChange={(e) => setMeta((s) => ({ ...s, title: e.target.value }))} className="input" aria-label="ชื่อเรื่อง" />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="flex justify-between text-[0.7rem] text-slate-400 mb-1"><span>ชื่อรอง</span><span className="tabular-nums">{(meta.subtitle ?? "").length}/{KDP_LIMITS.subtitle}</span></span>
                    <input value={meta.subtitle} onChange={(e) => setMeta((s) => ({ ...s, subtitle: e.target.value }))} className="input" aria-label="ชื่อรอง" />
                  </label>
                  <label className="block">
                    <span className="block text-[0.7rem] text-slate-400 mb-1">ผู้เขียน</span>
                    <input value={meta.author} onChange={(e) => setMeta((s) => ({ ...s, author: e.target.value }))} className="input" aria-label="ผู้เขียน" />
                  </label>
                </div>
                <label className="block">
                  <span className="flex justify-between text-[0.7rem] text-slate-400 mb-1"><span>คำโปรย</span><span className="tabular-nums">{desc.trim().length}/{KDP_LIMITS.description} (ขั้นต่ำ {KDP_LIMITS.descriptionMin})</span></span>
                  <textarea value={meta.description} onChange={(e) => setMeta((s) => ({ ...s, description: e.target.value }))} className="input min-h-[110px] resize-y" aria-label="คำโปรย" />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="flex justify-between text-[0.7rem] text-slate-400 mb-1"><span>คีย์เวิร์ด (คั่นด้วย , หรือขึ้นบรรทัดใหม่)</span><span className="tabular-nums">{kw.length}/{KDP_LIMITS.keywords}</span></span>
                    <textarea value={meta.keywordsText} onChange={(e) => setMeta((s) => ({ ...s, keywordsText: e.target.value }))} className="input min-h-[80px] resize-y" aria-label="คีย์เวิร์ด" />
                  </label>
                  <label className="block">
                    <span className="flex justify-between text-[0.7rem] text-slate-400 mb-1"><span>หมวดหมู่</span><span className="tabular-nums">{cats.length}/{KDP_LIMITS.categories}</span></span>
                    <textarea value={meta.categoriesText} onChange={(e) => setMeta((s) => ({ ...s, categoriesText: e.target.value }))} className="input min-h-[80px] resize-y" aria-label="หมวดหมู่" />
                  </label>
                </div>
              </section>
            </div>

            {/* right: results */}
            <div className="space-y-4">
              <section className="rounded-xl border border-white/10 bg-[#151a27] p-4">
                <h2 className="text-xs uppercase tracking-wider text-faint font-semibold mb-3">สเปกการพิมพ์</h2>
                {hasWords ? (
                  <div className="grid grid-cols-2 gap-3 text-sm" data-testid="print-specs">
                    <Spec label="หน้าโดยประมาณ" value={`${r.pages}`} hint={`${wordsNum.toLocaleString("en-US")} คำ ÷ ${TRIM[trim].wordsPerPage} คำ/หน้า`} />
                    <Spec label="ความกว้างสัน" value={`${r.spine.inches}"`} hint={`${r.spine.mm} มม. · หน้า ÷ PPI`} />
                    <Spec label="ปกเต็ม (รวมสัน+bleed)" value={`${r.cover.widthIn}" × ${r.cover.heightIn}"`} hint="bleed 0.125 นิ้วทุกด้าน" />
                    <Spec label="พิกเซลที่ 300 dpi" value={`${r.cover.widthPx} × ${r.cover.heightPx}`} hint="สำหรับโปรแกรมทำปก" />
                  </div>
                ) : (
                  <p className="text-sm text-faint">ใส่จำนวนคำก่อน — สเปกทุกตัวคำนวณจากจำนวนหน้า</p>
                )}
                {hasWords && r.spine.inches < 0.06 && (
                  <p className="mt-3 text-xs text-amber-300/90 flex items-start gap-1.5"><AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />สันบางกว่า 0.06 นิ้ว — KDP ไม่ให้ใส่ตัวอักษรบนสัน</p>
                )}
              </section>

              <section className="rounded-xl border border-white/10 bg-[#151a27] p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-xs uppercase tracking-wider text-faint font-semibold">เช็กลิสต์</h2>
                  <span className={`text-xs tabular-nums ${failing === 0 ? "text-[#22c55e]" : "text-amber-300"}`} data-testid="checklist-summary">
                    {failing === 0 ? `ผ่านทั้ง ${checks.length} ข้อ` : `ยังไม่ผ่าน ${failing} จาก ${checks.length} ข้อ`}
                  </span>
                </div>
                <ul className="space-y-2 text-sm" aria-label="เช็กลิสต์ KDP">
                  {checks.map((c) => (
                    <li key={c.rule} className="flex items-start gap-2">
                      <span className={`mt-0.5 w-4 h-4 rounded flex-shrink-0 flex items-center justify-center text-[0.6rem] ${c.ok ? "bg-[#22c55e]/15 text-[#22c55e]" : "bg-[#ef4444]/15 text-[#ef4444]"}`} aria-hidden="true">{c.ok ? "✓" : "✕"}</span>
                      <span className="min-w-0">
                        <span className="text-slate-200">{c.rule}</span>
                        <span className="block text-[0.7rem] text-faint">{c.note}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-[0.7rem] text-faint">
                  {!hasWords && <span className="text-amber-300/90">กฎด้านการพิมพ์ ({r.checks.length - checks.length} ข้อ) จะปรากฏเมื่อใส่จำนวนคำ · </span>}
                  ขั้นต่ำหน้าสำหรับ{binding === "hardcover" ? "ปกแข็ง" : "ปกอ่อน"}คือ {minPages} หน้า · &quot;พร้อม&quot; หมายถึงทุกข้อเป็นจริง — ไม่มีการถ่วงน้ำหนัก
                </p>
              </section>

              <section className="rounded-xl border border-white/10 bg-[#151a27] p-4">
                <h2 className="text-xs uppercase tracking-wider text-faint font-semibold mb-2">การเปิดเผยเนื้อหา AI (นโยบาย Amazon)</h2>
                <div className="grid sm:grid-cols-2 gap-3 text-[0.75rem]">
                  <div>
                    <div className="text-slate-300 mb-1">ต้องเปิดเผย (อยู่ในเล่ม)</div>
                    <ul className="list-disc pl-4 text-slate-400 space-y-0.5">{KDP_AI_DISCLOSURE.mustDisclose.map((x) => <li key={x}>{x}</li>)}</ul>
                  </div>
                  <div>
                    <div className="text-slate-300 mb-1">ไม่ต้องเปิดเผย (งานช่วยเบื้องหลัง)</div>
                    <ul className="list-disc pl-4 text-slate-400 space-y-0.5">{KDP_AI_DISCLOSURE.noDisclosure.map((x) => <li key={x}>{x}</li>)}</ul>
                  </div>
                </div>
                <p className="mt-3 text-[0.7rem] text-faint leading-relaxed">{KDP_AI_DISCLOSURE.bookisdomNote}</p>
                <p className="mt-1 text-[0.65rem] text-faint">อ้างอิง: {KDP_AI_DISCLOSURE.source} (ณ {KDP_AI_DISCLOSURE.asOf})</p>
              </section>

              <button
                onClick={copyPackage}
                disabled={!hasWords}
                className="w-full py-2.5 bg-[#ab5bf7] text-black font-semibold rounded-xl hover:bg-[#c084fc] transition-colors flex items-center justify-center gap-2 text-sm disabled:opacity-50"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? "คัดลอกแล้ว" : "คัดลอก KDP package (Markdown)"}
              </button>

              <p className="text-[0.7rem] text-faint leading-relaxed">
                <span className="text-slate-300">สิ่งที่หน้านี้ทำไม่ได้:</span> ไฟล์เนื้อในพร้อมพิมพ์ (PDF ฝังฟอนต์ / CMYK) ต้องทำในโปรแกรมจัดหน้า — เบราว์เซอร์ทำ CMYK ที่แม่นยำไม่ได้ Atticus และ BookyAI ทำส่วนนั้น เราไม่ทำ
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Spec({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="p-3 rounded-lg bg-white/5">
      <div className="text-[0.65rem] text-faint">{label}</div>
      <div className="text-lg font-semibold text-[#c084fc] tabular-nums">{value}</div>
      <div className="text-[0.65rem] text-faint mt-0.5">{hint}</div>
    </div>
  );
}
