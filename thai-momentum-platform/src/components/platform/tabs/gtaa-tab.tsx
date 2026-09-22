"use client"

// GTAA Rotation (Faber) — Global Tactical Asset Allocation บนแพลตฟอร์ม
// Engine: src/lib/gtaa/* — SMA 10M filter → momentum 1/3/6/12 rank → Top N equal-weight → เงินสด
// Harness: walk-forward + Monte Carlo + sensitivity + self-test 11 ข้อ ฝังใน

import { useEffect, useMemo, useState } from "react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Download,
  Globe2,
  Play,
  RefreshCw,
  RotateCcw,
  Trash2,
  XCircle,
} from "lucide-react"
import { useApi, postJson } from "@/hooks/use-api"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import type {
  GtaaConfig,
  GtaaHistoryResponse,
  GtaaOverview,
  GtaaRunResponse,
  GtaaSnapshotResponse,
  GridCell,
  MonteCarloBundle,
  SelfTestResult,
  SignalRow,
  TrackedSignalRow,
  WalkForwardResult,
} from "@/lib/gtaa/types"

const TOOLTIP_STYLE = {
  backgroundColor: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  fontSize: 12,
  color: "#0f172a",
  boxShadow: "0 4px 12px rgba(16,24,40,0.08)",
} as const

function pct(x: number | null | undefined, digits = 1): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return "—"
  return `${x >= 0 ? "+" : ""}${(x * 100).toFixed(digits)}%`
}

/* ---------- CSV export (client-side, BOM สำหรับ Excel) ---------- */

