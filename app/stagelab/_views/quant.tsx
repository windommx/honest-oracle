"use client";

import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  NumberField,
  ProgressBar,
  SelectField,
  Skeleton,
  Slider,
  Spinner,
  StageBadge,
  StatCard,
  TableWrap,
  Tabs,
  Td,
  TextInput,
  Th,
  ViewHeader,
} from "../_ui";
import { CHART_COLORS, LineChart } from "../_chart";
import { api, post, reportError, useResource, type StageSession } from "../_api";
import { fmt, fmtBaht, fmtPct, pnlPct } from "@/lib/stagelab/utils";
import type {
  ChainResponse,
  MonteCarloResult,
  Position,
  TrapRow,
  TrapsResponse,
  UnifiedScoreResult,
} from "@/lib/stagelab/types";

type Tab = "montecarlo" | "traps" | "unified" | "chain";

const TABS = [
  { key: "montecarlo" as const, label: "มอนติคาร์โล" },
  { key: "traps" as const, label: "กับดักปันผล" },
  { key: "unified" as const, label: "คะแนน 360°" },
  { key: "chain" as const, label: "สมุดหลักฐาน" },
];

export default function QuantLabView({
  session,
  onSessionChange,
}: {
  session: StageSession;
  onSessionChange: () => void;
}) {
  const [tab, setTab] = useState<Tab>("montecarlo");
  return (
    <div className="space-y-5">
      <ViewHeader
        title="Quant Lab"
        subtitle={`โควตาประมวลผลวันนี้ เหลือ ${session.usage.computeRemaining} ครั้ง`}
      />
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      {tab === "montecarlo" && <MonteCarloTab onSpend={onSessionChange} />}
      {tab === "traps" && <TrapsTab onSpend={onSessionChange} />}
      {tab === "unified" && <UnifiedTab onSpend={onSessionChange} />}
      {tab === "chain" && <ChainTab onSpend={onSessionChange} />}
    </div>
  );
}

// ─── Monte Carlo ─────────────────────────────────────────────────────────────

