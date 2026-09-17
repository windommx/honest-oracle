"use client";

import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  NumberField,
  ProgressBar,
  Skeleton,
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
import { useResource } from "../_api";
import {
  OPTION_STRATEGIES,
  optionStats,
  resolveLegs,
  optionStrategiesFor,
  payoffSeries,
} from "@/lib/stagelab/pro";
import { fmt, fmtPct } from "@/lib/stagelab/utils";
import type { MtfResult, RotationResult, ShortCandidate } from "@/lib/stagelab/types";

type Tab = "shorts" | "rotation" | "mtf" | "options";

const TABS = [
  { key: "shorts" as const, label: "Short (Stage 4)" },
  { key: "rotation" as const, label: "Sector Rotation" },
  { key: "mtf" as const, label: "Multi-Timeframe" },
  { key: "options" as const, label: "Options ตาม Stage" },
];

export default function ProView() {
  const [tab, setTab] = useState<Tab>("shorts");
  return (
    <div className="space-y-5">
      <ViewHeader title="Pro Desk" subtitle="เครื่องมือสำหรับตลาดที่ไม่ได้อยู่ใน Stage 2" />
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      {tab === "shorts" && <ShortsTab />}
      {tab === "rotation" && <RotationTab />}
      {tab === "mtf" && <MtfTab />}
      {tab === "options" && <OptionsTab />}
    </div>
  );
}

function ShortsTab() {
  const { data, loading, error } = useResource<{ shorts: ShortCandidate[]; marketScore: number; hasReview: boolean }>(
    "/pro?view=shorts",
  );

  if (loading && !data) return <Skeleton className="h-96" />;
  if (error) return <EmptyState title="โหลดรายชื่อไม่สำเร็จ" hint={error} />;

  const rows = data?.shorts ?? [];
  const score = data?.marketScore ?? 5;

  return (
    <div className="space-y-4">
      <div
        className={`rounded-xl border px-4 py-3 text-xs leading-relaxed ${
          score <= 4 ? "border-red-500/30 bg-red-500/5 text-red-100" : "border-amber-500/30 bg-amber-500/5 text-amber-100"
        }`}
      >
        {score <= 4
          ? `Market Score ${score}/10 — ตลาดอ่อนพอที่ฝั่ง Short จะมีความได้เปรียบ แต่ขนาดไม้ยังต้องเล็กกว่าฝั่งซื้อ เพราะขาดทุนฝั่งนี้ไม่มีเพดาน`
          : `Market Score ${score}/10 — ตลาดยังไม่อ่อนพอ การ Short ในตลาดที่ยังขึ้นคือการสู้กับกระแสหลัก รายชื่อด้านล่างจึงเป็นข้อมูลเฝ้าดู ไม่ใช่สัญญาณเข้า`}
      </div>

      {rows.length === 0 ? (
        <EmptyState title="ไม่มีหุ้นเข้าเกณฑ์ Short" hint="ต้องยืนยัน Stage 4 พร้อม MA ชันลงและ RS ติดลบ" />
      ) : (
        <Card title="ผู้เข้าข่าย" subtitle={`${rows.length} ตัว เรียงตามความแข็งแรงของสัญญาณ`}>
          <TableWrap minWidth={860}>
            <thead>
              <tr>
                <Th>หุ้น</Th>
                <Th align="center">Stage</Th>
                <Th align="right">ราคา</Th>
                <Th align="right">ต่ำกว่า MA</Th>
                <Th align="right">RS</Th>
                <Th align="right">เข้า Short</Th>
                <Th align="right">Stop</Th>
                <Th align="right">เป้า</Th>
                <Th align="right">R:R</Th>
                <Th align="right">คะแนน</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.symbol} className="hover:bg-zinc-800/30">
                  <Td>
                    <span className="font-mono font-medium text-zinc-100">{s.symbol}</span>
                    <span className="ml-2 text-xs text-zinc-400">{s.sector}</span>
                  </Td>
                  <Td align="center"><StageBadge stage={s.stage} short /></Td>
                  <Td align="right" mono>{fmt(s.price)}</Td>
                  <Td align="right" mono className="text-red-400">{fmtPct(s.belowMaPct)}</Td>
                  <Td align="right" mono className="text-red-400">{fmt(s.mansfieldRs, 2)}</Td>
                  <Td align="right" mono>{fmt(s.shortEntry)}</Td>
                  <Td align="right" mono className="text-red-400">{fmt(s.stop)}</Td>
                  <Td align="right" mono className="text-emerald-400">{fmt(s.cover)}</Td>
                  <Td align="right"><Badge tone={s.rr >= 2 ? "good" : s.rr >= 1.5 ? "warn" : "bad"}>{fmt(s.rr, 1)}</Badge></Td>
                  <Td align="right">
                    <span className="inline-flex w-16 items-center gap-1.5">
                      <ProgressBar value={s.score} max={100} tone={s.score >= 70 ? "bad" : "warn"} />
                      <span className="font-mono text-xs tabular-nums text-zinc-300">{s.score}</span>
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Card>
      )}
    </div>
  );
}

