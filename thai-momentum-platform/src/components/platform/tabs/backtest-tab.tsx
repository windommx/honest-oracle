"use client"

import { useMemo, useState } from "react"
import { Loader2 } from "lucide-react"
import {
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { useApi, postJson, fmtNum, fmtPct } from "@/hooks/use-api"
import type {
  BacktestListResponse,
  BacktestParams,
  BacktestResult,
  BacktestStats,
} from "@/lib/momentum/contracts"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

const TOOLTIP_STYLE = {
  backgroundColor: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  fontSize: 12,
  color: "#0f172a",
  boxShadow: "0 4px 10px rgba(16,24,40,0.08)",
} as const

const DEFAULTS: BacktestParams = {
  k: 3,
  hold: 10,
  stopPct: 0.1,
  maxPos: 10,
  costBps: 55,
  slipBps: 40,
}

function NumField({
  id,
  label,
  value,
  min,
  max,
  step = 1,
  fallback,
  onValue,
}: {
  id: string
  label: string
  value: number
  min?: number
  max?: number
  step?: number
  fallback: number
  onValue: (v: number) => void
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          const v = parseFloat(e.target.value)
          onValue(Number.isNaN(v) ? fallback : v)
        }}
      />
    </div>
  )
}

function StatCard({
  label,
  value,
  className,
}: {
  label: string
  value: string
  className?: string
}) {
  return (
    <Card className="gap-1 px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("text-lg font-bold tabular-nums", className)}>{value}</div>
    </Card>
  )
}

function verdictBadge(s: BacktestStats) {
  if (s.cagr > s.benchCagr && s.maxDD > -0.2) {
    return (
      <Badge
        variant="outline"
        className="border-neon-green/40 bg-neon-green/10 text-neon-green shadow-[0_1px_2px_rgba(16,24,40,0.06)]"
      >
        🟢 ชนะ benchmark — คุ้มศึกษาต่อ
      </Badge>
    )
  }
  if (s.cagr > s.benchCagr) {
    return (
      <Badge
        variant="outline"
        className="border-neon-amber/40 bg-neon-amber/10 text-neon-amber shadow-[0_1px_2px_rgba(16,24,40,0.06)]"
      >
        🟡 ชนะ benchmark แต่ DD เสี่ยง
      </Badge>
    )
  }
  return (
    <Badge
      variant="outline"
      className="border-neon-rose/40 bg-neon-rose/10 text-neon-rose shadow-[0_1px_2px_rgba(16,24,40,0.06)]"
    >
      🔴 แพ้ benchmark — อย่าใช้จริง
    </Badge>
  )
}

