"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Copy, Download, FlaskConical, Play, TrendingUp, Upload } from "lucide-react";
import { csvTemplate, formatBenchmarkMarkdown, formatScreenMarkdown, parseAny, runScreen, runValidation, type ScreenRun, type ValidationRun } from "@/lib/dividend/io";
import { syntheticUniverse } from "@/lib/dividend/fixtures";
import { DEFAULT_PORTFOLIO } from "@/lib/dividend/portfolio";
import { DEFAULT_STABILITY, type StabilityResult } from "@/lib/dividend/stability-gate";
import type { AnnualRecord, Reason } from "@/lib/dividend/types";
import type { EpistemicTier } from "@/lib/rush-engine/epistemics";
import { TIER_DERIVED, TIER_DIRECT, TIER_HEURISTIC, TIER_REFUSED } from "@/app/rush/_tokens";

// ╔══════════════════════════════════════════════════════════════════╗
// ║  /dividend — the platform surface for lib/dividend.               ║
// ║  Everything runs in the browser on the filings you paste or       ║
// ║  upload; nothing is sent anywhere. The page shows counts and      ║
// ║  reasons — never a 0–100 safety score — and refuses (avisaya)     ║
// ║  when a verdict does not hold under filing-sized noise.           ║
// ╚══════════════════════════════════════════════════════════════════╝

const TIER_COLOR: Record<EpistemicTier, string> = {
  paccakkha: TIER_DIRECT,
  anumana: TIER_DERIVED,
  sanna: TIER_HEURISTIC,
  avisaya: TIER_REFUSED,
};
const FINAL_COLOR: Record<StabilityResult["final"], string> = {
  sustain: TIER_DIRECT,
  watch: TIER_HEURISTIC,
  "at-risk": TIER_REFUSED,
  avisaya: "#828a99",
};
const FINAL_TH: Record<StabilityResult["final"], string> = {
  sustain: "sustain — ไม่พบเหตุให้เชื่อว่าจะตัด",
  watch: "watch — ผ่านประตูแข็ง แต่คุณภาพไม่ถึงเกณฑ์",
  "at-risk": "at-risk — ชนประตูแข็งอย่างน้อยหนึ่งข้อ",
  avisaya: "avisaya — verdict ไม่คงอยู่ใต้สัญญาณรบกวน (ปฏิเสธ)",
};

const fmt = (x: number | null | undefined, d = 2) => (x === null || x === undefined ? "n/a" : x === Infinity ? "∞" : x.toFixed(d));
const pct = (x: number | null | undefined, d = 1) => (x === null || x === undefined ? "n/a" : `${(x * 100).toFixed(d)}%`);

function download(name: string, text: string) {
  try {
    const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    /* ignore — sandboxed viewers block downloads */
  }
}

function Chip({ r }: { r: Reason }) {
  const c = TIER_COLOR[r.tier];
  return (
    <span
      title={`${r.detail}\n— ${r.source}`}
      className="inline-block text-[0.62rem] px-1.5 py-0.5 rounded border mr-1 mb-1 whitespace-nowrap"
      style={{ borderColor: `${c}66`, color: c }}
    >
      {r.rule}
    </span>
  );
}

function Tile({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="p-3 bg-white/5 rounded-lg text-center">
      <div className="text-xl font-bold" style={{ color: color ?? "#c9a84c" }}>{value}</div>
      <div className="text-[0.62rem] text-faint mt-0.5">{label}</div>
    </div>
  );
}