function MonteCarloTab({ onSpend }: { onSpend: () => void }) {
  const positions = useResource<{ positions: Position[] }>("/positions");
  const [capital, setCapital] = useState(1_000_000);
  const [sims, setSims] = useState(2000);
  const [method, setMethod] = useState<"block" | "iid">("block");
  const [manual, setManual] = useState("");
  const [result, setResult] = useState<MonteCarloResult | null>(null);
  const [running, setRunning] = useState(false);

  // The returns come from the customer's OWN closed trades by default. That is
  // the whole point: a simulation seeded with invented numbers tells you about
  // the numbers, not about your trading.
  const closedReturns = useMemo(
    () =>
      (positions.data?.positions ?? [])
        .filter((p) => p.status === "CLOSED")
        .map((p) => Number(pnlPct(p).toFixed(2))),
    [positions.data],
  );

  const manualReturns = useMemo(
    () =>
      manual
        .split(/[,\s]+/)
        .map((x) => Number(x))
        .filter((n) => Number.isFinite(n)),
    [manual],
  );

  const returns = manualReturns.length >= 5 ? manualReturns : closedReturns;
  const enough = returns.length >= 5;

  // Annualising needs a holding period. Taking it from the customer's own
  // closed trades beats the engine's old hardcoded "about two weeks", which
  // silently set every CAGR it ever reported.
  const avgHoldWeeks = useMemo(() => {
    const closed = (positions.data?.positions ?? []).filter(
      (p) => p.status === "CLOSED" && p.closedAt,
    );
    if (closed.length === 0) return 2;
    const weeks = closed.map((p) => {
      const opened = new Date(p.openedAt).getTime();
      const shut = new Date(p.closedAt as string).getTime();
      return Math.max(0.5, (shut - opened) / (7 * 24 * 3600 * 1000));
    });
    return Math.round((weeks.reduce((a, b) => a + b, 0) / weeks.length) * 10) / 10;
  }, [positions.data]);

  async function run() {
    setRunning(true);
    try {
      setResult(
        await post<MonteCarloResult>("/quant/monte-carlo", {
          returns,
          sims,
          capital,
          method,
          avgHoldWeeks,
        }),
      );
    } catch (err) {
      reportError(err, "จำลองไม่สำเร็จ");
    } finally {
      setRunning(false);
      onSpend();
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card title="ข้อมูลนำเข้า" subtitle="ผลของไม้ที่ปิดแล้วในพอร์ตคุณ">
        <div className="rounded-lg border border-zinc-800 px-3 py-2">
          <div className="text-[0.65rem] uppercase text-zinc-400">ไม้ที่ปิดแล้ว</div>
          <div className="font-mono text-lg tabular-nums text-zinc-100">{closedReturns.length} ไม้</div>
          {closedReturns.length > 0 && (
            <p className="mt-1 font-mono text-[0.65rem] leading-relaxed text-zinc-400">
              {closedReturns.slice(0, 20).map((r) => `${r > 0 ? "+" : ""}${r}%`).join(" · ")}
              {closedReturns.length > 20 ? " …" : ""}
            </p>
          )}
        </div>

        <div className="mt-3">
          <label className="mb-1 block text-[0.7rem] uppercase tracking-wide text-zinc-400">
            หรือใส่ผลตอบแทนเอง (คั่นด้วยจุลภาค)
          </label>
          <textarea
            rows={3}
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="25, -7, 12, -7, 40, -7, 18"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-100 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none"
          />
          <p className="mt-1 text-[0.65rem] text-zinc-400">
            {manualReturns.length >= 5
              ? `ใช้ตัวเลขที่กรอก ${manualReturns.length} ค่า`
              : "ต้องมีอย่างน้อย 5 ค่าจึงจะใช้แทนพอร์ตจริง"}
          </p>
        </div>

        <div className="mt-3 space-y-3">
          <NumberField label="เงินทุนตั้งต้น" value={capital} onChange={setCapital} step={100_000} min={10_000} />
          <Slider label="จำนวนรอบจำลอง" value={sims} onChange={setSims} min={100} max={10_000} step={100} format={(n) => n.toLocaleString()} />
          <SelectField
            label="วิธีสุ่มลำดับ"
            value={method}
            onChange={setMethod}
            options={[
              { value: "block", label: "แบบบล็อก — รักษาการเรียงตัวของผลลัพธ์" },
              { value: "iid", label: "แบบอิสระ — สลับทุกไม้แยกกัน" },
            ]}
          />
          <p className="text-[0.7rem] leading-relaxed text-zinc-400">
            {method === "block"
              ? "สุ่มเป็นช่วงต่อเนื่อง ทำให้ “ชนะติดกัน” และ “แพ้ติดกัน” ยังอยู่ — Drawdown ที่ได้จะลึกกว่าและตรงกับความเป็นจริงมากกว่า"
              : "สุ่มทีละไม้แบบไม่สนลำดับ ซึ่งแปลว่าสมมติว่าผลไม้ก่อนหน้าไม่บอกอะไรเลยเกี่ยวกับไม้ถัดไป — สำหรับระบบตามเทรนด์ ข้อสมมตินี้ไม่จริง และมันเข้าข้างคุณ"}
          </p>
          <p className="text-[0.7rem] text-zinc-400">
            ระยะถือเฉลี่ยที่ใช้คำนวณต่อปี: <span className="font-mono text-zinc-300">{avgHoldWeeks} สัปดาห์</span>
            {closedReturns.length > 0 ? " (จากไม้ที่คุณปิดจริง)" : " (ค่าตั้งต้น — ยังไม่มีไม้ที่ปิดแล้ว)"}
          </p>
        </div>

        <Button
          variant="primary"
          size="sm"
          className="mt-3 w-full"
          disabled={running || !enough}
          onClick={() => void run()}
        >
          {running ? "กำลังจำลอง…" : "จำลอง"}
        </Button>
        {!enough && (
          <p className="mt-2 text-[0.7rem] text-amber-300">
            ต้องมีอย่างน้อย 5 ไม้ที่ปิดแล้ว — ต่ำกว่านั้นผลจำลองจะกว้างจนไม่บอกอะไร
          </p>
        )}
      </Card>

      <div className="space-y-4 lg:col-span-2">
        {!result ? (
          <Card>
            {running ? (
              <div className="py-16 text-center"><Spinner label="กำลังสุ่มลำดับไม้…" /></div>
            ) : (
              <EmptyState
                title="ยังไม่ได้จำลอง"
                hint="มอนติคาร์โลสลับลำดับไม้ของคุณใหม่หลายพันรอบ เพื่อตอบว่า 'ผลที่ผ่านมาเป็นฝีมือหรือเป็นลำดับที่โชคดี'"
              />
            )}
          </Card>
        ) : (
          <>
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              <StatCard label="กลาง (median)" value={fmtBaht(result.stats.median)} tone="good" />
              <StatCard label="แย่ 5%" value={fmtBaht(result.stats.p5)} tone="bad" />
              <StatCard label="ดี 5%" value={fmtBaht(result.stats.p95)} tone="good" />
              <StatCard label="โอกาสกำไร" value={`${fmt(result.stats.probProfit, 1)}%`} tone={result.stats.probProfit >= 60 ? "good" : "warn"} />
            </div>

            <Card
              title="ช่วงผลลัพธ์ที่เป็นไปได้"
              subtitle={`แถบคือ P5–P95 · เส้นขาวคือค่ากลาง · ${result.stats.sims.toLocaleString()} รอบ`}
            >
              <LineChart
                height={230}
                caption={`ช่วงผลลัพธ์จาก ${result.stats.sims} รอบจำลอง ตลอด ${result.stats.trades} ไม้`}
                xLabels={result.bands.map((b) => `ไม้ที่ ${b.t}`)}
                band={{
                  lo: result.bands.map((b) => b.lo),
                  hi: result.bands.map((b) => b.hi),
                  color: CHART_COLORS.band,
                }}
                series={[
                  { label: "ค่ากลาง", values: result.bands.map((b) => b.med), color: CHART_COLORS.median },
                  { label: "แย่ 5%", values: result.bands.map((b) => b.lo), color: CHART_COLORS.loss, dashed: true },
                ]}
              />
            </Card>

            <Card
              title="ความเสี่ยงที่ตัวเลขนี้บอก"
              subtitle={
                result.stats.method === "block"
                  ? `สุ่มแบบบล็อก ความยาวเฉลี่ย ${result.stats.blockSize} ไม้ · คิดเป็นปีที่ ${result.stats.avgHoldWeeks} สัปดาห์/ไม้`
                  : `สุ่มแบบอิสระ · คิดเป็นปีที่ ${result.stats.avgHoldWeeks} สัปดาห์/ไม้`
              }
            >
              <TableWrap minWidth={420}>
                <tbody>
                  <Row label="Drawdown กลาง" value={fmtPct(-Math.abs(result.stats.medianDd))} tone="warn" />
                  <Row label="Drawdown ที่แย่ 5%" value={fmtPct(-Math.abs(result.stats.p95Dd))} tone="bad" />
                  <Row label="Drawdown ที่แย่ที่สุดที่เจอ" value={fmtPct(-Math.abs(result.stats.worstDd))} tone="bad" />
                  <Row label="โอกาสเงินเป็นสองเท่า" value={`${fmt(result.stats.probDouble, 1)}%`} tone="good" />
                  <Row label="Sharpe (กลาง)" value={fmt(result.stats.medianSharpe, 2)} />
                  <Row label="ตัวคูณเงินทุน (กลาง)" value={`${fmt(result.stats.medianMultiple, 2)}×`} />
                </tbody>
              </TableWrap>
              <p className="mt-3 text-xs leading-relaxed text-zinc-400">
                ตัวเลข Drawdown สำคัญกว่าผลตอบแทน — มันคือสิ่งที่คุณต้องนั่งทนดูจริง ๆ ถ้าแถวที่สองทำให้คุณ
                นอนไม่หลับ ขนาดไม้ที่ใช้อยู่ใหญ่เกินไป ไม่ว่าค่ากลางจะสวยแค่ไหน
              </p>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "good" | "warn" | "bad" }) {
  const color = tone === "good" ? "text-emerald-400" : tone === "warn" ? "text-amber-400" : tone === "bad" ? "text-red-400" : "text-zinc-100";
  return (
    <tr>
      <Td className="text-xs text-zinc-300">{label}</Td>
      <Td align="right" mono className={color}>{value}</Td>
    </tr>
  );
}

// ─── Trap scanner ────────────────────────────────────────────────────────────

const RISK_TONE = { CRITICAL: "bad", HIGH: "bad", MEDIUM: "warn", LOW: "good" } as const;

function TrapsTab({ onSpend }: { onSpend: () => void }) {
  const [data, setData] = useState<TrapsResponse | null>(null);
  const [running, setRunning] = useState(false);
  const [onlyRisky, setOnlyRisky] = useState(false);

  async function scan() {
    setRunning(true);
    try {
      setData(await api<TrapsResponse>("/quant/traps"));
    } catch (err) {
      reportError(err, "สแกนไม่สำเร็จ");
    } finally {
      setRunning(false);
      onSpend();
    }
  }

  const rows: TrapRow[] = useMemo(() => {
    const all = data?.rows ?? [];
    return onlyRisky ? all.filter((r) => r.risk === "HIGH" || r.risk === "CRITICAL") : all;
  }, [data, onlyRisky]);

  return (
    <div className="space-y-4">
      <Card
        title="สแกนกับดักปันผล"
        subtitle="ปันผลสูงที่จ่ายจากหนี้ ไม่ใช่จากกระแสเงินสด คือกับดักที่ดูเหมือนโอกาส"
        action={
          <Button size="sm" variant="primary" disabled={running} onClick={() => void scan()}>
            {running ? "กำลังสแกน…" : "สแกน"}
          </Button>
        }
      >
        {!data ? (
          <EmptyState
            title="ยังไม่ได้สแกน"
            hint="เกณฑ์ NOCASH ดูว่าเงินปันผลมาจากไหน เกณฑ์ TRAP ดูว่าราคาที่ร่วงทำให้ yield สูงขึ้นเองหรือเปล่า"
          />
        ) : (
          <>
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              <StatCard label="สแกนทั้งหมด" value={String(data.summary.scanned)} sub={`มีปันผล ${data.summary.withYield}`} />
              <StatCard label="NOCASH" value={String(data.summary.nocash)} tone={data.summary.nocash > 0 ? "bad" : "good"} sub="จ่ายเกินกระแสเงินสด" />
              <StatCard label="TRAP" value={String(data.summary.trap)} tone={data.summary.trap > 0 ? "warn" : "good"} sub="yield สูงเพราะราคาร่วง" />
              <StatCard label="ความเสี่ยงสูง" value={String(data.summary.critical + data.summary.high)} tone={data.summary.critical > 0 ? "bad" : "warn"} />
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Button size="sm" variant={onlyRisky ? "primary" : "ghost"} onClick={() => setOnlyRisky((v) => !v)}>
                {onlyRisky ? "แสดงทั้งหมด" : "เฉพาะความเสี่ยงสูง"}
              </Button>
              <span className="text-xs text-zinc-400">{rows.length} รายการ</span>
            </div>
          </>
        )}
      </Card>

      {data && rows.length > 0 && (
        <Card title="ผลการสแกน">
          <TableWrap minWidth={900}>
            <thead>
              <tr>
                <Th>หุ้น</Th>
                <Th align="center">Stage</Th>
                <Th align="right">Yield</Th>
                <Th align="right">Payout</Th>
                <Th align="right">FCF Yield</Th>
                <Th align="right">D/E</Th>
                <Th align="right">ร่วงจากยอด</Th>
                <Th align="center">ความเสี่ยง</Th>
                <Th>อ่านว่า</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.symbol} className="hover:bg-zinc-800/30">
                  <Td>
                    <span className="font-mono font-medium text-zinc-100">{r.symbol}</span>
                    <span className="ml-2 text-xs text-zinc-400">{r.sector}</span>
                    {r.nocash && <Badge tone="bad" className="ml-1.5">NOCASH</Badge>}
                    {r.trap && <Badge tone="warn" className="ml-1.5">TRAP</Badge>}
                  </Td>
                  <Td align="center"><StageBadge stage={r.stage} short /></Td>
                  <Td align="right" mono>{r.dividendYieldPct === null ? "—" : `${fmt(r.dividendYieldPct, 1)}%`}</Td>
                  <Td align="right" mono>{fmt(r.payoutRatioPct, 0)}%</Td>
                  <Td align="right" mono className={r.fcfYieldPct < 0 ? "text-red-400" : "text-zinc-200"}>{fmt(r.fcfYieldPct, 1)}%</Td>
                  <Td align="right" mono className={r.debtEquity > 1.5 ? "text-red-400" : "text-zinc-200"}>{fmt(r.debtEquity, 2)}</Td>
                  <Td align="right" mono className="text-red-400">{fmtPct(r.priceDeclinePct)}</Td>
                  <Td align="center"><Badge tone={RISK_TONE[r.risk]}>{r.risk}</Badge></Td>
                  <Td className="max-w-xs whitespace-normal text-xs text-zinc-300">{r.verdict}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Card>
      )}

      {data && data.calibration.length > 0 && (
        <Card
          title="ความแม่นของกฎ (Calibration)"
          subtitle="กฎนี้เคยเตือนถูกแค่ไหน วัดบนซีรีส์สังเคราะห์ชุดเดียวกับที่ระบบใช้ทั้งหมด"
        >
          <TableWrap minWidth={520}>
            <thead>
              <tr>
                <Th>ช่วง Yield</Th>
                <Th align="right">ตัวอย่าง</Th>
                <Th align="right">ถูกตัดใน 12 เดือน</Th>
                <Th align="right">ถูกตัดใน 24 เดือน</Th>
                <Th align="right">ผลตอบแทนเฉลี่ย 12 เดือน</Th>
              </tr>
            </thead>
            <tbody>
              {data.calibration.map((c) => (
                <tr key={c.band}>
                  <Td className="text-xs text-zinc-200">{c.band}</Td>
                  <Td align="right" mono className="text-zinc-400">{c.n}</Td>
                  <Td align="right" mono className={c.cutPct12 > 40 ? "text-red-400" : "text-zinc-200"}>{fmt(c.cutPct12, 1)}%</Td>
                  <Td align="right" mono className={c.cutPct24 > 50 ? "text-red-400" : "text-zinc-200"}>{fmt(c.cutPct24, 1)}%</Td>
                  <Td align="right" mono className={c.avgReturn12 >= 0 ? "text-emerald-400" : "text-red-400"}>{fmtPct(c.avgReturn12)}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Card>
      )}
    </div>
  );
}

// ─── Unified score ───────────────────────────────────────────────────────────

const TIER_TONE: Record<string, "good" | "warn" | "late" | "bad"> = {
  "S+": "good", A: "good", B: "warn", C: "late", D: "bad", F: "bad",
};

function UnifiedTab({ onSpend }: { onSpend: () => void }) {
  const [input, setInput] = useState("");
  const [result, setResult] = useState<UnifiedScoreResult | null>(null);
  const [running, setRunning] = useState(false);

  async function score(symbol: string) {
    setRunning(true);
    try {
      setResult(await api<UnifiedScoreResult>(`/quant/unified?symbol=${encodeURIComponent(symbol)}`));
    } catch (err) {
      reportError(err, "คำนวณคะแนนไม่สำเร็จ");
      setResult(null);
    } finally {
      setRunning(false);
      onSpend();
    }
  }

  return (
    <div className="space-y-4">
      <Card title="คะแนนรวม 360°" subtitle="เทคนิค 30 · พื้นฐาน 25 · มหภาค 20 · ความเสี่ยง 15 · การปฏิบัติ 10">
        <div className="flex gap-2">
          <TextInput
            value={input}
            onChange={(e) => setInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === "Enter" && input.trim()) void score(input.trim().toUpperCase());
            }}
            placeholder="เช่น KBANK"
            className="font-mono"
          />
          <Button size="sm" variant="primary" disabled={running || input.trim() === ""} onClick={() => void score(input.trim().toUpperCase())}>
            {running ? "กำลังคำนวณ…" : "คำนวณ"}
          </Button>
        </div>
      </Card>

      {!result ? (
        <EmptyState
          title="ยังไม่มีผลลัพธ์"
          hint="คะแนนอ่านจากกระดานกลุ่มและ Thesis ของคุณด้วย — ยิ่งกรอกข้อมูลไว้มาก คะแนนยิ่งเป็นของคุณจริง ๆ"
        />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card title={`${result.symbol} — ${result.name}`} className="lg:col-span-2">
              <div className="space-y-3">
                {result.sections.map((sec) => (
                  <div key={sec.id}>
                    <div className="mb-1 flex items-baseline justify-between">
                      <span className="text-xs font-medium text-zinc-100">
                        {sec.id}. {sec.label}
                      </span>
                      <span className="font-mono text-xs tabular-nums text-zinc-300">
                        {sec.score}/{sec.max}
                      </span>
                    </div>
                    <ProgressBar
                      value={sec.score}
                      max={sec.max}
                      tone={sec.score / sec.max >= 0.7 ? "good" : sec.score / sec.max >= 0.4 ? "warn" : "bad"}
                    />
                    <ul className="mt-1 space-y-0.5">
                      {sec.parts.map((p) => (
                        <li key={p.label} className="flex items-baseline justify-between text-[0.7rem]">
                          <span className="text-zinc-400">{p.label} — {p.note}</span>
                          <span className="ml-2 shrink-0 font-mono tabular-nums text-zinc-300">{p.score}/{p.max}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </Card>

            <div className="space-y-4">
              <Card title="ผลรวม">
                <div className="text-center">
                  <div className="font-mono text-5xl font-semibold tabular-nums text-zinc-50">{result.total}</div>
                  <div className="text-xs text-zinc-400">จาก 100</div>
                  <div className="mt-2"><Badge tone={TIER_TONE[result.tier.grade] ?? "neutral"}>{result.tier.grade}</Badge></div>
                  <p className="mt-2 text-xs font-medium text-emerald-300">{result.tier.action}</p>
                  <p className="mt-1 text-[0.7rem] leading-relaxed text-zinc-400">{result.tier.th}</p>
                  <div className="mt-3 rounded-lg border border-zinc-800 px-3 py-2">
                    <div className="text-[0.65rem] uppercase text-zinc-400">ความเสี่ยงต่อไม้ที่แนะนำ</div>
                    <div className="font-mono text-lg text-zinc-100">{result.tier.riskPct}%</div>
                  </div>
                </div>
              </Card>

              <Card title="ด่านตรวจก่อนเข้า">
                <ol className="space-y-1.5">
                  {result.gate.steps.map((s) => (
                    <li key={s} className="text-[0.7rem] leading-relaxed text-zinc-300">• {s}</li>
                  ))}
                </ol>
                <div className="mt-3 text-center">
                  <Badge tone={result.gate.verdict === "BUY ZONE" ? "good" : result.gate.verdict === "NO BUY" ? "bad" : "warn"}>
                    {result.gate.verdict}
                  </Badge>
                  <p className="mt-1 font-mono text-[0.65rem] text-zinc-400">
                    ตลาด {result.gate.regime} · กลุ่ม S{result.gate.sectorStage} · หุ้น S{result.gate.stockStage} · R:R {fmt(result.gate.rr, 2)}
                  </p>
                </div>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Audit chain ─────────────────────────────────────────────────────────────

function ChainTab({ onSpend }: { onSpend: () => void }) {
  const { data, loading, reload } = useResource<ChainResponse>("/quant/chain");
  const [appending, setAppending] = useState(false);

  async function append() {
    setAppending(true);
    try {
      await post("/quant/chain", {});
      await reload();
    } catch (err) {
      reportError(err, "บันทึกคืนใหม่ไม่สำเร็จ");
    } finally {
      setAppending(false);
      onSpend();
    }
  }

  if (loading && !data) return <Skeleton className="h-96" />;

  return (
    <div className="space-y-4">
      <Card
        title="สมุดหลักฐาน"
        subtitle="แต่ละคืนผูกกับคืนก่อนหน้าด้วย SHA-256 — แก้ตัวเลขย้อนหลังแล้วการตรวจสอบจะพัง ไม่ใช่ผ่านเงียบ ๆ"
        action={
          <Button size="sm" variant="primary" disabled={appending} onClick={() => void append()}>
            {appending ? "กำลังบันทึก…" : "บันทึกคืนนี้"}
          </Button>
        }
      >
        {data && (
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <StatCard label="จำนวนคืน" value={String(data.length)} />
            <StatCard
              label="สถานะการตรวจสอบ"
              value={data.length === 0 ? "ยังว่าง" : data.valid ? "ถูกต้อง" : "พัง"}
              tone={data.length === 0 ? "neutral" : data.valid ? "good" : "bad"}
              sub={data.error ?? undefined}
            />
            <div className="col-span-2 rounded-xl border border-zinc-800 bg-zinc-900/60 px-3.5 py-3">
              <div className="text-[0.7rem] uppercase tracking-wide text-zinc-400">แฮชล่าสุด</div>
              <div className="mt-1 break-all font-mono text-[0.65rem] leading-relaxed text-emerald-400">
                {data.lastHash}
              </div>
            </div>
          </div>
        )}
      </Card>

      {!data || data.entries.length === 0 ? (
        <EmptyState
          title="ยังไม่มีบันทึก"
          hint="กด 'บันทึกคืนนี้' เพื่อผนึกสถานะปัจจุบันของจักรวาลหุ้นและคะแนนตลาดของคุณลงในสมุด"
        />
      ) : (
        <Card title="บันทึกรายคืน">
          <TableWrap minWidth={820}>
            <thead>
              <tr>
                <Th>คืนที่</Th>
                <Th>เวลา</Th>
                <Th align="right">หุ้นที่วิเคราะห์</Th>
                <Th align="right">สัญญาณ</Th>
                <Th align="right">NOCASH</Th>
                <Th align="right">TRAP</Th>
                <Th align="right">Market</Th>
                <Th>แฮช</Th>
              </tr>
            </thead>
            <tbody>
              {[...data.entries].reverse().map((e) => (
                <tr key={e.night}>
                  <Td mono>#{e.night}</Td>
                  <Td className="text-xs text-zinc-400">{new Date(e.timestamp).toLocaleString("th-TH")}</Td>
                  <Td align="right" mono>{e.summary.stocksAnalyzed}</Td>
                  <Td align="right" mono className="text-emerald-400">{e.summary.signals}</Td>
                  <Td align="right" mono className={e.summary.nocash > 0 ? "text-red-400" : "text-zinc-400"}>{e.summary.nocash}</Td>
                  <Td align="right" mono className={e.summary.trap > 0 ? "text-amber-400" : "text-zinc-400"}>{e.summary.trap}</Td>
                  <Td align="right" mono>{e.summary.marketScore ?? "—"}</Td>
                  <Td><span className="font-mono text-[0.65rem] text-zinc-400">{e.hash.slice(0, 16)}…</span></Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Card>
      )}
    </div>
  );
}