function fmtTime(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString("th-TH", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default function BacktestTab() {
  const [params, setParams] = useState<BacktestParams>(DEFAULTS)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<BacktestResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const runs = useApi<BacktestListResponse>("/api/backtest")

  const recentRuns = useMemo(() => {
    const list = runs.data?.runs ?? []
    return [...list]
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, 5)
  }, [runs.data])

  async function runBacktest() {
    setRunning(true)
    setError(null)
    try {
      const res = await postJson<BacktestResult>("/api/backtest", params)
      setResult(res)
      runs.refetch()
    } catch (e) {
      setError(e instanceof Error ? e.message : "รัน backtest ไม่สำเร็จ")
    } finally {
      setRunning(false)
    }
  }

  const s = result?.stats

  return (
    <div className="space-y-6">
      {/* ── กติกากลยุทธ์ ──────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>⚙️ กติกากลยุทธ์</CardTitle>
          <CardDescription>
            ซื้อหุ้นที่ติด ≥ k โผพร้อมกัน ถือตามกำหนด หรือจนโดน stop loss
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <NumField
              id="bt-k"
              label="ติด ≥ k โผ"
              min={1}
              max={7}
              value={params.k}
              fallback={DEFAULTS.k}
              onValue={(v) => setParams((p) => ({ ...p, k: Math.round(v) }))}
            />
            <NumField
              id="bt-hold"
              label="ถือ (วัน)"
              min={1}
              max={60}
              value={params.hold}
              fallback={DEFAULTS.hold}
              onValue={(v) => setParams((p) => ({ ...p, hold: Math.round(v) }))}
            />
            <NumField
              id="bt-stop"
              label="Stop loss (%)"
              step={1}
              value={Number((params.stopPct * 100).toFixed(2))}
              fallback={DEFAULTS.stopPct * 100}
              onValue={(v) => setParams((p) => ({ ...p, stopPct: v / 100 }))}
            />
            <NumField
              id="bt-maxpos"
              label="สถานะสูงสุด"
              min={1}
              max={30}
              value={params.maxPos}
              fallback={DEFAULTS.maxPos}
              onValue={(v) => setParams((p) => ({ ...p, maxPos: Math.round(v) }))}
            />
            <NumField
              id="bt-cost"
              label="ต้นทุน (bps/เที่ยว)"
              min={0}
              value={params.costBps}
              fallback={DEFAULTS.costBps}
              onValue={(v) => setParams((p) => ({ ...p, costBps: Math.round(v) }))}
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button onClick={runBacktest} disabled={running} className="min-w-44">
              {running ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <span aria-hidden>▶</span>
              )}
              {running ? "กำลังรัน..." : "รัน Backtest"}
            </Button>
            <p className="text-xs text-muted-foreground">
              ซื้อที่ราคาปิดวันถัดไปจากสัญญาณ (กัน look-ahead) · ต้นทุนหัก 2 ขา ·
              เทียบกับ benchmark เท่าทุนทั้งกระดาน
            </p>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertTitle>รัน Backtest ไม่สำเร็จ</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* ── ผลลัพธ์ ───────────────────────────────────────────── */}
      {result && s && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            {verdictBadge(s)}
            <span className="text-xs text-muted-foreground">
              k≥{result.params.k} · ถือ {result.params.hold} วัน · stop{" "}
              {(result.params.stopPct * 100).toFixed(0)}% · สูงสุด{" "}
              {result.params.maxPos} สถานะ · ต้นทุน {result.params.costBps} bps
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-6">
            <StatCard label="เทรดรวม" value={String(s.trades)} />
            <StatCard label="Win rate" value={`${(s.winRate * 100).toFixed(1)}%`} />
            <StatCard label="เฉลี่ย/เทรด" value={fmtPct(s.avgRet, 2)} />
            <StatCard label="CAGR" value={fmtPct(s.cagr * 100, 1)} />
            <StatCard
              label="MaxDD"
              value={fmtPct(s.maxDD * 100, 1)}
              className="text-neon-rose"
            />
            <StatCard label="Sharpe" value={fmtNum(s.sharpe, 2)} />
            <StatCard label="Exposure" value={`${(s.exposure * 100).toFixed(0)}%`} />
            <StatCard
              label="Stop / Time"
              value={`${(s.stopShare * 100).toFixed(0)}% / ${(s.timeShare * 100).toFixed(0)}%`}
            />
            <StatCard label="Benchmark CAGR" value={fmtPct(s.benchCagr * 100, 1)} />
          </div>

          {/* Equity curve */}
          <Card>
            <CardHeader>
              <CardTitle>📊 Equity Curve</CardTitle>
              <CardDescription>
                มูลค่าพอร์ต (1.00 = เริ่มต้น) เทียบกับ benchmark ถือทั้งกระดาน
              </CardDescription>
            </CardHeader>
            <CardContent>
              {result.equity.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  ไม่มีข้อมูล equity curve
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart
                    data={result.equity}
                    margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                  >
                    <XAxis
                      dataKey="date"
                      tickFormatter={(v: string) => String(v).slice(5)}
                      minTickGap={40}
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis
                      domain={["auto", "auto"]}
                      tickFormatter={(v: number) => `${((v - 1) * 100).toFixed(0)}%`}
                      width={52}
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      labelStyle={{ color: "#64748b" }}
                      cursor={{ stroke: "rgba(100,116,139,0.35)", strokeDasharray: "3 3" }}
                    />
                    <Legend />
                    <Line
                      dataKey="strategy"
                      stroke="#059669"
                      strokeWidth={2}
                      dot={false}
                      name="กลยุทธ์"
                    />
                    <Line
                      dataKey="benchmark"
                      stroke="#64748b"
                      strokeDasharray="5 5"
                      dot={false}
                      name="Benchmark"
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Trades */}
          <Card>
            <CardHeader>
              <CardTitle>🧾 เทรดล่าสุด ({result.trades.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {result.trades.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  ไม่มีเทรดในรอบนี้ — ลองลด k หรือยืดระยะถือ
                </p>
              ) : (
                <ScrollArea className="max-h-96 pr-3">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>หุ้น</TableHead>
                        <TableHead>เข้า</TableHead>
                        <TableHead>ออก</TableHead>
                        <TableHead className="text-right">ราคาเข้า → ออก</TableHead>
                        <TableHead className="text-right">ผลตอบแทน</TableHead>
                        <TableHead className="text-right">เหตุผล</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.trades.map((t, i) => (
                        <TableRow key={`${t.symbol}-${t.entryDate}-${i}`}>
                          <TableCell className="font-mono font-bold">
                            {t.symbol}
                          </TableCell>
                          <TableCell className="text-xs">{t.entryDate}</TableCell>
                          <TableCell className="text-xs">{t.exitDate}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {fmtNum(t.entryPx, 2)} → {fmtNum(t.exitPx, 2)}
                          </TableCell>
                          <TableCell
                            className={cn(
                              "text-right font-medium tabular-nums",
                              t.ret >= 0 ? "text-neon-green" : "text-neon-rose",
                            )}
                          >
                            {fmtPct(t.ret, 2)}
                          </TableCell>
                          <TableCell className="text-right">
                            {t.reason === "stop" ? (
                              <Badge
                                variant="outline"
                                className="border-neon-rose/40 text-neon-rose"
                              >
                                stop
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-muted-foreground">
                                time
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── ประวัติรอบรัน ─────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>🕘 รอบที่รันไปแล้ว</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {runs.error ? (
            <Alert variant="destructive">
              <AlertTitle>โหลดประวัติรอบรันไม่สำเร็จ</AlertTitle>
              <AlertDescription className="flex items-center gap-3">
                <span>{runs.error}</span>
                <Button size="sm" variant="outline" onClick={runs.refetch}>
                  ลองใหม่
                </Button>
              </AlertDescription>
            </Alert>
          ) : runs.loading && !runs.data ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-11 w-full" />
              ))}
            </div>
          ) : recentRuns.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              ยังไม่มีประวัติ — กด &quot;รัน Backtest&quot; เพื่อเริ่มรอบแรก
            </p>
          ) : (
            recentRuns.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2"
              >
                <span className="text-sm">
                  <span className="font-mono text-muted-foreground">#{r.id}</span>{" "}
                  ติด≥{r.params.k}โผ · ถือ{r.params.hold}d · stop
                  {(r.params.stopPct * 100).toFixed(0)}% · CAGR{" "}
                  {(r.stats.cagr * 100).toFixed(1)}% · {r.stats.trades} เทรด
                </span>
                <span className="text-xs text-muted-foreground">
                  {fmtTime(r.createdAt)}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