export default function DividendPage() {
  const [text, setText] = useState("");
  const [records, setRecords] = useState<AnnualRecord[]>([]);
  const [source, setSource] = useState<string>("");
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [run, setRun] = useState<ScreenRun | null>(null);
  const [validation, setValidation] = useState<ValidationRun | null>(null);
  const [busy, setBusy] = useState<"" | "screen" | "validate">("");
  const [maxPositions, setMaxPositions] = useState(DEFAULT_PORTFOLIO.maxPositions);
  const [maxPerSector, setMaxPerSector] = useState(DEFAULT_PORTFOLIO.maxPerSector);
  const [allowWatch, setAllowWatch] = useState(DEFAULT_PORTFOLIO.allowWatch);
  const [minYieldPct, setMinYieldPct] = useState("");
  const [tau, setTau] = useState(DEFAULT_STABILITY.tau);
  const [showExcluded, setShowExcluded] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const loadText = (t: string, label: string) => {
    const { records: rs, errors } = parseAny(t);
    setText(t);
    setRecords(rs);
    setParseErrors(errors);
    setSource(rs.length ? `${label}: ${rs.length} filings` : `${label}: ไม่มีแถวที่ใช้ได้`);
    setRun(null);
    setValidation(null);
  };

  const loadDemo = () => {
    const u = syntheticUniverse({ firms: 30, years: 10, seed: 42, noise: 0.15 });
    setText("");
    setRecords(u);
    setParseErrors([]);
    setSource(`ชุดสาธิตสังเคราะห์ (ไม่ใช่ข้อมูลตลาด): ${u.length} filings`);
    setRun(null);
    setValidation(null);
  };

  const onFile = (f: File | undefined) => {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => loadText(String(reader.result ?? ""), f.name);
    reader.readAsText(f);
  };

  const options = useMemo(
    () => ({
      stability: { ...DEFAULT_STABILITY, tau },
      portfolio: {
        maxPositions,
        maxPerSector,
        allowWatch,
        minYield: minYieldPct.trim() === "" || !Number.isFinite(Number(minYieldPct)) ? null : Number(minYieldPct) / 100,
      },
    }),
    [tau, maxPositions, maxPerSector, allowWatch, minYieldPct],
  );

  const doScreen = () => {
    if (records.length === 0) return;
    setBusy("screen");
    setRun(runScreen(records, options));
    setBusy("");
  };
  const doValidate = () => {
    if (records.length === 0) return;
    setBusy("validate");
    setValidation(runValidation(records, { draws: 100 }));
    setBusy("");
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <header className="border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-gray-400 hover:text-[#c9a84c]" aria-label="กลับหน้าแรก">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <TrendingUp className="w-6 h-6 text-[#c9a84c]" />
            <h1 className="text-lg font-semibold">Dividend Screen</h1>
            <span className="text-xs text-faint hidden sm:inline">ความยั่งยืนของปันผล — นับ ไม่ตัดสิน · รันในเบราว์เซอร์ทั้งหมด</span>
          </div>
          <div className="flex gap-2 text-xs">
            <Link href="/rush/honesty" className="px-3 py-1.5 rounded-lg border border-white/10 text-gray-300 hover:border-[#c9a84c]/40">ญาณวิทยา</Link>
            <a href="https://github.com/windommx/honest-oracle/blob/develop/docs/research/dividend-algorithm.md" className="px-3 py-1.5 rounded-lg border border-white/10 text-gray-300 hover:border-[#c9a84c]/40" target="_blank" rel="noreferrer">
              ที่มาของกฎ
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 grid lg:grid-cols-[320px_1fr] gap-6">
        {/* ── Input & policy ─────────────────────────────────────── */}
        <aside className="space-y-4">
          <section className="glass-card rounded-2xl p-4">
            <h2 className="text-sm font-semibold mb-2">1 · งบการเงินรายปี</h2>
            <p className="text-[0.7rem] text-gray-400 mb-3">
              หนึ่งแถวต่อ (ticker, ปีงบ) เป็น CSV หรือ JSON — ต้องมีอย่างน้อย 2 ปีต่อบริษัทจึงจะได้ F-score, streak และ Beneish
            </p>
            <div className="flex flex-wrap gap-2 mb-3">
              <label className="text-xs px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:border-[#c9a84c]/40 cursor-pointer inline-flex items-center gap-1.5">
                <Upload className="w-3.5 h-3.5" /> อัปโหลดไฟล์
                <input type="file" accept=".csv,.json,.txt" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
              </label>
              <button onClick={loadDemo} className="text-xs px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:border-[#c9a84c]/40">
                โหลดชุดสาธิต
              </button>
              <button
                onClick={() => { void navigator.clipboard?.writeText(csvTemplate()); }}
                className="text-xs px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:border-[#c9a84c]/40 inline-flex items-center gap-1.5"
              >
                <Copy className="w-3.5 h-3.5" /> คัดลอกหัว CSV
              </button>
            </div>
            <textarea
              aria-label="วางข้อมูล CSV หรือ JSON"
              value={text}
              onChange={(e) => loadText(e.target.value, "วางข้อความ")}
              placeholder={"ticker,fiscalYear,revenue,ebit,...\nAAA,2024,1000,150,..."}
              className="w-full h-32 text-[0.7rem] font-mono bg-black/40 border border-white/10 rounded-lg p-2 text-gray-200 placeholder:text-faint"
            />
            {source && <p className="text-[0.7rem] text-gray-300 mt-2">{source}</p>}
            {parseErrors.length > 0 && (
              <ul className="mt-2 text-[0.68rem] text-amber-300 space-y-0.5 max-h-24 overflow-auto">
                {parseErrors.slice(0, 20).map((e) => <li key={e}>· {e}</li>)}
                {parseErrors.length > 20 && <li>· …และอีก {parseErrors.length - 20} รายการ</li>}
              </ul>
            )}
          </section>

          <section className="glass-card rounded-2xl p-4">
            <h2 className="text-sm font-semibold mb-2">2 · นโยบาย (เปิดเผยทุกค่า)</h2>
            <div className="grid grid-cols-2 gap-2 text-[0.7rem]">
              <label className="block">
                <span className="text-gray-400">จำนวนสูงสุด</span>
                <input type="number" min={1} value={maxPositions} onChange={(e) => setMaxPositions(Math.max(1, Number(e.target.value) || 1))} className="w-full mt-1 bg-black/40 border border-white/10 rounded px-2 py-1" />
              </label>
              <label className="block">
                <span className="text-gray-400">cap ต่อ sector</span>
                <input type="number" min={1} value={maxPerSector} onChange={(e) => setMaxPerSector(Math.max(1, Number(e.target.value) || 1))} className="w-full mt-1 bg-black/40 border border-white/10 rounded px-2 py-1" />
              </label>
              <label className="block">
                <span className="text-gray-400">yield ขั้นต่ำ (%)</span>
                <input type="text" inputMode="decimal" value={minYieldPct} onChange={(e) => setMinYieldPct(e.target.value)} placeholder="ไม่กำหนด" className="w-full mt-1 bg-black/40 border border-white/10 rounded px-2 py-1 placeholder:text-faint" />
              </label>
              <label className="block">
                <span className="text-gray-400">τ (stability ≥)</span>
                <input type="number" step={0.125} min={0} max={1} value={tau} onChange={(e) => setTau(Math.min(1, Math.max(0, Number(e.target.value) || 0)))} className="w-full mt-1 bg-black/40 border border-white/10 rounded px-2 py-1" />
              </label>
              <label className="col-span-2 inline-flex items-center gap-2 mt-1 text-gray-300">
                <input type="checkbox" checked={allowWatch} onChange={(e) => setAllowWatch(e.target.checked)} /> รับ watch เข้าพอร์ตหลัง sustain หมด
              </label>
            </div>
            <p className="text-[0.65rem] text-faint mt-2">
              ประตูแข็ง: ขาดทุน · DPS/EPS &gt; 1 สองปี · FCF ไม่คลุมและ runway &lt; 1 · Altman Z&apos;&apos; &lt; 1.1 · หนี้/EBITDA &gt; 4 และ EBIT/ดอกเบี้ย &lt; 2 · watch: F &lt; 5 · streak &lt; 3 · yield &gt; 12% — แก้ได้ในโค้ด (DEFAULT_POLICY) ไม่ซ่อน
            </p>
          </section>

          <section className="glass-card rounded-2xl p-4 space-y-2">
            <h2 className="text-sm font-semibold mb-1">3 · รัน</h2>
            <button
              onClick={doScreen}
              disabled={records.length === 0 || busy !== ""}
              className="w-full text-sm px-3 py-2 rounded-lg bg-[#c9a84c] text-black font-medium disabled:opacity-40 inline-flex items-center justify-center gap-2"
            >
              <Play className="w-4 h-4" /> Screen + stability gate + portfolio
            </button>
            <button
              onClick={doValidate}
              disabled={records.length === 0 || busy !== ""}
              className="w-full text-sm px-3 py-2 rounded-lg border border-white/15 text-gray-200 hover:border-[#c9a84c]/40 disabled:opacity-40 inline-flex items-center justify-center gap-2"
            >
              <FlaskConical className="w-4 h-4" /> Validation harness (walk-forward)
            </button>
            <p className="text-[0.65rem] text-faint">
              harness ต้องการอย่างน้อย 5 ปีต่อบริษัท (embargo 1 ปี + train 3 ปี) และจะตอบว่า &quot;no signal&quot; ได้ — นั่นคือหน้าที่ของมัน
            </p>
          </section>
        </aside>

        {/* ── Results ────────────────────────────────────────────── */}
        <section className="space-y-6 min-w-0">
          {!run && !validation && (
            <div className="glass-card rounded-2xl p-8 text-center text-gray-400 text-sm">
              <p className="mb-2">ยังไม่มีผล — โหลดงบแล้วกด Screen</p>
              <p className="text-[0.7rem] text-faint max-w-xl mx-auto">
                ผลลัพธ์ทุกตัวเป็นจำนวนที่นับซ้ำได้ (ประจักษ์) หรืออัตราส่วนจากสูตรที่เปิดเผย (อนุมาน) ธงเป็นสัญญา และเมื่อคำตัดสินไม่คงอยู่ใต้การรบกวนขนาดหนึ่งไตรมาส หน้านี้จะ<b>ปฏิเสธ</b> ไม่ใช่ลดคะแนน
              </p>
            </div>
          )}

          {run && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                <Tile label="บริษัท" value={run.universe.tickers} />
                <Tile label="sustain" value={run.counts.sustain} color={TIER_DIRECT} />
                <Tile label="watch" value={run.counts.watch} color={TIER_HEURISTIC} />
                <Tile label="at-risk" value={run.counts["at-risk"]} color={TIER_REFUSED} />
                <Tile label="avisaya (ปฏิเสธ)" value={run.counts.avisaya} color="#828a99" />
              </div>

              <div className="glass-card rounded-2xl p-4">
                <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
                  <h2 className="text-sm font-semibold">
                    พอร์ต — {run.selection.holdings.length} ชื่อ · equal weight{run.selection.holdings.length ? ` ${pct(1 / run.selection.holdings.length, 1)} ต่อชื่อ` : ""}
                  </h2>
                  <div className="flex gap-2">
                    <button onClick={() => setShowExcluded((s) => !s)} className="text-xs px-3 py-1.5 rounded-lg border border-white/10 text-gray-300 hover:border-[#c9a84c]/40">
                      {showExcluded ? "ซ่อน" : "ดู"}ที่ถูกคัดออก ({run.selection.excluded.length})
                    </button>
                    <button
                      onClick={() => download("dividend-screen.md", formatScreenMarkdown(run))}
                      className="text-xs px-3 py-1.5 rounded-lg border border-white/10 text-gray-300 hover:border-[#c9a84c]/40 inline-flex items-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" /> รายงาน .md
                    </button>
                  </div>
                </div>
                <p className="text-[0.65rem] text-faint mb-3">เรียงตาม: {run.selection.rankingKey}</p>
                {run.selection.holdings.length === 0 ? (
                  <p className="text-sm text-gray-400">ไม่มีชื่อผ่านทุกประตู — นี่คือผลลัพธ์ ไม่ใช่ข้อผิดพลาด</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-[0.72rem]">
                      <thead className="text-faint text-left">
                        <tr><th className="py-1 pr-3">#</th><th className="pr-3">Ticker</th><th className="pr-3">Sector</th><th className="pr-3">น้ำหนัก</th><th className="pr-3">F</th><th className="pr-3">Div/FCF</th><th className="pr-3">Streak</th><th className="pr-3">Yield</th></tr>
                      </thead>
                      <tbody>
                        {run.selection.holdings.map((h) => (
                          <tr key={h.ticker} className="border-t border-white/5">
                            <td className="py-1 pr-3 text-faint">{h.rank}</td>
                            <td className="pr-3 font-medium text-[#c9a84c]">{h.ticker}</td>
                            <td className="pr-3 text-gray-300">{h.sector}</td>
                            <td className="pr-3">{pct(h.weight)}</td>
                            <td className="pr-3">{fmt(h.key.fScore, 1)}</td>
                            <td className="pr-3">{fmt(h.key.payoutFcf)}</td>
                            <td className="pr-3">{h.key.streak}y</td>
                            <td className="pr-3">{pct(h.key.dividendYield)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {showExcluded && (
                  <ul className="mt-3 text-[0.68rem] text-gray-400 space-y-0.5 max-h-48 overflow-auto">
                    {run.selection.excluded.map((e) => (
                      <li key={e.ticker}><span className="text-gray-200">{e.ticker}</span> — {e.reason}</li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="glass-card rounded-2xl p-4">
                <h2 className="text-sm font-semibold mb-1">ทุกบริษัท — verdict, การคงอยู่, และเหตุผล</h2>
                <p className="text-[0.65rem] text-faint mb-3">
                  &quot;คงอยู่&quot; = จำนวนครั้งที่ verdict เดิมกลับมาหลังรบกวนงบ k={run.options.stability.k} ครั้ง (earnings ±ความผันผวนของบริษัทเอง, CFO, หนี้ ±10%, ราคา ±20%, ทุกครั้งที่ 4 หายไปหนึ่งไตรมาส) · seed {run.options.stability.seed} · คลิกแถวเพื่อดูรายละเอียด
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-[0.72rem]">
                    <thead className="text-faint text-left">
                      <tr>
                        <th className="py-1 pr-3">Ticker</th><th className="pr-3">FY</th><th className="pr-3">Final</th><th className="pr-3">คงอยู่</th>
                        <th className="pr-3">DPS/EPS</th><th className="pr-3">Div/FCF</th><th className="pr-3">Runway</th><th className="pr-3">F</th><th className="pr-3">Z&apos;&apos;</th><th className="pr-3">Streak</th><th className="pr-3">Yield</th><th>กฎที่ทำงาน</th>
                      </tr>
                    </thead>
                    <tbody>
                      {run.results.map((r) => {
                        const a = r.base;
                        const open = expanded === a.ticker;
                        return (
                          <RowGroup key={a.ticker} r={r} open={open} onToggle={() => setExpanded(open ? null : a.ticker)} />
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {validation && (
            <div className="glass-card rounded-2xl p-4">
              <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                <h2 className="text-sm font-semibold">Validation harness — {validation.cases} cases · ตัดปันผล {validation.cuts} ({pct(validation.cases ? validation.cuts / validation.cases : null)})</h2>
                <button
                  onClick={() => download("dividend-validation.md", formatBenchmarkMarkdown(validation))}
                  className="text-xs px-3 py-1.5 rounded-lg border border-white/10 text-gray-300 hover:border-[#c9a84c]/40 inline-flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" /> รายงาน .md
                </button>
              </div>
              <p className="text-[0.65rem] text-faint mb-3">
                walk-forward รายปี, embargo 1 ปี · label = DPS ลดลงปีถัดไป (เฉพาะบริษัทที่จ่ายอยู่) · &quot;เพียงพอ&quot; ต้องชนะทุก baseline บน balanced accuracy และ permutation p &lt; 0.05
              </p>
              <div className="grid md:grid-cols-2 gap-3">
                {[validation.strict, validation.broad].map((b) => (
                  <div key={b.model.name} className="p-3 rounded-lg bg-white/5 text-[0.72rem]">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-gray-200">{b.model.name}</span>
                      <span className="font-semibold" style={{ color: b.adequateModelFound ? TIER_DIRECT : TIER_REFUSED }}>
                        {b.adequateModelFound ? "เพียงพอ" : "ไม่เพียงพอ — no signal claimed"}
                      </span>
                    </div>
                    <p className="text-gray-400 mb-2">{b.verdict}</p>
                    <p className="text-gray-300 mb-2">
                      n {b.model.metrics.n} · precision {fmt(b.model.metrics.precision)} · recall {fmt(b.model.metrics.recall)} · balanced acc {fmt(b.model.metrics.balancedAccuracy, 3)} · p = {b.permutation.pValue.toFixed(3)}
                    </p>
                    <table className="w-full">
                      <thead className="text-faint text-left"><tr><th>baseline</th><th>BA</th><th>skill</th></tr></thead>
                      <tbody>
                        {b.baselines.map((x) => (
                          <tr key={x.name} className="border-t border-white/5">
                            <td className="py-0.5 font-mono">{x.name}</td>
                            <td>{fmt(x.metrics.balancedAccuracy, 3)}</td>
                            <td style={{ color: x.skill !== null && x.skill > 0 ? TIER_DIRECT : TIER_REFUSED }}>{x.skill === null ? "n/a" : (x.skill >= 0 ? "+" : "") + x.skill.toFixed(3)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function RowGroup({ r, open, onToggle }: { r: StabilityResult; open: boolean; onToggle: () => void }) {
  const a = r.base;
  const c = FINAL_COLOR[r.final];
  return (
    <>
      <tr onClick={onToggle} className="border-t border-white/5 cursor-pointer hover:bg-white/[0.03]" aria-expanded={open}>
        <td className="py-1 pr-3 font-medium text-gray-100">{a.ticker}</td>
        <td className="pr-3 text-gray-400">{a.fiscalYear}</td>
        <td className="pr-3">
          <span className="px-1.5 py-0.5 rounded text-[0.65rem] border" style={{ color: c, borderColor: `${c}66` }} title={FINAL_TH[r.final]}>
            {r.final}
          </span>
          {r.final === "avisaya" && <span className="ml-1 text-faint text-[0.6rem]">(base {a.verdict})</span>}
        </td>
        <td className="pr-3" style={{ color: r.pass ? undefined : TIER_REFUSED }}>{r.agree}/{r.k}</td>
        <td className="pr-3">{fmt(a.cells.payoutEps)}</td>
        <td className="pr-3">{fmt(a.cells.payoutFcf)}</td>
        <td className="pr-3">{fmt(a.cells.cashRunway, 1)}×</td>
        <td className="pr-3">{a.fScore ? `${a.fScore.score}/${a.fScore.computable}` : "n/a"}</td>
        <td className="pr-3">{fmt(a.altman.z, 1)}</td>
        <td className="pr-3">{a.cells.streak}y</td>
        <td className="pr-3">{pct(a.cells.dividendYield)}</td>
        <td className="leading-4">
          {a.reasons.map((x) => <Chip key={x.rule} r={x} />)}
          {a.flags.map((x) => <Chip key={x.rule} r={x} />)}
          {a.reasons.length + a.flags.length === 0 && <span className="text-faint">—</span>}
        </td>
      </tr>
      {open && (
        <tr className="bg-white/[0.02]">
          <td colSpan={12} className="px-3 py-3 text-[0.7rem]">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <div className="text-gray-200 font-medium mb-1">{FINAL_TH[r.final]}</div>
                {[...a.reasons, ...a.flags].length === 0 && <p className="text-gray-400">ไม่มีกฎใดทำงาน — ทุกประตูผ่าน</p>}
                <ul className="space-y-1">
                  {[...a.reasons, ...a.flags].map((x) => (
                    <li key={x.rule}>
                      <Chip r={x} /> <span className="text-gray-300">{x.detail}</span>
                      <div className="text-faint ml-1">— {x.source}</div>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="text-gray-200 font-medium mb-1">การรบกวน {r.k} ครั้ง (schedule เปิดเผย)</div>
                <p className="text-faint mb-1">
                  earnings ±{pct(r.schedule.earningsShock, 0)} · CFO ±{pct(r.schedule.cfoShock, 0)} · หนี้ ±{pct(r.schedule.debtShock, 0)} · ราคา ±{pct(r.schedule.priceShock, 0)} · seed {r.schedule.seed}
                </p>
                <div className="flex flex-wrap gap-1">
                  {r.draws.map((d) => (
                    <span key={d.i} className="px-1.5 py-0.5 rounded border text-[0.62rem]" style={{ color: FINAL_COLOR[d.verdict], borderColor: `${FINAL_COLOR[d.verdict]}55` }} title={`earnings ×${d.earningsFactor.toFixed(2)} · cfo ×${d.cfoFactor.toFixed(2)} · debt ×${d.debtFactor.toFixed(2)} · price ×${d.priceFactor.toFixed(2)}`}>
                    #{d.i} {d.verdict}
                    </span>
                  ))}
                </div>
                <p className="text-faint mt-2">
                  net debt/EBITDA {fmt(a.cells.netDebtEbitda)} · EBIT/ดอกเบี้ย {fmt(a.cells.interestCoverage, 1)} · shareholder yield {pct(a.cells.shareholderYield)} · EPS vol {fmt(a.cells.epsVolatility)} · Beneish M {a.beneish ? fmt(a.beneish.m) : "n/a"}
                </p>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
