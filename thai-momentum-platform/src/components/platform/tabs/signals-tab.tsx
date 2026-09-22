"use client"

import { Fragment, useMemo, useState } from "react"
import { Activity, RefreshCw } from "lucide-react"
import {
  Area,
  AreaChart,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts"
import { useApi } from "@/hooks/use-api"
import type { AbResponse, IcResponse, SignalsResponse } from "@/lib/momentum/contracts"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

const TOOLTIP_STYLE = {
  backgroundColor: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  fontSize: 12,
  color: "#0f172a",
  boxShadow: "0 4px 10px rgba(16,24,40,0.08)",
} as const

function labelBadge(label: SignalsResponse["label"]) {
  if (label === "risk_on")
    return <Badge className="border-neon-green/40 bg-neon-green/10 text-neon-green">🟢 risk_on</Badge>
  if (label === "risk_off")
    return <Badge className="border-neon-rose/40 bg-neon-rose/10 text-neon-rose">🔴 risk_off</Badge>
  return <Badge className="border-neon-amber/40 bg-neon-amber/10 text-neon-amber">🟡 neutral</Badge>
}

function verdictBadge(v: string) {
  if (v === "PROMOTE")
    return <Badge className="border-neon-green/40 bg-neon-green/15 text-neon-green shadow-[0_1px_2px_rgba(16,24,40,0.06)]">PROMOTE</Badge>
  if (v === "FLIP-CHECK")
    return <Badge className="border-neon-amber/40 bg-neon-amber/10 text-neon-amber">FLIP-CHECK</Badge>
  return <Badge variant="secondary">KILL</Badge>
}

// ---------- Breadth Heatmap: 60 วัน × [>MA20, >MA50, >MA200, thrust5] ----------
function BreadthHeatmap({ market }: { market: SignalsResponse["market"] }) {
  const rows = market.slice(-60)
  return (
    <div className="overflow-x-auto">
      <div className="grid gap-px bg-foreground/[0.06]" style={{ gridTemplateColumns: "72px repeat(4,1fr)", minWidth: 480 }}>
        <div className="bg-card px-2 py-1 text-[10px] text-muted-foreground">วันที่</div>
        {[">MA20", ">MA50", ">MA200", "thrust5"].map((h) => (
          <div key={h} className="bg-card px-2 py-1 text-[10px] text-muted-foreground">
            {h}
          </div>
        ))}
        {rows.map((d) => (
          <Fragment key={d.date}>
            <div className="bg-card px-2 py-0.5 font-mono text-[10px] text-muted-foreground">{d.date.slice(5)}</div>
            {[d.b20, d.b50, d.b200, 0.5 + d.thrust * 4].map((v, i) => (
              <div
                key={i}
                title={v.toFixed(2)}
                className={`h-4 ${v > 0.5 ? "bg-neon-green" : "bg-neon-rose"}`}
                style={{ opacity: 0.12 + 0.88 * Math.min(1, Math.abs(v - 0.5) * 2) }}
              />
            ))}
          </Fragment>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        เขียวเข้มทั้งแถว = bull regime · MA20 เขียวแต่ MA200 แดง = rally ใน bear (ระวัง) · ทุกคอลัมน์แดง = cash is
        king — breadth breakdown มักนำหน้า SET 1-3 วัน
      </p>
    </div>
  )
}

// ---------- MFD Scatter: x=priceRank y=flowRank — 4 quadrant ----------
function MfdScatter({ data }: { data: SignalsResponse["stockToday"] }) {
  const points = data.map((s) => ({
    ...s,
    x: s.priceRank,
    y: s.flowRank,
    fill:
      s.mfd > 0.45 ? "#e11d48" : s.mfd < -0.3 ? "#059669" : "#64748b",
  }))
  return (
    <div>
      <ResponsiveContainer width="100%" height={300}>
        <ScatterChart margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
          <XAxis
            type="number"
            dataKey="x"
            domain={[0, 1]}
            tick={{ fontSize: 10, fill: "#64748b" }}
            label={{ value: "Price momentum rank (ret20)", fontSize: 10, fill: "#64748b", position: "insideBottom", offset: -2 }}
          />
          <YAxis
            type="number"
            dataKey="y"
            domain={[0, 1]}
            tick={{ fontSize: 10, fill: "#64748b" }}
            label={{ value: "Money-flow rank", fontSize: 10, fill: "#64748b", angle: -90, position: "insideLeft" }}
          />
          <ZAxis range={[60, 60]} />
          <ReferenceLine x={0.5} stroke="rgba(100,116,139,0.35)" />
          <ReferenceLine y={0.5} stroke="rgba(100,116,139,0.35)" />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            content={({ payload }) => {
              const p = payload?.[0]?.payload as (typeof points)[0] | undefined
              if (!p) return null
              return (
                <div className="rounded-lg bg-popover p-2 font-mono text-xs">
                  <div className="font-bold">{p.symbol} · {p.sector}</div>
                  <div>mfd {p.mfd.toFixed(2)} · flowRank {p.flowRank.toFixed(2)}</div>
                  <div className="text-muted-foreground">secRank {p.sectorRank} · volPct {(p.symVolPct * 100).toFixed(0)}%</div>
                  {p.mfd > 0.45 && <div className="text-neon-rose">⚠ distribution — block</div>}
                  {p.mfd < -0.3 && <div className="text-neon-green">✦ accumulation — boost (เมื่อผ่าน IC)</div>}
                </div>
              )
            }}
          />
          <Scatter data={points} fill="#64748b" shape="circle" />
        </ScatterChart>
      </ResponsiveContainer>
      <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-neon-rose" /> ขวา-ล่าง = distribution (block)</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-neon-green" /> ซ้าย-บน = accumulation (boost เมื่อผ่าน IC)</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-500" /> ปกติ</span>
      </div>
    </div>
  )
}

// ---------- Sector Stream ----------
function SectorStream({ sectors }: { sectors: SignalsResponse["sectors"] }) {
  const data = useMemo(() => {
    if (sectors.length === 0) return []
    const dates = sectors[0].share.map((s) => s.date)
    return dates.map((d, i) => {
      const row: Record<string, string | number> = { date: d.slice(5) }
      for (const s of sectors) row[s.name] = (s.share[i]?.v ?? 0) * 100
      return row
    })
  }, [sectors])
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
        <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748b" }} interval={29} />
        <YAxis tickFormatter={(v: number) => `${v.toFixed(0)}%`} tick={{ fontSize: 10, fill: "#64748b" }} width={44} />
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => `${Number(v).toFixed(1)}%`} />
        <Legend wrapperStyle={{ fontSize: 10 }} />
        {sectors.map((s, i) => (
          <Area
            key={s.name}
            type="monotone"
            dataKey={s.name}
            stackId="1"
            stroke={`hsl(${i * 47} 60% 55%)`}
            fill={`hsl(${i * 47} 60% 40% / .5)`}
            isAnimationActive={false}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  )
}

export default function SignalsTab() {
  const [hold, setHold] = useState("10")
  const sig = useApi<SignalsResponse>("/api/signals")
  const ic = useApi<IcResponse>(`/api/signals/ic?hold=${hold}`)
  const ab = useApi<AbResponse>("/api/signals/ab")

  if (sig.error)
    return (
      <Alert variant="destructive">
        <AlertDescription>{sig.error}</AlertDescription>
      </Alert>
    )
  if (sig.loading || !sig.data) return <Skeleton className="h-96 w-full" />

  const d = sig.data
  const last = d.market[d.market.length - 1]
  const topSectors = [...d.sectors].sort((a, b) => a.rank - b.rank)
  const icKeys = ic.data ? Object.keys(ic.data.ic) : []
  const timingKeys = ic.data ? Object.keys(ic.data.timing) : []

  return (
    <div className="grid gap-4">
      {/* ---------- Regime Composite ---------- */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4 text-neon-green" aria-hidden /> Regime Composite — สัญญาณระดับตลาด
          </CardTitle>
          <CardDescription>
            0.35·breadthZ + 0.25·crossZ + 0.20·(1−2·volPct) + 0.20·overlapZ → gross budget ไหลต่อเนื่องแทน binary
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-4">
          {labelBadge(d.label)}
          <div className="font-mono text-3xl font-bold">{last.regimeScore.toFixed(2)}</div>
          <Badge variant="outline" className="font-mono">
            gross ×{last.grossMult.toFixed(2)}
          </Badge>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 font-mono text-xs text-muted-foreground sm:grid-cols-4">
            <span>breadthZ {last.breadthZ.toFixed(2)}</span>
            <span>crossZ {last.crossZ.toFixed(2)}</span>
            <span>volPct {last.volPct.toFixed(2)}</span>
            <span>overlapZ {last.overlapZ.toFixed(2)}</span>
            <span>&gt;MA20 {(last.b20 * 100).toFixed(0)}%</span>
            <span>&gt;MA50 {(last.b50 * 100).toFixed(0)}%</span>
            <span>&gt;MA200 {(last.b200 * 100).toFixed(0)}%</span>
            <span>thrust5 {last.thrust.toFixed(3)}</span>
          </div>
          {d.policy && (
            <Badge variant={d.policy.v2 ? "default" : "secondary"} className={d.policy.v2 ? "bg-neon-green/20 text-neon-green" : ""}>
              policy: {d.policy.v2 ? `alpha ON [${d.policy.promoted.join(",")}]` : "alpha OFF"} · น้ำหนัก{" "}
              {Object.entries(d.policy.weights)
                .filter(([, v]) => v > 0)
                .map(([k, v]) => `${k}=${v.toFixed(2)}`)
                .join(" ") || "—"}
            </Badge>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ---------- MFD Scatter ---------- */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">💸 Money Flow Divergence (วันล่าสุด {d.latest})</CardTitle>
            <CardDescription>
              MFD = rank(ราคา) − rank(เงินไหล) — distribution นำราคาลง 2-4 สัปดาห์ / accumulation นำราคาขึ้น
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MfdScatter data={d.stockToday} />
          </CardContent>
        </Card>

        {/* ---------- Sector Stream ---------- */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">🌊 Sector Rotation (share20, 180 วัน)</CardTitle>
            <CardDescription>
              วันนี้: {topSectors.slice(0, 3).map((s) => `${s.name} (#${s.rank})`).join(" · ")} แรงสุด ·{" "}
              {topSectors.slice(-2).map((s) => `${s.name} (#${s.rank})`).join(" · ")} ท้ายสุด — ห้ามซื้อหุ้น sector ท้าย 2
              ที่เงินไหลออก
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SectorStream sectors={d.sectors} />
          </CardContent>
        </Card>
      </div>

      {/* ---------- Breadth Heatmap ---------- */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">🌡️ Market Breadth Heatmap (60 วัน)</CardTitle>
        </CardHeader>
        <CardContent>
          <BreadthHeatmap market={d.market} />
        </CardContent>
      </Card>

      {/* ---------- IC Report ---------- */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
            <span>🔬 Signal IC Report — สอบสัญญาณก่อนให้สิทธิ์ออกเสียง</span>
            <span className="flex items-center gap-2">
              <Select value={hold} onValueChange={setHold}>
                <SelectTrigger className="h-8 w-[110px]" aria-label="hold period">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["5", "8", "10", "20", "40"].map((h) => (
                    <SelectItem key={h} value={h}>
                      hold {h}d
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" onClick={ic.refetch} disabled={ic.loading}>
                <RefreshCw className={`mr-1 h-3.5 w-3.5 ${ic.loading ? "animate-spin" : ""}`} aria-hidden /> สอบใหม่
              </Button>
            </span>
          </CardTitle>
          <CardDescription>
            เกณฑ์ (pre-registered): |meanIC|&gt;0.02 · |ICIR|&gt;0.25 · n≥120 · เครื่องหมายตรง → PROMOTE | ตัวไหน KILL
            = น้ำหนัก 0 ไม่มีสิทธิ์ออกเสียง — ผลบันทึกเป็น Decision Q_SIGNAL/policy อัตโนมัติ
          </CardDescription>
        </CardHeader>
        <CardContent>
          {ic.error && (
            <Alert variant="destructive" className="mb-3">
              <AlertDescription>{ic.error}</AlertDescription>
            </Alert>
          )}
          {ic.loading || !ic.data ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>signal</TableHead>
                      <TableHead>meanIC</TableHead>
                      <TableHead>ICIR</TableHead>
                      <TableHead>t</TableHead>
                      <TableHead>n</TableHead>
                      <TableHead>hit</TableHead>
                      <TableHead>verdict</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {icKeys.map((k) => {
                      const v = ic.data!.ic[k]
                      return (
                        <TableRow key={k}>
                          <TableCell className="font-mono">{k}</TableCell>
                          <TableCell className="font-mono">{v.meanIC.toFixed(3)}</TableCell>
                          <TableCell className="font-mono">{v.ICIR.toFixed(2)}</TableCell>
                          <TableCell className="font-mono">{v.t.toFixed(1)}</TableCell>
                          <TableCell className="font-mono">{v.n}</TableCell>
                          <TableCell className="font-mono">{v.hit.toFixed(2)}</TableCell>
                          <TableCell>{verdictBadge(ic.data!.verdicts[k])}</TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
              <p className="mt-3 mb-1 text-xs text-muted-foreground">
                สัญญาณระดับตลาด สอบด้วย timing correlation (ไม่ใช่ cross-sectional IC):
              </p>
              <div className="flex flex-wrap gap-2">
                {timingKeys.map((k) => {
                  const v = ic.data!.timing[k]
                  const use = ic.data!.timingVerdicts[k] === "USE"
                  return (
                    <Badge key={k} variant={use ? "default" : "secondary"} className={use ? "bg-neon-green/20 text-neon-green" : ""}>
                      {k}: corr {v.corr >= 0 ? "+" : ""}
                      {v.corr.toFixed(3)} (n={v.n}) {use ? "USE" : "KILL"}
                    </Badge>
                  )
                })}
              </div>
              {ic.data.policySaved && (
                <p className="mt-3 text-xs text-neon-green">
                  ✓ บันทึก policy แล้ว — Jev จะใช้น้ำหนักนี้ในรอบถัดไป (alpha เปิดเมื่อมีตัว PROMOTE)
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ---------- A/B Shadow ---------- */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">⚖️ A/B Shadow — กฎเดิม (lite) vs กฎใหม่ (lite+v2)</CardTitle>
          <CardDescription>{ab.data?.message ?? "กติกาโปรโมท: paired n≥100 และ meanDiff > 0 หลัง cost 55bps"}</CardDescription>
        </CardHeader>
        <CardContent>
          {!ab.data || ab.loading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { title: "ถัง v1 (กฎเดิม)", b: ab.data.v1 },
                { title: "ถัง v2 (shadow)", b: ab.data.v2 },
              ].map(({ title, b }) => (
                <div key={title} className="rounded-lg border border-border/60 p-3">
                  <div className="text-xs text-muted-foreground">{title}</div>
                  {b ? (
                    <div className="mt-1 font-mono text-sm">
                      n={b.n} · win {(b.winRate * 100).toFixed(1)}% · avg {b.meanRet >= 0 ? "+" : ""}
                      {b.meanRet.toFixed(2)}%
                    </div>
                  ) : (
                    <div className="mt-1 text-sm text-muted-foreground">ยังไม่มีข้อมูล</div>
                  )}
                </div>
              ))}
              <div className="rounded-lg border border-neon-green/40 bg-neon-green/5 p-3">
                <div className="text-xs text-muted-foreground">Paired diff (v2 − v1)</div>
                <div className="mt-1 font-mono text-sm">
                  n={ab.data.paired.n}/100 · {ab.data.paired.meanDiff >= 0 ? "+" : ""}
                  {ab.data.paired.meanDiff.toFixed(2)}% · winΔ {(ab.data.paired.winRateDiff * 100).toFixed(1)}pp
                </div>
                <Badge className={ab.data.readyToPromote ? "mt-2 bg-neon-green/20 text-neon-green" : "mt-2"} variant={ab.data.readyToPromote ? "default" : "secondary"}>
                  {ab.data.readyToPromote ? "ผ่านเกณฑ์ → โปรโมท V2" : "รอสะสมผล"}
                </Badge>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
