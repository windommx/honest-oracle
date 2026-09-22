"use client"

import { useMemo, useState } from "react"
import { RefreshCw } from "lucide-react"
import {
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { useApi, fmtPct } from "@/hooks/use-api"
import type {
  RegimeResponse,
  StatsBucket,
  StatsResponse,
  TfStat,
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
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const TOOLTIP_STYLE = {
  backgroundColor: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 9,
  fontSize: 12,
  color: "#0f172a",
  boxShadow: "0 4px 12px rgba(16,24,40,0.08)",
} as const

const ZERO_BUCKET: StatsBucket = { n: 0, mean: 0, median: 0, winRate: 0 }

// รวมหลาย timeframe เป็น bucket เดียว (ถ่วงน้ำหนักด้วย n)
function aggregateBuckets(rows: TfStat[]): StatsBucket {
  const n = rows.reduce((s, r) => s + r.n, 0)
  if (!n) return ZERO_BUCKET
  const weighted = (pick: (r: TfStat) => number) =>
    rows.reduce((s, r) => s + pick(r) * r.n, 0) / n
  return {
    n,
    mean: weighted((r) => r.mean),
    median: weighted((r) => r.median),
    winRate: weighted((r) => r.winRate),
  }
}

function corrBadge(corr: number) {
  if (corr > 0.15) {
    return (
      <Badge
        variant="outline"
        className="border-neon-green/40 bg-neon-green/10 text-neon-green"
      >
        corr +{corr.toFixed(2)} — ซ้ำเยอะ = เทรนด์จริง (เหมาะถือยาว)
      </Badge>
    )
  }
  if (corr < -0.15) {
    return (
      <Badge
        variant="outline"
        className="border-neon-rose/40 bg-neon-rose/10 text-neon-rose"
      >
        corr {corr.toFixed(2)} — ซ้ำเยอะ = ปลายคลื่น (ระวัง)
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="text-muted-foreground">
      corr {corr.toFixed(2)} — ไม่ชัด
    </Badge>
  )
}

export default function AnalyticsTab() {
  const [hold, setHold] = useState(10)
  const stats = useApi<StatsResponse>(`/api/stats?hold=${hold}`)
  const regime = useApi<RegimeResponse>("/api/regime?days=250")

  const buckets = useMemo<
    { label: string; bucket: StatsBucket }[]
  >(() => {
    const byTf = stats.data?.byTf ?? []
    return [
      {
        label: "กลุ่มควบคุม (หุ้น liquid ทั้งหมด)",
        bucket: stats.data?.control ?? ZERO_BUCKET,
      },
      {
        label: "โผยาว 160-300 วัน",
        bucket: aggregateBuckets(byTf.filter((r) => r.tf >= 160)),
      },
      {
        label: "โผกลาง 40-80",
        bucket: aggregateBuckets(byTf.filter((r) => r.tf >= 40 && r.tf <= 80)),
      },
      {
        label: "โผสั้น 5-20",
        bucket: aggregateBuckets(byTf.filter((r) => r.tf >= 5 && r.tf <= 20)),
      },
    ]
  }, [stats.data])

  const sortedByTf = useMemo(
    () => [...(stats.data?.byTf ?? [])].sort((a, b) => a.tf - b.tf),
    [stats.data],
  )

  const bestTf = useMemo(() => {
    const rows = stats.data?.byTf ?? []
    if (!rows.length) return null
    return rows.reduce((a, b) => (b.mean > a.mean ? b : a)).tf
  }, [stats.data])

  const gradRows = useMemo(
    () =>
      [...(stats.data?.graduation ?? [])].sort(
        (a, b) => a.from - b.from || a.to - b.to,
      ),
    [stats.data],
  )

  const retryBtn = (onClick: () => void) => (
    <Button size="sm" variant="outline" onClick={onClick}>
      <RefreshCw className="size-3.5" /> ลองใหม่
    </Button>
  )

  return (
    <div className="space-y-6">
      {/* ── Header ────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight md:text-xl">
            สถิติเชิงลึก — ติดโผแล้วดีจริงไหม?
          </h2>
          <p className="text-sm text-muted-foreground">
            ผลตอบแทนล่วงหน้าหลังติดโผ {hold} วัน เทียบกับกลุ่มควบคุมและ timeframe
            อื่น ๆ
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">ถือต่อ</span>
          <Select value={String(hold)} onValueChange={(v) => setHold(Number(v))}>
            <SelectTrigger className="w-32" aria-label="ระยะเวลาถือ (วัน)">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[5, 10, 20].map((h) => (
                <SelectItem key={h} value={String(h)}>
                  {h} วัน
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── Stats (cards + table + graduation) ───────────────── */}
      {stats.error ? (
        <Alert variant="destructive">
          <AlertTitle>โหลดสถิติไม่สำเร็จ</AlertTitle>
          <AlertDescription className="flex items-center gap-3">
            <span>{stats.error}</span>
            {retryBtn(stats.refetch)}
          </AlertDescription>
        </Alert>
      ) : !stats.data ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28 w-full" />
            ))}
          </div>
          <Skeleton className="h-72 w-full" />
        </div>
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {buckets.map((b) => (
              <Card key={b.label}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {b.label}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold tabular-nums">
                    {fmtPct(b.bucket.mean, 2)}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    win {(b.bucket.winRate * 100).toFixed(0)}% · n={b.bucket.n}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Forward return by timeframe */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                ผลตอบแทนล่วงหน้าตาม timeframe (ติดโผ → อีก {hold} วัน)
              </CardTitle>
              <CardDescription>
                แถวสีเขียว = เฉลี่ยดีที่สุด · แถวควบคุม = หุ้น liquid ทั้งหมด
                (ไม่กรองติดโผ)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>timeframe</TableHead>
                    <TableHead className="text-right">n</TableHead>
                    <TableHead className="text-right">เฉลี่ย %</TableHead>
                    <TableHead className="text-right">มัธยฐาน %</TableHead>
                    <TableHead className="text-right">Win rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedByTf.map((r) => (
                    <TableRow
                      key={r.tf}
                      className={
                        r.tf === bestTf ? "bg-neon-green/5 text-neon-green" : undefined
                      }
                    >
                      <TableCell className="font-medium">{r.tf} วัน</TableCell>
                      <TableCell className="text-right tabular-nums">{r.n}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtPct(r.mean, 2)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtPct(r.median, 2)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {(r.winRate * 100).toFixed(1)}%
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="text-muted-foreground">
                    <TableCell className="font-medium">ควบคุม</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {stats.data.control.n}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtPct(stats.data.control.mean, 2)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtPct(stats.data.control.median, 2)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {(stats.data.control.winRate * 100).toFixed(1)}%
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Graduation */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Graduation — โผสั้นนำโผยาวไหม? (ภายใน 10 วันทำการ)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {gradRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">ไม่มีข้อมูล graduation</p>
              ) : (
                gradRows.map((g) => (
                  <div key={`${g.from}-${g.to}`} className="flex items-center gap-3">
                    <span className="w-40 shrink-0 text-sm">
                      โผ {g.from}วัน → โผ {g.to}วัน
                    </span>
                    <Progress
                      value={Math.min(100, Math.max(0, g.rate * 100))}
                      className="flex-1"
                    />
                    <span className="w-14 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                      {(g.rate * 100).toFixed(1)}%
                    </span>
                  </div>
                ))
              )}
              <p className="text-xs text-muted-foreground">
                อัตราสูง = สัญญาณซื้อต้นเทรนด์ที่ตามได้
              </p>
            </CardContent>
          </Card>
        </>
      )}

      {/* ── Regime: Overlap Ratio ─────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Overlap Ratio — ตัววัด Regime ตลาด
          </CardTitle>
          <CardDescription className="flex flex-wrap items-center gap-2">
            <span>
              สัดส่วนหุ้นที่ติดโผซ้ำ (z-score) เทียบกับผลตอบแทนตลาดล่วงหน้า 10 วัน —
              250 วันล่าสุด
            </span>
            {regime.data && corrBadge(regime.data.corr)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {regime.error ? (
            <Alert variant="destructive">
              <AlertTitle>โหลดข้อมูล regime ไม่สำเร็จ</AlertTitle>
              <AlertDescription className="flex items-center gap-3">
                <span>{regime.error}</span>
                {retryBtn(regime.refetch)}
              </AlertDescription>
            </Alert>
          ) : !regime.data ? (
            <Skeleton className="h-[300px] w-full" />
          ) : regime.data.series.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              ไม่มีข้อมูล regime — ลอง ingest ข้อมูลก่อน
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart
                data={regime.data.series}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <XAxis
                  dataKey="date"
                  tickFormatter={(v: string) => String(v).slice(5)}
                  minTickGap={40}
                  tick={{ fontSize: 11 }}
                />
                <YAxis width={44} tick={{ fontSize: 11 }} />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  width={44}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  labelStyle={{ color: "#64748b" }}
                  cursor={{ stroke: "rgba(100,116,139,0.35)", strokeDasharray: "3 3" }}
                />
                <Legend />
                <ReferenceLine
                  y={0}
                  yAxisId="right"
                  stroke="rgba(100,116,139,0.35)"
                  strokeDasharray="4 4"
                />
                <Line
                  dataKey="repeatZ"
                  stroke="#d97706"
                  dot={false}
                  name="repeat z-score"
                />
                <Line
                  dataKey="mktFwd10"
                  stroke="#059669"
                  dot={false}
                  name="ตลาดอีก 10 วัน (%)"
                  yAxisId="right"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