function downloadCsv(filename: string, rows: (string | number | null | undefined | boolean)[][]) {
  const field = (v: string | number | null | undefined | boolean) => {
    const s = v === null || v === undefined ? "" : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = "\ufeff" + rows.map((r) => r.map(field).join(",")).join("\n")
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/* ---------- การ์ดสถิติย่อ ---------- */

function StatTile({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string
  value: string
  sub?: string
  tone?: "good" | "bad" | "neutral"
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-white px-3 py-2.5">
      <p className="truncate text-[10px] font-medium text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 font-mono text-base font-bold tabular-nums",
          tone === "good" && "text-neon-green",
          tone === "bad" && "text-neon-rose",
          tone === "neutral" && "text-foreground",
        )}
      >
        {value}
      </p>
      {sub && <p className="truncate text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  )
}

/* ---------- กราฟ ---------- */

function EquityChart({ data }: { data: { month: string; strategy: number; benchmark: number }[] }) {
  const chartData = useMemo(
    () =>
      data.map((p) => ({
        month: p.month,
        strategy: p.strategy * 100,
        benchmark: p.benchmark * 100,
      })),
    [data],
  )
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="gtaaEq" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0891b2" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#0891b2" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="month" minTickGap={56} tick={{ fontSize: 10 }} tickFormatter={(v: string) => String(v).slice(2)} />
        <YAxis
          domain={["auto", "auto"]}
          tick={{ fontSize: 11 }}
          width={54}
          tickFormatter={(v: number) => `${Math.round(v)}`}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelStyle={{ color: "#64748b" }}
          formatter={(v: number | string, name: string) => [`${Number(v).toFixed(0)}`, name]}
        />
        <Legend />
        <Area
          type="monotone"
          dataKey="strategy"
          stroke="#0891b2"
          strokeWidth={2}
          fill="url(#gtaaEq)"
          name="GTAA (เริ่ม 100)"
          dot={false}
        />
        <Area
          type="monotone"
          dataKey="benchmark"
          stroke="#94a3b8"
          strokeWidth={1.5}
          strokeDasharray="5 4"
          fill="transparent"
          name="SPY ถือตายตัว (เริ่ม 100)"
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

function DrawdownChart({ data }: { data: { month: string; ddStrategy: number; ddBenchmark: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="month" minTickGap={56} tick={{ fontSize: 10 }} tickFormatter={(v: string) => String(v).slice(2)} />
        <YAxis tick={{ fontSize: 11 }} width={54} tickFormatter={(v: number) => `${v.toFixed(0)}%`} />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelStyle={{ color: "#64748b" }}
          formatter={(v: number | string, name: string) => [`${Number(v).toFixed(1)}%`, name]}
        />
        <Legend />
        <Area type="monotone" dataKey="ddStrategy" stroke="#e11d48" strokeWidth={1.5} fill="#e11d48" fillOpacity={0.14} name="GTAA drawdown" dot={false} />
        <Area type="monotone" dataKey="ddBenchmark" stroke="#94a3b8" strokeWidth={1.2} strokeDasharray="4 4" fill="transparent" name="SPY drawdown" dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

/* ---------- ตารางสัญญาณ ---------- */

const STATUS_META = {
  selected: { cls: "border-neon-green/35 bg-neon-green/10 text-neon-green", label: "ถือ" },
  reserve: { cls: "border-neon-amber/35 bg-neon-amber/10 text-neon-amber", label: "สำรอง" },
  kicked: { cls: "border-neon-rose/35 bg-neon-rose/10 text-neon-rose", label: "→เงินสด" },
} as const

function SignalTable({ rows, decisionMonth }: { rows: SignalRow[]; decisionMonth: string }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">#</TableHead>
            <TableHead>สินทรัพย์</TableHead>
            <TableHead className="text-right">ราคา</TableHead>
            <TableHead className="text-right">vs SMA</TableHead>
            <TableHead className="text-right">1M</TableHead>
            <TableHead className="text-right">3M</TableHead>
            <TableHead className="text-right">6M</TableHead>
            <TableHead className="text-right">12M</TableHead>
            <TableHead className="min-w-36">Momentum Score</TableHead>
            <TableHead className="text-right">น้ำหนัก</TableHead>
            <TableHead>สถานะ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const meta = STATUS_META[r.status]
            const maxScore = Math.max(...rows.map((x) => x.score ?? 0), 0.01)
            const scorePct = r.score !== null ? Math.max(0, (r.score / maxScore) * 100) : 0
            return (
              <TableRow key={r.ticker} className={cn(r.status === "selected" && "bg-neon-green/[0.04]")}>
                <TableCell className="font-mono text-xs text-muted-foreground">{r.rank ?? "—"}</TableCell>
                <TableCell>
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-sm font-bold">{r.ticker}</span>
                    <span className="hidden truncate text-[11px] text-muted-foreground sm:inline">{r.name}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono text-xs tabular-nums">{r.close.toFixed(2)}</TableCell>
                <TableCell className="text-right">
                  {Number.isFinite(r.sma) ? (
                    <span
                      className={cn(
                        "font-mono text-xs font-semibold",
                        r.trendPass ? "text-neon-green" : "text-neon-rose",
                      )}
                    >
                      {r.trendPass ? `PASS +${(((r.close - r.sma) / r.sma) * 100).toFixed(1)}%` : `FAIL ${(((r.close - r.sma) / r.sma) * 100).toFixed(1)}%`}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className={cn("text-right font-mono text-xs tabular-nums", (r.r1 ?? 0) >= 0 ? "text-neon-green" : "text-neon-rose")}>{pct(r.r1)}</TableCell>
                <TableCell className={cn("text-right font-mono text-xs tabular-nums", (r.r3 ?? 0) >= 0 ? "text-neon-green" : "text-neon-rose")}>{pct(r.r3)}</TableCell>
                <TableCell className={cn("text-right font-mono text-xs tabular-nums", (r.r6 ?? 0) >= 0 ? "text-neon-green" : "text-neon-rose")}>{pct(r.r6)}</TableCell>
                <TableCell className={cn("text-right font-mono text-xs tabular-nums", (r.r12 ?? 0) >= 0 ? "text-neon-green" : "text-neon-rose")}>{pct(r.r12)}</TableCell>
                <TableCell>
                  {r.score !== null ? (
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-full min-w-16 overflow-hidden rounded-full bg-foreground/[0.06]">
                        <div
                          className={cn("h-full rounded-full", r.status === "selected" ? "bg-neon-green" : "bg-neon-cyan/60")}
                          style={{ width: `${scorePct}%` }}
                        />
                      </div>
                      <span className="font-mono text-xs font-semibold tabular-nums">{pct(r.score)}</span>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right font-mono text-xs font-bold tabular-nums">{r.weight > 0 ? `${(r.weight * 100).toFixed(1)}%` : "—"}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={cn("text-[10px]", meta.cls)}>
                    {meta.label}
                  </Badge>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      <p className="mt-2 px-1 text-[11px] text-muted-foreground">
        ตัดสินใจที่ปิดเดือน {decisionMonth} — สัญญาณชุดนี้ใช้จัดพอร์ตเดือนถัดไป · กลุ่ม "→เงินสด" = หลุดเส้น SMA โดนเตะออกตามกฎ ไม่สนข่าว
      </p>
    </div>
  )
}

/* ---------- Sensitivity grid ---------- */

function SensitivityGrid({ cells }: { cells: GridCell[] }) {
  const smas = [8, 10, 12]
  const topNs = [3, 4, 5, 6, 7, 8, 9]
  const sharpes = cells.map((c) => c.sharpe)
  const min = Math.min(...sharpes)
  const max = Math.max(...sharpes)
  const colorOf = (s: number) => {
    const t = max - min > 1e-9 ? (s - min) / (max - min) : 0.5
    // ต่ำ → rose อ่อน / สูง → emerald
    return t < 0.5 ? `rgba(225,29,72,${0.08 + (0.5 - t) * 0.5})` : `rgba(5,150,105,${0.08 + (t - 0.5) * 0.6})`
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] border-separate border-spacing-1">
        <thead>
          <tr>
            <th className="text-left text-[10px] font-medium text-muted-foreground">Top N \ SMA</th>
            {smas.map((s) => (
              <th key={s} className="text-center text-[10px] font-medium text-muted-foreground">
                SMA {s}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {topNs.map((n) => (
            <tr key={n}>
              <td className="text-[11px] font-semibold">Top {n}</td>
              {smas.map((s) => {
                const c = cells.find((x) => x.topN === n && x.smaMonths === s)
                if (!c) return <td key={s} className="rounded-md border border-border bg-foreground/[0.02] p-2 text-center text-[10px] text-muted-foreground">—</td>
                return (
                  <td
                    key={s}
                    className="rounded-md border border-border/60 p-2 text-center"
                    style={{ backgroundColor: colorOf(c.sharpe) }}
                  >
                    <p className="font-mono text-xs font-bold tabular-nums">{c.sharpe.toFixed(2)}</p>
                    <p className="font-mono text-[10px] text-foreground/70 tabular-nums">{pct(c.cagr)} · {pct(c.maxDD)}</p>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-muted-foreground">
        เขียวเข้ม = Sharpe สูง — ตัวเลขคือ Sharpe (CAGR | MaxDD) · บนข้อมูลจริงมักชี้ว่า <span className="font-semibold">Top N คือปุ่มเสี่ยงหลัก ส่วนความยาว SMA แทบไม่มีผล</span>
      </p>
    </div>
  )
}

/* ---------- Walk-forward ---------- */

function WalkForwardPanel({ wf }: { wf: WalkForwardResult }) {
  const deg = wf.degradationPct
  const tone = deg > 0.5 ? "rose" : deg > 0.25 ? "amber" : "green"
  return (
    <div className="space-y-3">
      <div
        className={cn(
          "rounded-md border px-3 py-2.5 text-xs leading-5",
          tone === "rose" && "border-neon-rose/25 bg-neon-rose/[0.06] text-neon-rose",
          tone === "amber" && "border-neon-amber/25 bg-neon-amber/[0.06] text-neon-amber",
          tone === "green" && "border-neon-green/25 bg-neon-green/[0.06] text-neon-green",
        )}
      >
        {wf.verdict}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <StatTile label="หน้าต่าง (IS 5 ปี → OOS 1 ปี)" value={String(wf.windows.length)} />
        <StatTile
          label="OOS degradation (median)"
          value={`${Math.round(deg * 100)}%`}
          tone={deg > 0.5 ? "bad" : deg > 0.25 ? "neutral" : "good"}
        />
        <StatTile label="config ที่ถูกเลือกบ่อยสุด" value={wf.mostChosen} sub={`เสถียร ${Math.round(wf.stabilityPct * 100)}% ของหน้าต่าง`} />
      </div>
      <ScrollArea className="max-h-72">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>OOS ช่วง</TableHead>
              <TableHead>config ที่ IS เลือก</TableHead>
              <TableHead className="text-right">IS Sharpe</TableHead>
              <TableHead className="text-right">OOS Sharpe</TableHead>
              <TableHead className="text-right">หายไป</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {wf.windows.map((w, i) => {
              const drop = w.isSharpe > 0.05 ? 1 - w.oosSharpe / w.isSharpe : 0
              return (
                <TableRow key={i}>
                  <TableCell className="font-mono text-xs">{w.oosStart} → {w.oosEnd}</TableCell>
                  <TableCell className="font-mono text-xs font-semibold">Top {w.chosenTopN} · SMA {w.chosenSma}</TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums">{w.isSharpe.toFixed(2)}</TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums">{w.oosSharpe.toFixed(2)}</TableCell>
                  <TableCell className={cn("text-right font-mono text-xs tabular-nums", drop > 0.5 ? "text-neon-rose" : drop > 0 ? "text-neon-amber" : "text-neon-green")}>
                    {drop > 0 ? `${Math.round(drop * 100)}%` : "—"}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  )
}

/* ---------- Monte Carlo ---------- */

function MonteCarloPanel({ mc }: { mc: MonteCarloBundle }) {
  const pctRow = (
    label: string,
    m: { draws: number; cagr: { p5: number; p50: number; p95: number }; maxDD: { p5: number; p50: number; p95: number }; sharpe: { p5: number; p50: number; p95: number } },
  ) => (
    <div className="rounded-lg border border-border bg-foreground/[0.02] p-3">
      <p className="text-xs font-semibold">
        {label} <span className="font-mono text-[10px] font-normal text-muted-foreground">({m.draws} รอบ)</span>
      </p>
      <div className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1.5 text-[11px]">
        <span />
        <span className="text-muted-foreground">p5</span>
        <span className="text-muted-foreground">p50</span>
        <span className="text-muted-foreground">p95</span>
        {(["cagr", "maxDD", "sharpe"] as const).map((k) => (
          <div key={k} className="col-span-4 grid grid-cols-4 gap-x-3 border-t border-border/60 pt-1">
            <span className="text-foreground/80">{k === "cagr" ? "CAGR" : k === "maxDD" ? "MaxDD" : "Sharpe"}</span>
            <span className="font-mono tabular-nums">{k === "sharpe" ? m[k].p5.toFixed(2) : pct(m[k].p5)}</span>
            <span className="font-mono font-semibold tabular-nums">{k === "sharpe" ? m[k].p50.toFixed(2) : pct(m[k].p50)}</span>
            <span className="font-mono tabular-nums">{k === "sharpe" ? m[k].p95.toFixed(2) : pct(m[k].p95)}</span>
          </div>
        ))}
      </div>
    </div>
  )
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {pctRow("Block bootstrap บนผลจริง (บล็อก 6 เดือน)", mc.bootstrap)}
        {pctRow("Synthetic seeds — จักรวาลใหม่ทั้งชุดต่อ seed", mc.synthetic)}
      </div>
      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">การกระจาย CAGR — block bootstrap (แถบ p5–p95 แทนตัวเลขเดี่ยว)</p>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={mc.bootstrap.histogram} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="bucket" tick={{ fontSize: 9 }} interval="preserveStartEnd" minTickGap={24} />
            <YAxis tick={{ fontSize: 10 }} width={32} allowDecimals={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: "#64748b" }} cursor={{ fill: "rgba(100,116,139,0.08)" }} />
            <Bar dataKey="count" fill="#0891b2" fillOpacity={0.55} radius={[3, 3, 0, 0]} name="จำนวนรอบ" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

/* ---------- Self-test ---------- */

function SelfTestList({ tests }: { tests: SelfTestResult[] }) {
  const passed = tests.filter((t) => t.pass).length
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className={cn(passed === tests.length ? "border-neon-green/35 bg-neon-green/10 text-neon-green" : "border-neon-rose/35 bg-neon-rose/10 text-neon-rose")}>
          {passed}/{tests.length} ผ่าน
        </Badge>
        <span className="text-[11px] text-muted-foreground">invariant suite ฝังใน engine — รันสดทุกครั้งที่โหลดหน้า</span>
      </div>
      <div className="grid grid-cols-1 gap-1.5 lg:grid-cols-2">
        {tests.map((t) => (
          <div
            key={t.id}
            className={cn(
              "flex min-w-0 items-start gap-2 overflow-hidden rounded-md border px-2.5 py-2",
              t.pass ? "border-border/70 bg-foreground/[0.015]" : "border-neon-rose/40 bg-neon-rose/[0.05]",
            )}
          >
            {t.pass ? (
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-neon-green" aria-hidden />
            ) : (
              <XCircle className="mt-0.5 size-3.5 shrink-0 text-neon-rose" aria-hidden />
            )}
            <div className="min-w-0">
              <p className="text-[11px] font-medium leading-4">{t.name}</p>
              <p className="truncate font-mono text-[10px] text-muted-foreground" title={t.detail}>
                {t.detail}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ---------- Data card ---------- */

interface DataStatus {
  fromFile: boolean
  meta: { source: string; fetchedAt: string; notes: string[] }
  months: number
  firstMonth: string
  lastMonth: string
  quality: { ok: boolean; months: number; tickers: number; lastMonth: string; issues: { ticker: string; type: string; detail: string }[] }
}

function DataCard({ onChanged }: { onChanged: () => void }) {
  const { data, refetch } = useApi<DataStatus>("/api/gtaa/data")
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null)
  const [csvText, setCsvText] = useState("")

  const doFetch = async () => {
    setBusy("fetch")
    setMsg(null)
    try {
      const r = await fetch("/api/gtaa/fetch", { method: "POST" })
      const j = (await r.json()) as { ok?: boolean; attempts?: { source: string; detail: string }[]; hint?: string; error?: string }
      if (!r.ok || !j.ok) {
        const attempts = (j.attempts ?? []).map((a) => `${a.source}: ${a.detail}`).join(" · ")
        setMsg({ tone: "err", text: `ดึงข้อมูลจริงไม่สำเร็จ (${attempts}) — ${j.hint ?? j.error ?? ""}` })
      } else {
        setMsg({ tone: "ok", text: "ดึงข้อมูลจริงสำเร็จ บันทึก panel.json แล้ว" })
        refetch()
        onChanged()
      }
    } catch (e) {
      setMsg({ tone: "err", text: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(null)
    }
  }

  const doUpload = async () => {
    setBusy("upload")
    setMsg(null)
    try {
      const r = await postJson<{ saved?: boolean; quality?: DataStatus["quality"]; error?: string }>("/api/gtaa/data", { csv: csvText })
      if (r.saved) {
        setMsg({ tone: "ok", text: `อัปโหลดสำเร็จ — ${r.quality?.months} เดือน × ${r.quality?.tickers} ตัว ผ่าน quality gate` })
        setCsvText("")
        refetch()
        onChanged()
      } else {
        setMsg({ tone: "err", text: r.error ?? "อัปโหลดไม่สำเร็จ" })
      }
    } catch (e) {
      setMsg({ tone: "err", text: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(null)
    }
  }

  const doReset = async () => {
    setBusy("reset")
    setMsg(null)
    try {
      await fetch("/api/gtaa/data", { method: "DELETE" })
      setMsg({ tone: "ok", text: "ลบไฟล์ข้อมูลแล้ว — กลับไปใช้ synthetic seed 42" })
      refetch()
      onChanged()
    } finally {
      setBusy(null)
    }
  }

  const onFile = async (file: File | null) => {
    if (!file) return
    const text = await file.text()
    setCsvText(text.slice(0, 4_000_000))
  }

  const q = data?.quality
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="size-4 text-neon-cyan" aria-hidden />
          ชั้นข้อมูล — ข้อมูลจริงต้องผ่าน quality gate ก่อนเข้า engine
        </CardTitle>
        <CardDescription>
          ทางเลือกมี 3 ช่องทาง: ปุ่มดึงข้อมูลจริง (Yahoo adjclose → Stooq fallback) · อัปโหลด CSV จากเครื่องคุณ · หรือรัน{" "}
          <code className="rounded bg-foreground/[0.05] px-1 font-mono text-[10px]">bun run gtaa -- fetch</code> บนเครื่องที่เน็ตปกติแล้ว commit{" "}
          <code className="rounded bg-foreground/[0.05] px-1 font-mono text-[10px]">data/gtaa/panel.json</code>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {data && (
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <Badge
              variant="outline"
              className={cn(
                data.meta.source === "synthetic"
                  ? "border-neon-amber/35 bg-neon-amber/10 text-neon-amber"
                  : "border-neon-green/35 bg-neon-green/10 text-neon-green",
              )}
            >
              {data.meta.source === "synthetic" ? "SYNTHETIC (seed 42)" : `ข้อมูลจริง · ${data.meta.source}`}
            </Badge>
            <Badge variant="outline" className="border-border bg-foreground/[0.03] font-mono text-[10px]">
              {data.months} เดือน · {data.firstMonth} → {data.lastMonth}
            </Badge>
            <Badge
              variant="outline"
              className={cn(
                q?.ok ? "border-neon-green/35 bg-neon-green/10 text-neon-green" : "border-neon-rose/35 bg-neon-rose/10 text-neon-rose",
              )}
            >
              quality {q?.ok ? "PASS" : `${q?.issues.length ?? 0} issues`}
            </Badge>
          </div>
        )}

        {q && !q.ok && (
          <ScrollArea className="max-h-32 rounded-md border border-neon-rose/30 bg-neon-rose/[0.04] px-3 py-2">
            <div className="space-y-1">
              {q.issues.map((i, k) => (
                <p key={k} className="font-mono text-[10px] text-neon-rose">
                  [{i.type}] {i.ticker}: {i.detail}
                </p>
              ))}
            </div>
          </ScrollArea>
        )}

        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={doFetch} disabled={busy !== null} className="min-h-9 gap-1.5">
            {busy === "fetch" ? <RefreshCw className="size-3.5 animate-spin" aria-hidden /> : <Download className="size-3.5" aria-hidden />}
            ดึงข้อมูลจริง
          </Button>
          <Button size="sm" variant="outline" onClick={doReset} disabled={busy !== null} className="min-h-9 gap-1.5 border-border">
            <RotateCcw className="size-3.5" aria-hidden />
            รีเซ็ตเป็น synthetic
          </Button>
          <label className="inline-flex">
            <input
              type="file"
              accept=".csv,text/csv,text/plain"
              className="sr-only"
              onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
              aria-label="เลือกไฟล์ CSV ราคารายเดือน"
            />
            <span
              className={cn(
                "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-border bg-foreground/[0.03] px-3 text-sm font-medium hover:bg-foreground/[0.06]",
                busy !== null && "pointer-events-none opacity-50",
              )}
            >
              <Database className="size-3.5" aria-hidden />
              เลือกไฟล์ CSV
            </span>
          </label>
        </div>

        <div className="space-y-2">
          <Label htmlFor="gtaa-csv" className="text-xs">
            หรือวาง CSV ตรงนี้ — รองรับ wide (Date,VTV,MTUM,…) และ long (date,ticker,adjclose)
          </Label>
          <Input
            id="gtaa-csv-file"
            value={csvText ? `${csvText.split(/\r?\n/).length} บรรทัดพร้อมอัปโหลด` : ""}
            placeholder="ยังไม่มีข้อมูล — เลือกไฟล์หรือวางในกล่องด้านล่าง"
            readOnly
            className="h-9 border-border bg-white font-mono text-xs"
          />
          <textarea
            id="gtaa-csv"
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            rows={3}
            placeholder={"Date,VTV,MTUM,VBR,…\n2013-05-31,74.21,31.55,88.10,…"}
            className="w-full rounded-md border border-border bg-white px-3 py-2 font-mono text-[11px] outline-none focus:border-neon-cyan/50"
          />
          <Button size="sm" onClick={doUpload} disabled={busy !== null || csvText.trim().length < 20} className="min-h-9">
            {busy === "upload" ? "กำลังตรวจ…" : "อัปโหลด + ตรวจ quality gate"}
          </Button>
        </div>

        {msg && (
          <Alert variant={msg.tone === "ok" ? "default" : "destructive"}>
            <AlertTriangle className="size-4" aria-hidden />
            <AlertTitle>{msg.tone === "ok" ? "สำเร็จ" : "ไม่สำเร็จ"}</AlertTitle>
            <AlertDescription className="text-[11px] leading-4">{msg.text}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}

/* ---------- Tracking Log ---------- */

function trackedResultBadge(realized: TrackedSignalRow["realized"]) {
  if (realized === null)
    return <Badge variant="outline" className="border-neon-amber/35 bg-neon-amber/10 text-[10px] text-neon-amber">รอผล</Badge>
  if (realized.state === "missing-data")
    return <Badge variant="outline" className="border-neon-amber/35 bg-neon-amber/10 text-[10px] text-neon-amber">ขาดข้อมูล</Badge>
  if (realized.hit === true)
    return <Badge variant="outline" className="border-neon-green/35 bg-neon-green/10 text-[10px] text-neon-green">ชนะ</Badge>
  if (realized.hit === false)
    return <Badge variant="outline" className="border-neon-rose/35 bg-neon-rose/10 text-[10px] text-neon-rose">แพ้</Badge>
  return <Badge variant="outline" className="border-border bg-foreground/[0.03] text-[10px] text-muted-foreground">—</Badge>
}

function TrackingCard({
  hist,
  activeCfg,
  onSaved,
}: {
  hist: GtaaHistoryResponse | null
  activeCfg: GtaaConfig
  onSaved: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null)

  const doSave = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const r = await postJson<GtaaSnapshotResponse>("/api/gtaa/snapshot", { config: activeCfg })
      setMsg({ tone: "ok", text: `บันทึกเดือน ${r.decisionMonth} แล้ว (#${r.id})` })
      onSaved()
    } catch (e) {
      setMsg({ tone: "err", text: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }

  const doDelete = async (id: number) => {
    setBusy(true)
    try {
      await fetch(`/api/gtaa/snapshot?id=${id}`, { method: "DELETE" })
      onSaved()
    } finally {
      setBusy(false)
    }
  }

  const t = hist?.tracking ?? null
  return (
    <Card className="min-w-0">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">📒 Tracking Log — สัญญาณที่บันทึก + ผลตรวจย้อนหลัง</CardTitle>
        <CardDescription>
          บันทึกพอร์ตเป้าหมาย &ldquo;ก่อน&rdquo; เดือนเริ่ม — เมื่อข้อมูลเดือนถัดไปมาถึง ระบบประเมินผลจริงเทียบ SPY อัตโนมัติ ทุกการบันทึกยิง EventLog เข้า hash chain ของระบบ แก้ประวัติย้อนหลังไม่ได้
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => void doSave()} disabled={busy} className="min-h-9 gap-1.5">
            {busy ? <RefreshCw className="size-3.5 animate-spin" aria-hidden /> : <Database className="size-3.5" aria-hidden />}
            บันทึกสัญญาณเดือนนี้
          </Button>
          {msg && <span className={cn("text-[11px]", msg.tone === "ok" ? "text-neon-green" : "text-neon-rose")}>{msg.text}</span>}
        </div>

        {hist && t ? (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StatTile label="บันทึกแล้ว" value={`${t.saved} เดือน`} />
              <StatTile label="ตรวจผลแล้ว" value={`${t.scored}`} />
              <StatTile
                label="ชนะ SPY"
                value={`${t.wins} ครั้ง`}
                sub={t.hitRate !== null ? `hit rate ${(t.hitRate * 100).toFixed(0)}%` : undefined}
                tone={t.hitRate !== null && t.hitRate >= 0.5 ? "good" : "neutral"}
              />
              <StatTile
                label="Δ เฉลี่ยต่อเดือน"
                value={t.avgDelta !== null ? `${(t.avgDelta * 100).toFixed(2)}%` : "—"}
                tone={t.avgDelta !== null && t.avgDelta > 0 ? "good" : "neutral"}
              />
            </div>

            {hist.signals.length === 0 && hist.runs.length === 0 ? (
              <div className="flex min-h-24 items-center justify-center rounded-md border border-dashed border-border px-4 text-center text-xs leading-5 text-muted-foreground">
                ยังไม่มีประวัติ — กดปุ่ม &ldquo;บันทึกสัญญาณเดือนนี้&rdquo; ด้านบน หรือติ๊ก &ldquo;บันทึกลง tracking log&rdquo; ที่การ์ดตั้งค่าแล้วกดรัน เพื่อเริ่มเก็บหลักฐานผลจริงรายเดือน
              </div>
            ) : (
              <>
                {hist.signals.length > 0 && (
                  <ScrollArea className="max-h-80">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>ตัดสินใจ</TableHead>
                          <TableHead>ใช้เดือน</TableHead>
                          <TableHead className="text-right">เงินสด</TableHead>
                          <TableHead className="min-w-40">พอร์ตเป้าหมาย</TableHead>
                          <TableHead className="text-right">SPY</TableHead>
                          <TableHead className="text-right">พอร์ตจริง</TableHead>
                          <TableHead className="text-right">Δ vs SPY</TableHead>
                          <TableHead>ผล</TableHead>
                          <TableHead className="w-8"><span className="sr-only">ลบ</span></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {hist.signals.map((s) => (
                          <TableRow key={s.id}>
                            <TableCell className="whitespace-nowrap font-mono text-xs">{s.decisionMonth}</TableCell>
                            <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">{s.appliesMonth}</TableCell>
                            <TableCell className="text-right font-mono text-xs tabular-nums">{(s.cashPct * 100).toFixed(0)}%</TableCell>
                            <TableCell>
                              <div className="flex max-w-56 flex-wrap gap-1">
                                {s.holdings.length === 0 ? (
                                  <span className="text-[10px] text-muted-foreground">—</span>
                                ) : (
                                  s.holdings.map((h) => (
                                    <Badge key={h.ticker} variant="outline" className="border-border bg-foreground/[0.04] font-mono text-[10px]">
                                      {h.ticker} {(h.weight * 100).toFixed(0)}%
                                    </Badge>
                                  ))
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs tabular-nums">{s.realized?.spyRet != null ? pct(s.realized.spyRet) : "—"}</TableCell>
                            <TableCell className="text-right font-mono text-xs tabular-nums">{s.realized?.portfolioRet != null ? pct(s.realized.portfolioRet) : "—"}</TableCell>
                            <TableCell
                              className={cn(
                                "text-right font-mono text-xs font-semibold tabular-nums",
                                s.realized?.delta != null ? (s.realized.delta >= 0 ? "text-neon-green" : "text-neon-rose") : "text-muted-foreground",
                              )}
                            >
                              {s.realized?.delta != null ? pct(s.realized.delta) : "—"}
                            </TableCell>
                            <TableCell>{trackedResultBadge(s.realized)}</TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 min-h-8 w-8 p-0 text-muted-foreground hover:text-neon-rose"
                                title="ลบ snapshot"
                                aria-label={`ลบ snapshot ${s.decisionMonth} #${s.id}`}
                                disabled={busy}
                                onClick={() => void doDelete(s.id)}
                              >
                                <Trash2 className="size-3.5" aria-hidden />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                )}

                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">ประวัติการรันที่บันทึก — config เดิม = ผลเดิม (ตรวจย้อนหลังได้)</p>
                  {hist.runs.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">ยังไม่มี — ติ๊ก &ldquo;บันทึกลง tracking log&rdquo; ที่การ์ดตั้งค่าแล้วกดรัน หรือกดปุ่มด้านบน</p>
                  ) : (
                    <ScrollArea className="max-h-60">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>เวลา</TableHead>
                            <TableHead>config</TableHead>
                            <TableHead>hash</TableHead>
                            <TableHead className="text-right">เดือน</TableHead>
                            <TableHead className="text-right">CAGR</TableHead>
                            <TableHead className="text-right">MaxDD</TableHead>
                            <TableHead className="text-right">Sharpe</TableHead>
                            <TableHead className="text-right">SPY CAGR</TableHead>
                            <TableHead>แหล่ง</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {hist.runs.map((r) => (
                            <TableRow key={r.id}>
                              <TableCell className="whitespace-nowrap text-[11px] text-muted-foreground">
                                {new Date(r.createdAt).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}
                              </TableCell>
                              <TableCell className="whitespace-nowrap font-mono text-[11px]">
                                Top {r.config.topN} · SMA {r.config.smaMonths}
                                {r.config.skipMonths ? " · 12-1" : ""} · {r.config.costBps}bps
                                {r.config.tranches > 1 ? ` · ${r.config.tranches}T` : ""}
                              </TableCell>
                              <TableCell className="max-w-24 truncate font-mono text-[10px] text-muted-foreground" title={r.configHash}>
                                {r.configHash}
                              </TableCell>
                              <TableCell className="text-right font-mono text-xs tabular-nums">{r.months}</TableCell>
                              <TableCell className="text-right font-mono text-xs tabular-nums">{pct(r.cagr)}</TableCell>
                              <TableCell className="text-right font-mono text-xs tabular-nums">{pct(r.maxDD)}</TableCell>
                              <TableCell className="text-right font-mono text-xs tabular-nums">{r.sharpe.toFixed(2)}</TableCell>
                              <TableCell className="text-right font-mono text-xs tabular-nums text-muted-foreground">{pct(r.benchCagr)}</TableCell>
                              <TableCell className="text-[11px] text-muted-foreground">{r.dataSource}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  )}
                </div>
              </>
            )}
          </>
        ) : (
          <Skeleton className="h-40 w-full" />
        )}
      </CardContent>
    </Card>
  )
}

/* ---------- Checklist รายเดือน ---------- */

const CHECKLIST_ITEMS = [
  "รอถึงวันทำการสุดท้ายของเดือน — ห้ามรีบรัดก่อนปิดยอด",
  "อัปเดตข้อมูลราคา (ปุ่มดึงข้อมูลจริง หรือรัน bun run gtaa -- fetch)",
  "รันสัญญาณ — ตารางด้านบนคือพอร์ตเป้าหมายเดือนหน้า",
  "สั่งเทรดตามน้ำหนักที่โมเดลบอก — ไม่เดา ไม่ปรับตามข่าว",
  "บันทึกพอร์ตที่ execute จริงเทียบพอร์ตโมเดล (tracking log — ของจริงมักหลุดตรงนี้ ไม่ใช่ตรงโมเดล)",
]

function ChecklistCard({
  monthKey,
  autoItems,
}: {
  monthKey: string
  autoItems: { label: string; done: boolean; detail: string }[]
}) {
  const [checked, setChecked] = useState<boolean[]>(() => CHECKLIST_ITEMS.map(() => false))
  const storageKey = `gtaa-checklist-${monthKey}`

  useEffect(() => {
    let alive = true
    Promise.resolve().then(() => {
      if (!alive) return
      try {
        const raw = localStorage.getItem(storageKey)
        if (raw) {
          const arr = JSON.parse(raw) as boolean[]
          if (Array.isArray(arr) && arr.length === CHECKLIST_ITEMS.length) setChecked(arr)
        }
      } catch {
        /* localStorage ไม่พร้อมใช้ — ข้าม */
      }
    })
    return () => {
      alive = false
    }
  }, [storageKey])

  const toggle = (i: number) => {
    const next = checked.map((c, k) => (k === i ? !c : c))
    setChecked(next)
    try {
      localStorage.setItem(storageKey, JSON.stringify(next))
    } catch {
      /* ข้าม */
    }
  }

  const done = checked.filter(Boolean).length
  return (
    <Card className="min-w-0">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">✅ Checklist วินัยประจำเดือน ({monthKey})</CardTitle>
        <CardDescription>เกณฑ์ของระบบ: ทำตามลำดับ จบเดือนด้วยการ execute ตรงโมเดล — {done}/{CHECKLIST_ITEMS.length} เสร็จ</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {autoItems.map((item, i) => (
          <div
            key={`auto-${i}`}
            className={cn(
              "flex min-h-11 items-start gap-2.5 rounded-md border px-3 py-2.5",
              item.done ? "border-neon-green/30 bg-neon-green/[0.05]" : "border-border bg-white",
            )}
          >
            <Checkbox disabled checked={item.done} className="mt-0.5" aria-label={item.label} />
            <span className={cn("min-w-0 flex-1 text-xs leading-5", item.done && "text-muted-foreground line-through")}>
              {item.label}
              <span className="block truncate font-mono text-[10px] text-muted-foreground" title={item.detail}>
                {item.detail}
              </span>
            </span>
            <Badge variant="outline" className="shrink-0 border-neon-cyan/30 text-[10px] text-neon-cyan">
              อัตโนมัติ
            </Badge>
          </div>
        ))}
        {CHECKLIST_ITEMS.map((item, i) => (
          <label
            key={i}
            className={cn(
              "flex min-h-11 cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2.5 transition-colors",
              checked[i] ? "border-neon-green/30 bg-neon-green/[0.05]" : "border-border bg-white hover:bg-foreground/[0.02]",
            )}
          >
            <Checkbox checked={checked[i]} onCheckedChange={() => toggle(i)} className="mt-0.5" aria-label={item} />
            <span className={cn("text-xs leading-5", checked[i] && "text-muted-foreground line-through")}>{item}</span>
          </label>
        ))}
      </CardContent>
    </Card>
  )
}

/* ---------- การ์ด config + วิเคราะห์ ---------- */

function ConfigCard({
  cfg,
  onChange,
  onRun,
  running,
  persist,
  onPersistChange,
}: {
  cfg: GtaaConfig
  onChange: (patch: Partial<GtaaConfig>) => void
  onRun: () => void
  running: boolean
  persist: boolean
  onPersistChange: (v: boolean) => void
}) {
  const selCls = "h-9 border-border bg-white text-xs"
  return (
    <Card className="min-w-0">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Play className="size-4 text-neon-cyan" aria-hidden />
          ตั้งค่า + รันวิเคราะห์เต็มชุด
        </CardTitle>
        <CardDescription>
          รัน 1 ครั้ง = backtest + sensitivity 21 ช่อง + walk-forward + Monte Carlo (bootstrap 500 + synthetic seeds) — deterministic ทุกครั้ง
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">Top N</Label>
            <Select value={String(cfg.topN)} onValueChange={(v) => onChange({ topN: Number(v) })}>
              <SelectTrigger className={selCls} aria-label="จำนวนสินทรัพย์ที่ถือ">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[3, 4, 5, 6, 7, 8, 9].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    Top {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">SMA (เดือน)</Label>
            <Select value={String(cfg.smaMonths)} onValueChange={(v) => onChange({ smaMonths: Number(v) })}>
              <SelectTrigger className={selCls} aria-label="ความยาว SMA">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[8, 10, 12].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    SMA {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">Momentum</Label>
            <Select value={String(cfg.skipMonths)} onValueChange={(v) => onChange({ skipMonths: Number(v) })}>
              <SelectTrigger className={selCls} aria-label="รูปแบบโมเมนตัม">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">1/3/6/12</SelectItem>
                <SelectItem value="1">12-1 (ตัดเดือนล่าสุด)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">เงินสดพักที่</Label>
            <Select value={cfg.cashMode} onValueChange={(v) => onChange({ cashMode: v as GtaaConfig["cashMode"] })}>
              <SelectTrigger className={selCls} aria-label="โหมดเงินสด">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tbill">T-Bill (BIL)</SelectItem>
                <SelectItem value="trendedBond">บอนด์มีเงื่อนไขเทรนด์</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">ต้นทุน (bps/เทิร์น)</Label>
            <Select value={String(cfg.costBps)} onValueChange={(v) => onChange({ costBps: Number(v) })}>
              <SelectTrigger className={selCls} aria-label="ต้นทุนต่อ turnover">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[0, 5, 10, 20, 30, 50].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n} bps
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">Tranches</Label>
            <Select value={String(cfg.tranches)} onValueChange={(v) => onChange({ tranches: Number(v) })}>
              <SelectTrigger className={selCls} aria-label="จำนวนงวดรีบาลานซ์">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n === 1 ? "ไม่แบ่ง" : `${n} งวดเหลื่อม`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button onClick={onRun} disabled={running} className="min-h-10 w-full gap-2 sm:w-auto">
          {running ? <RefreshCw className="size-4 animate-spin" aria-hidden /> : <Play className="size-4" aria-hidden />}
          {running ? "กำลังรัน harness…" : "รันวิเคราะห์ (backtest + harness ทั้งชุด)"}
        </Button>
        <div className="flex items-center gap-2">
          <Checkbox id="gtaa-persist" checked={persist} onCheckedChange={(v) => onPersistChange(v === true)} aria-label="บันทึกลง tracking log" />
          <Label htmlFor="gtaa-persist" className="text-xs leading-5 text-muted-foreground">
            บันทึกลง tracking log (config นี้ + สัญญาณเดือนนี้)
          </Label>
        </div>
      </CardContent>
    </Card>
  )
}

/* ---------- แท็บหลัก ---------- */

export default function GtaaTab() {
  const { data: ov, loading, error, refetch } = useApi<GtaaOverview>("/api/gtaa/overview")
  const hist = useApi<GtaaHistoryResponse>("/api/gtaa/history")
  const [cfg, setCfg] = useState<GtaaConfig | null>(null)
  const [runRes, setRunRes] = useState<GtaaRunResponse | null>(null)
  const [running, setRunning] = useState(false)
  const [runErr, setRunErr] = useState<string | null>(null)
  const [persist, setPersist] = useState(false)

  useEffect(() => {
    if (ov && !cfg) setCfg(ov.config)
  }, [ov, cfg])

  const activeRun = runRes?.run ?? ov?.run ?? null
  const activeCfg = cfg ?? ov?.config ?? null
  const isReal = ov ? ov.source.source !== "synthetic" : false

  const runAnalysis = async () => {
    if (!cfg) return
    setRunning(true)
    setRunErr(null)
    try {
      const res = await postJson<GtaaRunResponse>("/api/gtaa/run", {
        config: cfg,
        sensitivity: true,
        walkforward: true,
        montecarlo: { seeds: 300 },
        persist,
      })
      setRunRes(res)
      if (res.runId) hist.refetch()
    } catch (e) {
      setRunErr(e instanceof Error ? e.message : String(e))
    } finally {
      setRunning(false)
    }
  }

  if (loading && !ov) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
        <Skeleton className="h-80 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (error && !ov) {
    return (
      <Alert variant="destructive">
        <AlertTitle>โหลดโมดูล GTAA ไม่สำเร็จ</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }

  if (!ov || !activeRun || !activeCfg) return null

  const stats = activeRun.stats
  const bench = activeRun.benchStats

  const exportSignalsCsv = () => {
    const rows: (string | number | null | undefined | boolean)[][] = [
      ["ticker", "name", "group", "close", "sma", "trendPass", "r1", "r3", "r6", "r12", "score", "rank", "weight", "status"],
      ...activeRun.lastSignals.map((s) => [s.ticker, s.name, s.group, s.close, s.sma, s.trendPass, s.r1, s.r3, s.r6, s.r12, s.score, s.rank, s.weight, s.status] as (string | number | null | undefined | boolean)[]),
    ]
    downloadCsv(`gtaa-signals-${activeRun.lastDecisionMonth}.csv`, rows)
  }

  const exportEquityCsv = () => {
    const rows: (string | number | null | undefined | boolean)[][] = [
      ["month", "strategy", "benchmark", "ddStrategy", "ddBenchmark"],
      ...activeRun.equity.map((p) => [p.month, p.strategy, p.benchmark, p.ddStrategy, p.ddBenchmark]),
    ]
    downloadCsv("gtaa-equity.csv", rows)
  }

  const savedThisMonth = (hist.data?.signals ?? []).filter((s) => s.decisionMonth === activeRun.lastDecisionMonth)
  const autoItems = [
    {
      label: "ข้อมูลอัปเดตถึงรอบล่าสุด",
      done: ov.macro.staleMonths === 0 && isReal,
      detail: isReal
        ? `ถึงเดือน ${ov.macro.asOfMonth}${ov.macro.staleMonths > 0 ? ` · เกิน ${ov.macro.staleMonths} รอบ` : ""}`
        : "ยังใช้ข้อมูลสังเคราะห์",
    },
    {
      label: "บันทึก snapshot เดือนนี้ลง tracking log แล้ว",
      done: savedThisMonth.length > 0,
      detail: savedThisMonth.length > 0 ? `บันทึกแล้ว ${savedThisMonth.length} config` : "ยังไม่ได้บันทึก",
    },
    {
      label: "Quality gate PASS",
      done: ov.quality?.ok === true,
      detail: ov.quality ? (ov.quality.ok ? "ผ่าน" : `${ov.quality.issues.length} issues`) : "ข้อมูลไม่ได้มาจากไฟล์",
    },
    {
      label: "Self-test ผ่านทั้งหมด",
      done: ov.selfTestPass === ov.selfTestTotal,
      detail: `${ov.selfTestPass}/${ov.selfTestTotal}`,
    },
  ]

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="min-w-0">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <CardTitle className="flex flex-wrap items-center gap-2">
                <Globe2 className="size-4 text-neon-cyan" aria-hidden />
                GTAA Rotation — Faber Aggressive (Top N)
                <Badge
                  variant="outline"
                  className={cn(
                    isReal ? "border-neon-green/35 bg-neon-green/10 text-neon-green" : "border-neon-amber/35 bg-neon-amber/10 text-neon-amber",
                  )}
                >
                  {isReal ? `ข้อมูลจริง · ${ov.source.source}` : "SYNTHETIC"}
                </Badge>
              </CardTitle>
              <CardDescription className="mt-1.5 leading-5">
                ปรับใช้เอนจินจากงานวิจัย Mebane T. Faber — &ldquo;A Quantitative Approach to Tactical Asset Allocation&rdquo; (2007, อัปเดต 2013):
                ทุกสิ้นเดือน กรองด้วยเส้น SMA {activeCfg.smaMonths} เดือน (หลุดเส้น = เตะไปเงินสด ไม่สนข่าว) → จัดอันดับโมเมนตัม 1/3/6/12 เดือน → ถือ Top {activeCfg.topN} แบบเท่ากัน · พร้อม
                harness ความน่าเชื่อถือครบชุด (walk-forward · Monte Carlo · self-test)
              </CardDescription>
            </div>
            <div className="flex shrink-0 flex-wrap gap-1.5">
              <Badge variant="outline" className="border-border bg-foreground/[0.03] font-mono text-[10px]">
                {activeRun.startMonth} → {activeRun.endMonth}
              </Badge>
              <Badge variant="outline" className={cn("font-mono text-[10px]", ov.selfTestPass === ov.selfTestTotal ? "border-neon-green/35 bg-neon-green/10 text-neon-green" : "border-neon-rose/35 bg-neon-rose/10 text-neon-rose")}>
                self-test {ov.selfTestPass}/{ov.selfTestTotal}
              </Badge>
              <Badge
                variant="outline"
                title={ov.readiness.reasons.join(" · ")}
                className={cn(
                  "font-mono text-[10px]",
                  ov.readiness.level === "certified" && "border-neon-green/35 bg-neon-green/10 text-neon-green",
                  ov.readiness.level === "verified" && "border-neon-cyan/35 bg-neon-cyan/10 text-neon-cyan",
                  ov.readiness.level === "experimental" && "border-neon-amber/35 bg-neon-amber/10 text-neon-amber",
                )}
              >
                {ov.readiness.level.toUpperCase()}
              </Badge>
            </div>
          </div>
          {/* macro strip — สถานะมหภาคล่าสุดจาก engine (เชื่อมข้ามระบบ) */}
          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2 text-[11px]">
            <Badge
              variant="outline"
              className={cn(
                "font-mono text-[10px]",
                ov.macro.stance === "risk_on" && "border-neon-green/35 bg-neon-green/10 text-neon-green",
                ov.macro.stance === "caution" && "border-neon-amber/35 bg-neon-amber/10 text-neon-amber",
                ov.macro.stance === "risk_off" && "border-neon-rose/35 bg-neon-rose/10 text-neon-rose",
              )}
            >
              {ov.macro.stance === "risk_on" ? "🟢 risk_on" : ov.macro.stance === "caution" ? "🟡 caution" : "🔴 risk_off"}
            </Badge>
            <span className="min-w-0 text-muted-foreground">
              เงินสด <span className="font-mono font-semibold text-foreground">{(ov.macro.cashPct * 100).toFixed(1)}%</span> ({ov.macro.cashTicker})
            </span>
            {ov.macro.benchGapPct !== null ? (
              <span className={cn("min-w-0 font-mono", ov.macro.benchPass ? "text-neon-green" : "text-neon-rose")}>
                {ov.macro.benchPass ? `SPY เหนือเส้น +${ov.macro.benchGapPct.toFixed(1)}%` : `SPY หลุดเส้น ${ov.macro.benchGapPct.toFixed(1)}%`}
              </span>
            ) : null}
            <span className="min-w-0 text-muted-foreground">
              สอบตก <span className="font-mono">{ov.macro.failed.length}/{ov.macro.universeCount}</span>
            </span>
            <span className="min-w-0 truncate text-muted-foreground">
              รอบถัดไป: ตัดสินใจปิดเดือน <span className="font-mono">{ov.macro.nextDecisionMonth}</span>
            </span>
          </div>
          {!isReal && (
            <div className="mt-1 rounded-md border border-neon-amber/30 bg-neon-amber/[0.06] px-3 py-2 text-[11px] leading-4 text-neon-amber">
              ⚠ กำลังแสดงข้อมูลสังเคราะห์ — {ov.fetchNote}
            </div>
          )}
          {ov.macro.source !== "synthetic" && ov.macro.staleMonths > 0 && (
            <div className="mt-1 rounded-md border border-neon-amber/30 bg-neon-amber/[0.06] px-3 py-2 text-[11px] leading-4 text-neon-amber">
              ข้อมูลถึงเดือน {ov.macro.asOfMonth} — เลยรอบรีบาลานซ์แล้ว {ov.macro.staleMonths} รอบ · รอบถัดไปควรตัดสินใจที่ปิดเดือน {ov.macro.nextDecisionMonth} · กด &ldquo;ดึงข้อมูลจริง&rdquo; ที่การ์ดชั้นข้อมูลด้านล่างก่อนตัดสินใจ
            </div>
          )}
        </CardHeader>
      </Card>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label="CAGR (กลยุทธ์)" value={pct(stats.cagr)} sub={`SPY ${pct(bench.cagr)}`} tone={stats.cagr >= bench.cagr ? "good" : "neutral"} />
        <StatTile label="MaxDD (กลยุทธ์)" value={pct(stats.maxDD)} sub={`SPY ${pct(bench.maxDD)}`} tone={stats.maxDD > bench.maxDD ? "good" : "neutral"} />
        <StatTile label="Sharpe (กลยุทธ์)" value={stats.sharpe.toFixed(2)} sub={`SPY ${bench.sharpe.toFixed(2)}`} tone={stats.sharpe >= bench.sharpe ? "good" : "neutral"} />
        <StatTile label="Vol ต่อปี" value={pct(stats.vol)} sub={`hit rate ${pct(stats.hitRate, 0)}`} />
        <StatTile label="Turnover" value={`${(stats.turnoverAnnual * 100).toFixed(0)}%/ปี`} sub={`ต้นทุน ${activeCfg.costBps} bps/เทิร์น`} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <CardTitle className="text-base">📈 Equity Curve — เริ่มที่ 100</CardTitle>
                <CardDescription>มูลค่าพอร์ตเทียบ SPY ถือตายตัว (รายเดือน, ต้นทุนรวมแล้ว)</CardDescription>
              </div>
              <Button size="sm" variant="outline" className="min-h-9 shrink-0 gap-1.5 border-border" onClick={exportEquityCsv}>
                <Download className="size-3.5" aria-hidden />
                ส่งออก
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <EquityChart data={activeRun.equity} />
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">📉 Drawdown</CardTitle>
            <CardDescription>
              หัวใจของกลยุทธ์นี้ไม่ใช่ &ldquo;ชนะทุกปี&rdquo; แต่คือ DD ตื้น — ออกไปเงินสดเมื่อเทรนด์แตก
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DrawdownChart data={activeRun.equity} />
          </CardContent>
        </Card>
      </div>

      {/* สัญญาณเดือนล่าสุด */}
      <Card className="min-w-0">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <CardTitle className="text-base">🎯 ตารางสัญญาณเดือนล่าสุด — พอร์ตเดือนหน้า</CardTitle>
              <CardDescription>
                PASS = ยืนเหนือ SMA · ถือ = Top {activeCfg.topN} ที่โมเมนตัมแรงสุด · สำรอง = ผ่านเทรนด์แต่คะแนนไม่ถึง · →เงินสด = สอบตกเทรนด์
              </CardDescription>
            </div>
            <Button size="sm" variant="outline" className="min-h-9 shrink-0 gap-1.5 border-border" onClick={exportSignalsCsv}>
              <Download className="size-3.5" aria-hidden />
              ส่งออก CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-0 sm:px-6">
          <SignalTable rows={activeRun.lastSignals} decisionMonth={activeRun.lastDecisionMonth} />
        </CardContent>
      </Card>

      {/* Config + harness */}
      <ConfigCard
        cfg={activeCfg}
        onChange={(patch) => setCfg({ ...activeCfg, ...patch })}
        onRun={() => void runAnalysis()}
        running={running}
        persist={persist}
        onPersistChange={setPersist}
      />

      {runErr && (
        <Alert variant="destructive">
          <AlertTitle>รันวิเคราะห์ไม่สำเร็จ</AlertTitle>
          <AlertDescription>{runErr}</AlertDescription>
        </Alert>
      )}

      {runRes && (
        <div className="space-y-4">
          {runRes.sensitivity.length > 0 && (
            <Card className="min-w-0">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">🔥 Sensitivity Grid — Top N × SMA</CardTitle>
                <CardDescription>ช่องไหนชนะ &ldquo;ทั้งกริด&rdquo; โดยไม่ต้องจูนคือช่องที่เชื่อถือได้ — ช่องที่ชนะแค่จุดเดียวคือ overfitting</CardDescription>
              </CardHeader>
              <CardContent>
                <SensitivityGrid cells={runRes.sensitivity} />
              </CardContent>
            </Card>
          )}
          {runRes.walkforward && (
            <Card className="min-w-0">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">🧭 Walk-Forward — พารามิเตอร์ robust หรือ fit อดีต?</CardTitle>
                <CardDescription>
                  เลือก config ที่ชนะ in-sample 5 ปี แล้ววัดผลเฉพาะ out-of-sample 1 ปีถัดไป เลื่อนหน้าต่างทีละปี — ถ้า Sharpe หายเกินครึ่งเมื่อออกจากข้อมูลที่ใช้เลือก = หยุดจูน
                </CardDescription>
              </CardHeader>
              <CardContent>
                <WalkForwardPanel wf={runRes.walkforward} />
              </CardContent>
            </Card>
          )}
          {runRes.montecarlo && (
            <Card className="min-w-0">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">🎲 Monte Carlo — แถบผลลัพธ์แทนตัวเลขเดี่ยว</CardTitle>
                <CardDescription>block bootstrap บนผลจริงของกลยุทธ์ + synthetic seeds (จักรวาลใหม่ทั้งชุด) — deterministic ต่อ seed ทุกรอบ</CardDescription>
              </CardHeader>
              <CardContent>
                <MonteCarloPanel mc={runRes.montecarlo} />
              </CardContent>
            </Card>
          )}
          <p className="text-right font-mono text-[10px] text-muted-foreground">harness รันเสร็จใน {runRes.runtimeMs}ms</p>
        </div>
      )}

      {/* Self-test */}
      <Card className="min-w-0">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">🔬 Engine Self-Test — เครื่องมือวัดความน่าเชื่อถือ</CardTitle>
          <CardDescription>
            ทุก invariant ตรวจ &ldquo;กฎถูกต้องหรือไม่&rdquo; แบบปิดรูป: ไม่มี look-ahead · SMA/12-1 ตรงคำตอบ · crash→cash · ต้นทุน monotonic ·
            น้ำหนักรวม 100% · walk-forward ไม่ทับ · MC deterministic · cash mode ถูกทาง — ถ้าข้อไหนแดงห้ามใช้ตัวเลขจากโมดูลนี้
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SelfTestList tests={ov.selfTests} />
        </CardContent>
      </Card>

      {/* Tracking Log — สัญญาณที่บันทึก + ผลตรวจย้อนหลัง */}
      <TrackingCard hist={hist.data} activeCfg={activeCfg} onSaved={() => hist.refetch()} />

      {/* Checklist + Data */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChecklistCard monthKey={activeRun.lastDecisionMonth} autoItems={autoItems} />
        <DataCard onChanged={() => { setRunRes(null); void refetch() }} />
      </div>
    </div>
  )
}
