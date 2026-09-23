"use client"

import { useMemo, useState } from "react"
import { RefreshCw, ShieldAlert, ShieldCheck, TriangleAlert } from "lucide-react"
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { fmtPct, useApi } from "@/hooks/use-api"
import type { StopBucket, StopMode, StopsResponse } from "@/lib/momentum/contracts"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

const TOOLTIP_STYLE = {
  backgroundColor: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  fontSize: 12,
  color: "#0f172a",
  boxShadow: "0 4px 10px rgba(16,24,40,0.08)",
} as const

const BUCKET_LABEL: Record<StopBucket, string> = {
  pooled: "รวมทั้งหมด",
  auto: "อัตโนมัติ",
  human: "มนุษย์อนุมัติ",
}

const METHOD_FOOTNOTE =
  "T = 1 obs/เทรด (คมแต่บาง) · R = ทุกบาร์ระหว่างถือ (หนา ใช้ bin 1.5%) · recency weight 0.995^วัน · embargo 10 วัน · refit ทุก 60 วันทำการ"

const pct = (v: number | null | undefined, digits = 1) =>
  v === null || v === undefined || !isFinite(v) ? "—" : `${(v * 100).toFixed(digits)}%`

// หา index ของ bin ที่มี s* (bin สุดท้ายที่ขอบล่าง ≤ sOpt)
function indexOfSOpt(bins: number[], sOpt: number | null): number {
  if (sOpt === null) return -1
  let idx = -1
  for (let i = 0; i < bins.length; i++) {
    if (bins[i] <= sOpt) idx = i
    else break
  }
  return idx
}

// ตำแหน่ง x ของจุด = bin ของ dd ปัจจุบันบน posterior "ที่กำลังแสดง" — p.bin จาก server เป็น index ของ
// posterior ตาม policy mode (T bin 1% / R bin 1.5%) ใช้ข้าม mode ไม่ได้
function xOfDd(dNow: number, bins: number[], bin: number): number {
  const i = Math.min(bins.length - 1, Math.max(0, Math.floor(Math.max(0, dNow) / bin)))
  return bins[i] ?? 0
}