function RotationTab() {
  const { data, loading, error } = useResource<{ rotation: RotationResult; hasReview: boolean }>("/pro?view=rotation");

  if (loading && !data) return <Skeleton className="h-96" />;
  if (error || !data) return <EmptyState title="อ่านรอบหมุนเวียนไม่สำเร็จ" hint={error ?? undefined} />;

  const r = data.rotation;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatCard label="ช่วงของวัฏจักร" value={r.label} sub={`ความมั่นใจ ${r.confidence}%`} tone="good" />
        <StatCard label="Stage 2" value={String(r.counts.s2)} sub={`จาก ${r.counts.total} กลุ่ม`} tone="good" />
        <StatCard label="Stage 3" value={String(r.counts.s3)} tone={r.counts.s3 > r.counts.s2 ? "late" : "neutral"} />
        <StatCard label="Stage 4" value={String(r.counts.s4)} tone={r.counts.s4 > 0 ? "bad" : "neutral"} />
      </div>

      {!data.hasReview && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-100">
          ยังไม่ได้ให้คะแนนตลาดในรอบทบทวน — การอ่านรอบหมุนเวียนใช้ค่ากลาง 5/10 ไปก่อน ทำขั้นที่ 1 แล้วผลจะแม่นขึ้น
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="ทำไมถึงอ่านว่าเป็นช่วงนี้">
          <ul className="space-y-1.5 text-xs leading-relaxed text-zinc-300">
            {r.reasons.map((x) => (
              <li key={x}>• {x}</li>
            ))}
          </ul>
        </Card>
        <Card title="สิ่งที่ควรทำในช่วงนี้">
          <ul className="space-y-1.5 text-xs leading-relaxed text-emerald-200">
            {r.playbook.map((x) => (
              <li key={x}>• {x}</li>
            ))}
          </ul>
        </Card>
        <Card title="กลุ่มนำ">
          {r.leaders.length === 0 ? (
            <p className="text-xs text-zinc-400">ยังไม่มีกลุ่มที่โดดเด่น</p>
          ) : (
            <ul className="space-y-1.5">
              {r.leaders.map((l) => (
                <li key={l.name} className="flex items-center gap-2 rounded-lg border-l-2 border-emerald-500 bg-zinc-800/30 px-3 py-1.5">
                  <span className="flex-1 text-sm text-zinc-100">{l.name}</span>
                  <StageBadge stage={l.stage} short />
                  <span className="font-mono text-xs text-emerald-400">{l.score}/5</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="กลุ่มล้าหลัง">
          {r.laggards.length === 0 ? (
            <p className="text-xs text-zinc-400">ยังไม่มีกลุ่มที่อ่อนชัดเจน</p>
          ) : (
            <ul className="space-y-1.5">
              {r.laggards.map((l) => (
                <li key={l.name} className="flex items-center gap-2 rounded-lg border-l-2 border-red-500 bg-zinc-800/30 px-3 py-1.5">
                  <span className="flex-1 text-sm text-zinc-100">{l.name}</span>
                  <StageBadge stage={l.stage} short />
                  <span className="font-mono text-xs text-red-400">{l.score}/5</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function MtfTab() {
  const [input, setInput] = useState("");
  const [symbol, setSymbol] = useState<string | null>(null);
  const { data, loading, error } = useResource<{ mtf: MtfResult }>(
    symbol ? `/pro?view=mtf&symbol=${encodeURIComponent(symbol)}` : null,
  );

  const ALIGN_TONE = { PERFECT: "good", GOOD: "warn", MIXED: "late", WEAK: "bad" } as const;

  return (
    <div className="space-y-4">
      <Card title="ตรวจการเรียงตัวของกรอบเวลา" subtitle="เดือน → สัปดาห์ → วัน ต้องชี้ทางเดียวกันก่อนเข้าไม้">
        <div className="flex gap-2">
          <TextInput
            value={input}
            onChange={(e) => setInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === "Enter" && input.trim()) setSymbol(input.trim().toUpperCase());
            }}
            placeholder="เช่น DELTA"
            className="font-mono"
          />
          <Button size="sm" variant="primary" disabled={input.trim() === ""} onClick={() => setSymbol(input.trim().toUpperCase())}>
            ตรวจ
          </Button>
        </div>
      </Card>

      {symbol === null ? (
        <EmptyState title="ใส่สัญลักษณ์เพื่อเริ่ม" hint="ระบบจะเทียบราคากับค่าเฉลี่ยในทั้งสามกรอบเวลา" />
      ) : loading ? (
        <Skeleton className="h-64" />
      ) : error || !data ? (
        <EmptyState title="ตรวจไม่สำเร็จ" hint={error ?? undefined} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card title={`${data.mtf.symbol} — ${data.mtf.name}`} className="lg:col-span-2">
            <TableWrap minWidth={420}>
              <thead>
                <tr>
                  <Th>กรอบเวลา</Th>
                  <Th align="right">ราคา</Th>
                  <Th align="right">ค่าเฉลี่ย</Th>
                  <Th align="center">เหนือ MA</Th>
                  <Th align="center">MA ชันขึ้น</Th>
                </tr>
              </thead>
              <tbody>
                {data.mtf.legs.map((leg) => (
                  <tr key={leg.timeframe}>
                    <Td className="text-xs text-zinc-200">{leg.label}</Td>
                    <Td align="right" mono>{fmt(leg.price)}</Td>
                    <Td align="right" mono className="text-zinc-400">{fmt(leg.ma)}</Td>
                    <Td align="center">{leg.above ? <Badge tone="good">ใช่</Badge> : <Badge tone="bad">ไม่</Badge>}</Td>
                    <Td align="center">{leg.slopeUp ? <Badge tone="good">ใช่</Badge> : <Badge tone="bad">ไม่</Badge>}</Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
            <p className="mt-3 text-xs leading-relaxed text-zinc-300">{data.mtf.note}</p>
          </Card>
          <Card title="ผลสรุป">
            <div className="text-center">
              <Badge tone={ALIGN_TONE[data.mtf.alignment]} className="text-sm">{data.mtf.alignment}</Badge>
              <div className="mt-3 font-mono text-3xl tabular-nums text-zinc-50">{data.mtf.score}<span className="text-lg text-zinc-400">/4</span></div>
              <p className="mt-2 text-xs font-medium text-emerald-300">{data.mtf.action}</p>
            </div>
            <div className="mt-4 rounded-lg border border-zinc-800 px-3 py-2">
              <div className="text-[0.65rem] uppercase text-zinc-400">Mansfield RS</div>
              <div className="flex items-baseline gap-2">
                <span className={`font-mono text-sm ${data.mtf.rs.now >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {fmt(data.mtf.rs.now, 2)}
                </span>
                <span className="text-[0.65rem] text-zinc-400">
                  8 สัปดาห์ก่อน {fmt(data.mtf.rs.weeksAgo8, 2)} · {data.mtf.rs.rising ? "กำลังแข็งขึ้น" : "กำลังอ่อนลง"}
                </span>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function OptionsTab() {
  const [stage, setStage] = useState(2);
  const [spot, setSpot] = useState(100);
  const [selected, setSelected] = useState(OPTION_STRATEGIES[0]?.id ?? "");

  const suggested = useMemo(() => optionStrategiesFor(stage, 6), [stage]);
  const strategy = useMemo(
    () => OPTION_STRATEGIES.find((s) => s.id === selected) ?? OPTION_STRATEGIES[0],
    [selected],
  );
  // Strikes and premiums are percentages of spot in the catalog; they only
  // become prices once the customer tells us what the share costs.
  const legs = useMemo(() => (strategy ? resolveLegs(strategy.legs, spot) : []), [strategy, spot]);
  const stats = useMemo(() => (legs.length ? optionStats(legs, spot) : null), [legs, spot]);
  const payoff = useMemo(
    () => (legs.length ? payoffSeries(legs, spot * 0.7, spot * 1.3, 60) : []),
    [legs, spot],
  );

  return (
    <div className="space-y-4">
      <Card title="เลือกตาม Stage" subtitle="กลยุทธ์ที่เหมาะกับสภาวะของหุ้น ไม่ใช่กับความรู้สึกของคุณ">
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4].map((n) => (
            <button
              key={n}
              onClick={() => setStage(n)}
              className={`min-h-9 rounded-lg border px-3 text-xs ${
                stage === n ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300" : "border-zinc-700 text-zinc-400"
              }`}
            >
              Stage {n}
            </button>
          ))}
        </div>
        <div className="mt-3 max-w-xs">
          <NumberField
            label="ราคาหุ้นอ้างอิง (สำหรับวาดกราฟ)"
            value={spot}
            onChange={setSpot}
            step={5}
            min={1}
          />
        </div>
        <ul className="mt-3 flex flex-wrap gap-2">
          {suggested.map((s) => (
            <li key={s.id}>
              <button
                onClick={() => setSelected(s.id)}
                className={`min-h-9 rounded-lg border px-3 text-xs ${
                  selected === s.id ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300" : "border-zinc-700 text-zinc-300 hover:border-zinc-600"
                }`}
              >
                {s.th}
              </button>
            </li>
          ))}
        </ul>
      </Card>

      {strategy && stats && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card title={strategy.th} subtitle={strategy.name} className="lg:col-span-2">
            <LineChart
              height={220}
              valueKind="plain"
              caption={`กำไร/ขาดทุนของ ${strategy.name} ตามราคาหุ้นตอนหมดอายุ`}
              xLabels={payoff.map((p) => fmt(p.spot, 0))}
              series={[
                { label: "กำไร/ขาดทุนต่อหุ้น", values: payoff.map((p) => p.pnl), color: CHART_COLORS.strategy },
                { label: "จุดคุ้มทุน", values: payoff.map(() => 0), color: CHART_COLORS.benchmark, dashed: true },
              ]}
            />
            <p className="mt-1 text-center text-[0.7rem] text-zinc-400">
              แกนนอนคือราคาหุ้นตอนหมดอายุ ({fmt(spot * 0.7, 0)} → {fmt(spot * 1.3, 0)})
            </p>
            <div className="mt-3">
              <TableWrap minWidth={360}>
                <thead>
                  <tr>
                    <Th>ขา</Th>
                    <Th align="center">ประเภท</Th>
                    <Th align="right">Strike</Th>
                    <Th align="right">พรีเมียม</Th>
                  </tr>
                </thead>
                <tbody>
                  {legs.map((leg, i) => (
                    <tr key={i}>
                      <Td><Badge tone={leg.action === "BUY" ? "good" : "bad"}>{leg.action}</Badge></Td>
                      <Td align="center" className="text-xs text-zinc-200">{leg.type}</Td>
                      <Td align="right" mono>{fmt(leg.strike)}</Td>
                      <Td align="right" mono>{fmt(leg.premium)}</Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            </div>
          </Card>

          <Card title="ตัวเลขสำคัญ">
            <div className="space-y-3">
              <StatCard
                label={stats.netCredit >= 0 ? "รับสุทธิ" : "จ่ายสุทธิ"}
                value={fmt(Math.abs(stats.netCredit))}
                tone={stats.netCredit >= 0 ? "good" : "neutral"}
              />
              <StatCard label="กำไรสูงสุด" value={stats.maxProfit === null ? "ไม่จำกัด" : fmt(stats.maxProfit)} tone="good" />
              <StatCard label="ขาดทุนสูงสุด" value={stats.maxLoss === null ? "ไม่จำกัด" : fmt(stats.maxLoss)} tone="bad" />
              <div className="rounded-lg border border-zinc-800 px-3 py-2">
                <div className="text-[0.65rem] uppercase text-zinc-400">จุดคุ้มทุน</div>
                <div className="font-mono text-sm tabular-nums text-zinc-100">
                  {stats.breakevens.length === 0 ? "—" : stats.breakevens.map((b) => fmt(b)).join(" · ")}
                </div>
              </div>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-zinc-300">{strategy.usage}</p>
          </Card>
        </div>
      )}
    </div>
  );
}