export default function StopsTab() {
  const [bucket, setBucket] = useState<StopBucket>("pooled")
  // mode = ค่าที่ผู้ใช้เลือก (override) — ถ้ายังไม่แตะ default ตาม policy arm ของระบบ
  const [modeOverride, setModeOverride] = useState<StopMode | null>(null)
  const { data, error, loading, refetch } = useApi<StopsResponse>(`/api/stops?bucket=${bucket}`)
  const mode: StopMode = modeOverride ?? (data?.policy.arm === "bayesR" ? "R" : "T")

  const post = data ? (mode === "R" ? data.posteriorR : data.posteriorT) : null

  // ---------- ข้อมูลกราฟ posterior ----------
  const hist = useMemo(() => {
    if (!post) return []
    return post.bins.map((b, i) => ({
      x: b,
      histW: post.histW[i] ?? 0,
      histL: post.histL[i] ?? 0,
      pL: post.pL[i] ?? null,
      evHold: post.evHold[i] ?? null,
    }))
  }, [post])

  const xTicks = useMemo(() => {
    if (!post || post.bins.length === 0) return []
    const step = Math.max(1, Math.ceil(post.bins.length / 8))
    const ticks = post.bins.filter((_, i) => i % step === 0)
    const last = post.bins[post.bins.length - 1]
    if (ticks[ticks.length - 1] !== last) ticks.push(last)
    return ticks
  }, [post])

  const sOptX = post ? post.bins[indexOfSOpt(post.bins, post.sOpt)] : null

  const exitedPoints = useMemo(() => {
    if (!data || !post) return []
    return data.positions.filter((p) => p.exitNow).map((p) => ({ x: xOfDd(p.dNow, post.bins, post.bin), y: 0 }))
  }, [data, post])

  const holdingPoints = useMemo(() => {
    if (!data || !post) return []
    return data.positions.filter((p) => !p.exitNow).map((p) => ({ x: xOfDd(p.dNow, post.bins, post.bin), y: 0 }))
  }, [data, post])

  const equity = data?.equityCurves ?? []
  const eqInterval = Math.max(0, Math.ceil(equity.length / 6) - 1)

  // evCurve[0] = "ไม่มี stop" (engine วางไว้ที่ maxDD) — แสดงเป็นเส้น baseline แยกแล้ว จึงไม่ใส่ในเส้นกราฟ
  // (ใส่แล้วเส้นจะลากย้อนจาก x=maxDD กลับมา x=bin แรก) · หน่วย: ทศนิยม → % (×100 ทั้ง s และ ev)
  const evData = useMemo(
    () =>
      post
        ? post.evCurve
            .slice(1)
            .map((p) => ({ s: Math.round(p.s * 10000) / 100, ev: Math.round(p.ev * 10000) / 100 }))
            .sort((a, b) => a.s - b.s)
        : [],
    [post],
  )

  // ---------- guard clauses ----------
  if (error)
    return (
      <div className="space-y-4">
        <HeaderControls bucket={bucket} setBucket={setBucket} loading={loading} onRefetch={refetch} />
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>โหลดข้อมูล Bayesian Stop ไม่สำเร็จ</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={refetch}>
              <RefreshCw aria-hidden /> ลองใหม่
            </Button>
            <span className="text-muted-foreground">(ถ้าเป็นข้อผิดพลาดจาก server ให้ตรวจ แท็บข้อมูล / restart server)</span>
          </AlertDescription>
        </Alert>
      </div>
    )
  if (loading || !data || !post) return <Skeleton className="h-96 w-full" />

  if (data.posteriorT.nTrades === 0)
    return (
      <div className="space-y-4">
        <HeaderControls bucket={bucket} setBucket={setBucket} loading={loading} onRefetch={refetch} />
        <Alert>
          <ShieldAlert />
          <AlertTitle>ยังไม่มีประวัติเทรดสำหรับสร้าง posterior</AlertTitle>
          <AlertDescription>
            <p>{data.message}</p>
            <p>
              แนะนำ: กดรัน seed ที่แท็บ <span className="font-semibold">ข้อมูล</span> เพื่อสร้างประวัติเทรดจำลอง
              (ฐานข้อมูลของ Bayesian stop engine) แล้วกลับมาที่แท็บนี้อีกครั้ง
            </p>
          </AlertDescription>
        </Alert>
      </div>
    )

  const adoptionPassed = data.adoption.passed
  const liveSOpt = data.policy.arm === "bayesR" ? data.posteriorR.sOpt : data.posteriorT.sOpt

  return (
    <div className="space-y-4">
      {/* ---------- ส่วนหัว + controls ---------- */}
      <HeaderControls bucket={bucket} setBucket={setBucket} loading={loading} onRefetch={refetch} />

      {/* ---------- 1. Adoption verdict banner ---------- */}
      {adoptionPassed ? (
        <Alert className="border-neon-green/40 bg-neon-green/10 text-neon-green [&>svg]:text-neon-green shadow-[0_1px_2px_rgba(16,24,40,0.06)]">
          <ShieldCheck />
          <AlertTitle>✅ รับ {data.adoption.winner} เป็น stop หลักของระบบ</AlertTitle>
          <AlertDescription className="text-neon-green/80">
            <p>{data.adoption.rule}</p>
            <p className="font-mono text-xs">
              ΔSharpe {data.adoption.sharpeDelta >= 0 ? "+" : ""}
              {data.adoption.sharpeDelta} · ΔMaxDD {data.adoption.maxDDDelta} · best bayes ={" "}
              {data.adoption.bestBayes}
            </p>
          </AlertDescription>
        </Alert>
      ) : (
        <Alert className="border-neon-amber/40 bg-neon-amber/10 text-neon-amber [&>svg]:text-neon-amber shadow-[0_1px_2px_rgba(16,24,40,0.06)]">
          <ShieldAlert />
          <AlertTitle>⛔ คง fixed −10% — bayes ยังไม่ผ่านกติกา</AlertTitle>
          <AlertDescription className="text-neon-amber/80">
            <p>{data.adoption.rule}</p>
            <p className="font-mono text-xs">
              ΔSharpe {data.adoption.sharpeDelta >= 0 ? "+" : ""}
              {data.adoption.sharpeDelta} · ΔMaxDD {data.adoption.maxDDDelta} · best bayes ={" "}
              {data.adoption.bestBayes}
            </p>
          </AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          className={
            data.policy.adopted
              ? "border-neon-green/40 bg-neon-green/10 text-neon-green"
              : "border-neon-amber/40 bg-neon-amber/10 text-neon-amber"
          }
        >
          policy: {data.policy.arm} · {data.policy.adopted ? "ใช้งาน" : "shadow"}
        </Badge>
        <span className="text-xs text-muted-foreground">{data.message}</span>
      </div>

      {/* ---------- 2. 3-Arm Walk-Forward A/B ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">⚔️ 3-Arm Walk-Forward A/B — fixed −10% vs bayesT vs bayesR</CardTitle>
          <CardDescription>
            จำลองเทรดแบบ walk-forward 3 แข่ง: แถวเขียว = arm ที่ชนะตามกติกา adoption · {METHOD_FOOTNOTE}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-2">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>arm</TableHead>
                  <TableHead className="text-right">stop</TableHead>
                  <TableHead className="text-right">avgRet</TableHead>
                  <TableHead className="text-right">win</TableHead>
                  <TableHead className="text-right">maxDD</TableHead>
                  <TableHead className="text-right">sharpe</TableHead>
                  <TableHead className="text-right">calmar</TableHead>
                  <TableHead className="text-right">stop%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.arms.map((arm) => {
                  const isWinner = arm.arm === data.adoption.winner
                  return (
                    <TableRow key={arm.arm} className={isWinner ? "bg-neon-green/10" : undefined}>
                      <TableCell className={isWinner ? "font-mono font-bold text-neon-green" : "font-mono"}>
                        {isWinner ? "🏆 " : ""}
                        {arm.label || arm.arm}
                      </TableCell>
                      <TableCell className="text-right font-mono">{pct(arm.stopNow)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtPct(arm.avgRet)}</TableCell>
                      <TableCell className="text-right font-mono">{pct(arm.winRate)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtPct(arm.maxDD * 100, 1)}</TableCell>
                      <TableCell className="text-right font-mono">{arm.sharpe.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono">{arm.calmar.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono">{pct(arm.stopShare, 0)}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
          <div className="min-w-0">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={equity} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
                <CartesianGrid stroke="rgba(100,116,139,0.18)" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  tickFormatter={(v: string) => String(v).slice(5)}
                  interval={eqInterval}
                />
                <YAxis
                  domain={["auto", "auto"]}
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  tickFormatter={(v: number) => `${((v - 1) * 100).toFixed(0)}%`}
                  width={44}
                />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => `${((Number(v) - 1) * 100).toFixed(1)}%`} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="fixed10" name="fixed −10%" stroke="#64748b" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="bayesT" name="bayes T" stroke="#059669" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="bayesR" name="bayes R" stroke="#d97706" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
            <p className="mt-1 text-center text-[11px] text-muted-foreground">
              equity สะสมหลังต้นทุน (round-trip {(data.costRT * 100).toFixed(1)}%) ของทั้ง 3 arm
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ---------- 3. Posterior Winners vs Losers ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
            <span>🎲 Posterior — Winners vs Losers บน drawdown (mode {mode})</span>
            <Tabs value={mode} onValueChange={(v) => setModeOverride(v as StopMode)}>
              <TabsList className="h-9">
                <TabsTrigger value="T" className="h-7 px-3 text-xs">
                  T · 1 obs/เทรด
                </TabsTrigger>
                <TabsTrigger value="R" className="h-7 px-3 text-xs">
                  R · ทุกบาร์
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </CardTitle>
          <CardDescription>
            แท่ง = density ของ MAE (winners เขียว / losers แดง) · เส้นส้ม = P(Loser|dd) · เส้นเทา = EV ถือต่อ · จุด = ตำแหน่งเปิดวันนี้บน curve · {METHOD_FOOTNOTE}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* สถิติสำคัญก่อนกราฟ */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { label: "เทรด (n)", value: post.nTrades.toLocaleString() },
              { label: "obs", value: post.nObs.toLocaleString() },
              { label: "P(win)", value: pct(post.pW) },
              { label: "s* (optimal stop)", value: pct(post.sOpt) },
              { label: "EV ที่ s*", value: fmtPct(post.evOpt === null ? null : post.evOpt * 100, 2) },
              { label: "EV baseline (ไม่มี stop)", value: fmtPct(post.evNoStop * 100, 2) },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border border-border/60 px-3 py-2">
                <div className="text-[11px] text-muted-foreground">{s.label}</div>
                <div className="font-mono text-sm font-bold">{s.value}</div>
              </div>
            ))}
          </div>
          {post.pooled && (
            <Alert className="border-neon-amber/40 bg-neon-amber/10 text-neon-amber">
              <TriangleAlert />
              <AlertDescription>
                {post.note ?? "เทรดในถังนี้ < 200 — ระบบ fallback ไปใช้ posterior รวม (pooled) กัน posterior บางเกินไป"}
              </AlertDescription>
            </Alert>
          )}
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={hist} margin={{ top: 12, right: 8, bottom: 4, left: 0 }}>
              <CartesianGrid stroke="rgba(100,116,139,0.18)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                type="number"
                dataKey="x"
                domain={[(post.bins[0] ?? 0) - post.bin / 2, (post.bins[post.bins.length - 1] ?? 0.3) + post.bin]}
                ticks={xTicks}
                tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
                tick={{ fontSize: 10, fill: "#64748b" }}
              />
              <YAxis
                yAxisId="left"
                domain={[0, 1]}
                tickFormatter={(v: number) => v.toFixed(1)}
                tick={{ fontSize: 10, fill: "#64748b" }}
                width={36}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                domain={[-0.1, 0.1]}
                ticks={[-0.1, -0.05, 0, 0.05, 0.1]}
                tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
                tick={{ fontSize: 10, fill: "#64748b" }}
                width={44}
              />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => Number(v).toFixed(3)} labelFormatter={(l: number) => `dd ${(l * 100).toFixed(1)}%`} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {sOptX !== null && (
                <ReferenceLine
                  yAxisId="left"
                  x={sOptX}
                  stroke="#059669"
                  strokeDasharray="4 4"
                  label={{ value: `s* = ${pct(post.sOpt)}`, position: "top", fill: "#059669", fontSize: 11 }}
                />
              )}
              <Bar yAxisId="left" dataKey="histW" name="Winners" fill="#059669" fillOpacity={0.55} barSize={12} isAnimationActive={false} />
              <Bar yAxisId="left" dataKey="histL" name="Losers" fill="#e11d48" fillOpacity={0.55} barSize={12} isAnimationActive={false} />
              {/* P(L|dd) เป็นความน่าจะเป็น 0..1 → แกนซ้าย (แกนขวา ±10% เป็นของ EV ถือต่อ) */}
              <Line yAxisId="left" type="monotone" dataKey="pL" name="P(L|dd)" stroke="#d97706" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line yAxisId="right" type="monotone" dataKey="evHold" name="EV ถือต่อ" stroke="#64748b" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              {exitedPoints.length > 0 && (
                <Scatter
                  yAxisId="right"
                  name="ตำแหน่งปัจจุบัน — EV≤0 → ออก"
                  data={exitedPoints}
                  dataKey="y"
                  fill="#e11d48"
                  isAnimationActive={false}
                />
              )}
              {holdingPoints.length > 0 && (
                <Scatter
                  yAxisId="right"
                  name="ตำแหน่งปัจจุบัน — ถือต่อ"
                  data={holdingPoints}
                  dataKey="y"
                  fill="#d97706"
                  isAnimationActive={false}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* ---------- 4. EV ของกลยุทธ์ที่ระดับ stop s ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">📈 EV ของกลยุทธ์ที่ระดับ stop s (mode {mode})</CardTitle>
          <CardDescription>
            s* = argmax E[R|s] — เลือก stop ที่ทำให้ผลตอบแทนคาดหวังสูงสุดจากสถิติของเราเอง
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={evData} margin={{ top: 12, right: 8, bottom: 4, left: 0 }}>
              <defs>
                <linearGradient id="stopEvFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#059669" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#059669" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(100,116,139,0.18)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                type="number"
                dataKey="s"
                domain={["dataMin", "dataMax"]}
                tickCount={8}
                tickFormatter={(v: number) => `${v.toFixed(0)}%`}
                tick={{ fontSize: 10, fill: "#64748b" }}
              />
              <YAxis
                tickFormatter={(v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`}
                tick={{ fontSize: 10, fill: "#64748b" }}
                width={48}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`}
                labelFormatter={(l: number) => `stop ที่ −${l.toFixed(1)}%`}
              />
              {post.sOpt !== null && (
                <ReferenceLine
                  x={Math.round(post.sOpt * 10000) / 100}
                  stroke="#059669"
                  strokeDasharray="4 4"
                  label={{ value: `s* = ${pct(post.sOpt)}`, position: "top", fill: "#059669", fontSize: 11 }}
                />
              )}
              <ReferenceLine
                y={Math.round(post.evNoStop * 10000) / 100}
                stroke="rgba(100,116,139,0.35)"
                strokeDasharray="6 4"
                label={{ value: "baseline ไม่มี stop", position: "insideTopRight", fill: "#64748b", fontSize: 10 }}
              />
              <Area
                type="monotone"
                dataKey="ev"
                name="E[R|s] (% ต่อเทรด)"
                stroke="#059669"
                strokeWidth={2}
                fill="url(#stopEvFill)"
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
          <p className="mt-2 text-xs text-muted-foreground">
            ตำแหน่งที่วาดกราฟอยู่ซ้ายของ s* = dd ยังไม่ลึกเกิน stop ที่ดีที่สุด — ถือต่อได้ ·
            ขวาของ s* = ควรตัดตาม s_live = 0.85 × s* (กัน noise)
          </p>
        </CardContent>
      </Card>

      {/* ---------- 5. ตำแหน่งเปิดบน curve ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">🎯 ตำแหน่งเปิดบน curve ({data.positions.length} ตำแหน่ง)</CardTitle>
          <CardDescription>
            ประเมินจาก posterior mode {data.policy.arm === "bayesR" ? "R" : "T"} ณ {data.latest} · P(L|dd) และ EV
            ถือต่อ คำนวณจาก bin ของ drawdown ปัจจุบัน
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.positions.length === 0 ? (
            <div className="flex h-20 items-center justify-center text-sm text-muted-foreground">ไม่มีสถานะเปิด</div>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>หุ้น</TableHead>
                    <TableHead>เข้า</TableHead>
                    <TableHead className="text-right">P&amp;L</TableHead>
                    <TableHead className="text-right">dd ปัจจุบัน</TableHead>
                    <TableHead className="text-right">P(L|dd)</TableHead>
                    <TableHead className="text-right">EV ถือต่อ</TableHead>
                    <TableHead>สถานะ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.positions.map((p) => (
                    <TableRow key={`${p.symbol}-${p.entryDate}`}>
                      <TableCell className="font-mono font-bold">{p.symbol}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{p.entryDate}</TableCell>
                      <TableCell className={`text-right font-mono ${p.pnlPct < 0 ? "text-neon-rose" : "text-neon-green"}`}>
                        {fmtPct(p.pnlPct)}
                      </TableCell>
                      <TableCell className="text-right font-mono">{pct(p.dNow)}</TableCell>
                      <TableCell className="text-right font-mono">{p.pL === null ? "—" : p.pL.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono">
                        {p.evHold === null ? "—" : fmtPct(p.evHold * 100, 2)}
                      </TableCell>
                      <TableCell>
                        {p.exitNow ? (
                          <Badge className="border-neon-rose/40 bg-neon-rose/10 text-neon-rose">EV≤0 → ออก</Badge>
                        ) : p.beyondOpt ? (
                          <Badge className="border-neon-amber/40 bg-neon-amber/10 text-neon-amber">เลย s_live</Badge>
                        ) : (
                          <Badge variant="secondary">ถือต่อ</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            s_live = 0.85 × s* ({liveSOpt !== null ? pct(liveSOpt * 0.85) : "—"}) — เขตกัน noise ก่อนตัดจริง
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

function HeaderControls({
  bucket,
  setBucket,
  loading,
  onRefetch,
}: {
  bucket: StopBucket
  setBucket: (b: StopBucket) => void
  loading: boolean
  onRefetch: () => void
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <ShieldAlert className="h-5 w-5 text-neon-green" aria-hidden />
          Bayes Stop — Stop-Loss เชิงเบย์ (Zambelli)
        </h2>
        <p className="text-xs text-muted-foreground">
          เรียนรู้จาก MAE ของเทรดจริง → posterior P(Loser|dd) → s* = argmax E[R|s] → แข่งกับ fixed −10% แบบ walk-forward
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Select value={bucket} onValueChange={(v) => setBucket(v as StopBucket)}>
          <SelectTrigger className="h-11 w-[180px]" aria-label="ถังประวัติเทรด">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(BUCKET_LABEL) as StopBucket[]).map((b) => (
              <SelectItem key={b} value={b}>
                {BUCKET_LABEL[b]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" className="h-11" onClick={onRefetch} disabled={loading}>
          <RefreshCw className={loading ? "animate-spin" : ""} aria-hidden />
          รีเฟรช
        </Button>
      </div>
    </div>
  )
}
