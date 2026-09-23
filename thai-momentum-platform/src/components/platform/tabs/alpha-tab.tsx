"use client"

import { useMemo, useState } from "react"
import { Layers, RefreshCw } from "lucide-react"
import { useApi } from "@/hooks/use-api"
import type { EnginesResponse, PairsResponse } from "@/lib/momentum/contracts"
import { ITM_PLAYBOOK_TH, resolveITM, syntheticVsDirect, type ItmPlaybook } from "@/lib/momentum/options"
import { condorPlan, vrpExit } from "@/lib/momentum/vrp"
import { calendarSignal } from "@/lib/momentum/arb/basis"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import ScrollBox from "../scroll-box"

function statusBadge(status: EnginesResponse["engines"][0]["status"]) {
  if (status === "ACTIVE")
    return <Badge className="border-neon-green/40 bg-neon-green/10 text-neon-green shadow-[0_1px_2px_rgba(16,24,40,0.06)]">ACTIVE</Badge>
  if (status === "SHADOW")
    return <Badge className="border-neon-amber/40 bg-neon-amber/10 text-neon-amber">SHADOW</Badge>
  return <Badge variant="secondary">STANDBY</Badge>
}

function actionBadge(a: PairsResponse["pairs"][0]["action"]) {
  if (a === "ENTER")
    return <Badge className="border-neon-green/40 bg-neon-green text-on-neon">ENTER</Badge>
  if (a === "STOP")
    return <Badge className="border-neon-rose/40 bg-neon-rose/10 text-neon-rose">STOP</Badge>
  if (a === "TAKE" || a === "TIME_EXIT")
    return <Badge className="border-neon-amber/40 bg-neon-amber/10 text-neon-amber">{a}</Badge>
  return <Badge variant="secondary">{a}</Badge>
}

// ---------- Pairs Stat-Arb ----------
function PairsCard() {
  const pairs = useApi<PairsResponse>("/api/arb/pairs")
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <span>🧲 Pairs Stat-Arb Scanner</span>
          <Button size="sm" variant="outline" onClick={pairs.refetch} disabled={pairs.loading}>
            <RefreshCw className={`mr-1 h-3.5 w-3.5 ${pairs.loading ? "animate-spin" : ""}`} aria-hidden /> สแกนใหม่
          </Button>
        </CardTitle>
        <CardDescription>
          same-sector · corr pre-filter → Engle-Granger β → OU half-life 3-40 วัน · สัญญาณ ENTER |z|&gt;2 / TAKE
          |z|&lt;0.5 / STOP |z|&gt;3.5 / TIME_EXIT &gt; 2×hl
        </CardDescription>
      </CardHeader>
      <CardContent>
        {pairs.error ? (
          <Alert variant="destructive">
            <AlertDescription>{pairs.error}</AlertDescription>
          </Alert>
        ) : pairs.loading || !pairs.data ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <>
            <p className="mb-2 text-xs text-muted-foreground">
              {pairs.data.message} · ต้นทุน {pairs.data.costPerLegBps}bps/ขา (รอบเต็ม 4 ขา) · เวลา {pairs.data.tookMs}ms
            </p>
            {pairs.data.pairs.length === 0 ? (
              <p className="text-sm text-muted-foreground">ไม่มีคู่ที่ผ่านเกณฑ์ — engine อยู่โหมดรอ ไม่บังคับเทรด</p>
            ) : (
              <ScrollBox className="max-h-96 overflow-y-auto rounded-lg border border-border/60" label="ตารางผลลัพธ์ (เลื่อนดูได้)">
                <Table>
                  <TableHeader className="sticky top-0 bg-card">
                    <TableRow>
                      <TableHead>คู่</TableHead>
                      <TableHead>sector</TableHead>
                      <TableHead>corr</TableHead>
                      <TableHead>β</TableHead>
                      <TableHead>hl (d)</TableHead>
                      <TableHead>z</TableHead>
                      <TableHead>signal</TableHead>
                      <TableHead>BT net</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pairs.data.pairs.map((p) => {
                      const bt = pairs.data!.backtest.find((b) => b.a === p.a && b.b === p.b)
                      return (
                        <TableRow key={`${p.a}/${p.b}`}>
                          <TableCell className="font-mono text-xs">
                            {p.a}/{p.b}
                          </TableCell>
                          <TableCell className="text-xs">{p.sector}</TableCell>
                          <TableCell className="font-mono text-xs">{p.corr.toFixed(2)}</TableCell>
                          <TableCell className="font-mono text-xs">{p.beta.toFixed(2)}</TableCell>
                          <TableCell className="font-mono text-xs">{p.hl.toFixed(0)}</TableCell>
                          <TableCell className="font-mono text-xs">
                            {p.z >= 0 ? "+" : ""}
                            {p.z.toFixed(2)}
                          </TableCell>
                          <TableCell>{actionBadge(p.action)}</TableCell>
                          <TableCell className="font-mono text-xs">
                            {bt && bt.trades > 0
                              ? `${bt.trades}รอบ ${bt.avgNet >= 0 ? "+" : ""}${bt.avgNet.toFixed(2)}%`
                              : "—"}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </ScrollBox>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ---------- Synthetic Long Futures calculator ----------
function SyntheticCard() {
  const [spot, setSpot] = useState(1350)
  const [strike, setStrike] = useState(1350)
  const [expiry, setExpiry] = useState(20)
  const [rf, setRf] = useState(2.2)
  const [q, setQ] = useState(2.5)
  const [cCall, setCCall] = useState(18)
  const [cPut, setCPut] = useState(14)
  const [lfComm, setLfComm] = useState(6)
  const [lfPnl, setLfPnl] = useState(0)

  const res = useMemo(
    () =>
      syntheticVsDirect({
        spot,
        strike,
        expiry,
        rf: rf / 100,
        divYield: q / 100,
        cost: {
          longCallPremium: cCall,
          shortPutPremium: cPut,
          callCommission: lfComm * 2, // เปิด 2 ขา options ≈ คอม 2 เท่าของ futures
          putCommission: 0,
          lfCloseCommission: lfComm,
          lfUnrealizedPnL: lfPnl,
        },
      }),
    [spot, strike, expiry, rf, q, cCall, cPut, lfComm, lfPnl]
  )

  const playbook: ItmPlaybook = resolveITM({
    callStrike: strike,
    spot,
    daysToExpiry: expiry,
    iv30: 0.35,
    futuresMaturityDays: Math.max(1, expiry - 12),
    hasSyntheticAvailable: true,
  })

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">🔁 Synthetic Long Futures vs ปิด Direct</CardTitle>
        <CardDescription>
          Long Call + Short Put ATM = payoff futures เป๊ะ — แก้ maturity mismatch โดยไม่ต้องเฝ้าตี 4-5 (ระวัง:
          margin ×2 · early exercise · pin risk · friction ×3 ขา)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(
            [
              ["Spot", spot, setSpot, 1],
              ["Strike", strike, setStrike, 1],
              ["หมดอายุ (วัน)", expiry, setExpiry, 1],
              ["r (%)", rf, setRf, 0.1],
              ["q ปันผล (%)", q, setQ, 0.1],
              ["Call premium", cCall, setCCall, 0.5],
              ["Put premium", cPut, setCPut, 0.5],
              ["คอม/ขา", lfComm, setLfComm, 0.5],
            ] as const
          ).map(([label, value, setter, step]) => (
            <label key={label} className="text-xs text-muted-foreground">
              {label}
              <Input
                type="number"
                step={step}
                value={value}
                onChange={(e) => setter(Number(e.target.value))}
                className="mt-0.5 h-8 font-mono text-sm"
              />
            </label>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <Badge className={res.preferred === "synthetic" ? "bg-neon-green text-on-neon" : ""}>
            เลือก: {res.preferred === "synthetic" ? "SYNTHETIC" : "DIRECT FUTURES"}
          </Badge>
          <Badge variant="outline" className="font-mono">
            edge {Number.isFinite(res.edgeBps) ? res.edgeBps.toFixed(1) : "—"} bps
          </Badge>
          {res.pinRiskZone && (
            <Badge className="border-neon-rose/40 bg-neon-rose/10 text-neon-rose">⚠ pin risk zone</Badge>
          )}
          <Badge variant="outline" className="font-mono">
            fair F = {res.fairFuture.toFixed(1)}
          </Badge>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Playbook covered-call ITM: <span className="text-foreground">{ITM_PLAYBOOK_TH[playbook]}</span>
        </p>
      </CardContent>
    </Card>
  )
}

// ---------- VRP Condor calculator ----------
function VrpCard() {
  const [S, setS] = useState(1350)
  const [iv, setIv] = useState(16)
  const [ivPct, setIvPct] = useState(65)
  const [dte, setDte] = useState(30)
  const [equity, setEquity] = useState(1000000)

  const plan = useMemo(
    () => condorPlan({ S, iv: iv / 100, ivPct: ivPct / 100, dte, riskPct: 0.01, equity }),
    [S, iv, ivPct, dte, equity]
  )
  const premium = Math.max(6, (S * (iv / 100) * Math.sqrt(dte / 365)) / 8)
  const exit = vrpExit(premium, premium * 0.72, 6)

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">🌋 VRP Iron Condor (defined-risk เท่านั้น)</CardTitle>
        <CardDescription>
          ห้ามขาย strangle เปล่า · risk/trade ≤ 1% equity · เปิดเมื่อ ivPct ≥ 0.45 · ไม่เปิดตอน risk_off
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {(
            [
              ["S50 index", S, setS, 1],
              ["IV (%)", iv, setIv, 0.5],
              ["IV percentile", ivPct, setIvPct, 1],
              ["DTE (วัน)", dte, setDte, 1],
              ["Equity (บาท)", equity, setEquity, 10000],
            ] as const
          ).map(([label, value, setter, step]) => (
            <label key={label} className="text-xs text-muted-foreground">
              {label}
              <Input
                type="number"
                step={step}
                value={value}
                onChange={(e) => setter(Number(e.target.value))}
                className="mt-0.5 h-8 font-mono text-sm"
              />
            </label>
          ))}
        </div>
        {!plan.open || !plan.strikes ? (
          <Alert className="mt-3">
            <AlertDescription>{plan.reason}</AlertDescription>
          </Alert>
        ) : (
          <div className="mt-3 space-y-1 font-mono text-xs">
            <div>
              strikes: shortP {plan.strikes.sP.toFixed(0)} / longP {plan.strikes.lP.toFixed(0)} · shortC{" "}
              {plan.strikes.sC.toFixed(0)} / longC {plan.strikes.lC.toFixed(0)}
            </div>
            <div>
              maxLoss ชุดละ {(plan.maxLoss ?? 0).toLocaleString()} บาท → เปิดได้{" "}
              <span className="font-bold text-neon-green">{plan.contracts}</span> ชุด — {plan.reason}
            </div>
            <div className="text-muted-foreground">
              exit rule ตัวอย่าง (premium {premium.toFixed(1)} → {premium * 0.72 > 0 ? "−28%" : ""}):{" "}
              <span className="text-neon-amber">{exit}</span> — TAKE ≤ 0.5×p0 · STOP ≥ 2×p0 · CLOSE_TIME ≤ 7 วัน
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ---------- Basis calculator (รอ FuturesDaily) ----------
function BasisCard() {
  const [S, setS] = useState(1350)
  const [nearPx, setNearPx] = useState(1358)
  const [farPx, setFarPx] = useState(1369)
  const [q, setQ] = useState(2.5)

  const res = useMemo(() => {
    // จำลอง hist = basis วิ่งรอบ 10±3 จุด (เมื่อมีข้อมูลจริงจาก FuturesDaily จะใช้ series จริง)
    const hist = Array.from(
      { length: 60 },
      (_, i) => 10 + 3 * Math.sin(i * 0.7) + 1.5 * Math.cos(i * 1.3)
    )
    return calendarSignal({ px: nearPx, T: 30 / 365 }, { px: farPx, T: 90 / 365 }, S, q / 100, hist)
  }, [S, nearPx, farPx, q])

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">🏦 Basis / Calendar Spread (TFEX)</CardTitle>
        <CardDescription>
          z ของ (far−near) เทียบ fair basis — combo margin ~1/10 ของ outright · รอ ingest FuturesDaily จึงใช้
          series จริง
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(
            [
              ["Spot", S, setS, 1],
              ["Near px", nearPx, setNearPx, 0.5],
              ["Far px", farPx, setFarPx, 0.5],
              ["q (%)", q, setQ, 0.1],
            ] as const
          ).map(([label, value, setter, step]) => (
            <label key={label} className="text-xs text-muted-foreground">
              {label}
              <Input
                type="number"
                step={step}
                value={value}
                onChange={(e) => setter(Number(e.target.value))}
                className="mt-0.5 h-8 font-mono text-sm"
              />
            </label>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <Badge className={res.action === "SHORT_SPREAD" ? "bg-neon-green text-on-neon" : res.action === "LONG_SPREAD" ? "bg-neon-green text-on-neon" : ""}>
            {res.action}
          </Badge>
          <Badge variant="outline" className="font-mono">
            z {res.z.toFixed(2)}
          </Badge>
          <Badge variant="outline" className="font-mono">
            fair {res.fair.toFixed(1)} · observed {res.observed.toFixed(1)}
          </Badge>
        </div>
      </CardContent>
    </Card>
  )
}

export default function AlphaTab() {
  const eng = useApi<EnginesResponse>("/api/arb/engines")

  return (
    <div className="grid gap-4">
      {/* หลักการ */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Layers className="h-4 w-4 text-neon-green" aria-hidden /> Alpha Stack v3 — เงินโตจาก alpha stream
            หลายสาย ไม่ใช่เดิมพันก้อนใหญ่ขึ้น
          </CardTitle>
          <CardDescription>
            Sharpe ของพอร์ต = f(จำนวน alpha stream ที่ไม่ correlated) — engine ที่ corr ≈ 0 กับ core ดีกว่าการ
            leverage core 2 เท่าเสมอ · เป้า: 15-28%/ปี ที่ MaxDD ~−12% (Calmar ~2 เท่า)
          </CardDescription>
        </CardHeader>
      </Card>

      {/* สถานะ engines */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">สถานะ Engines + Pre-registered Gates</CardTitle>
        </CardHeader>
        <CardContent>
          {eng.error ? (
            <Alert variant="destructive">
              <AlertDescription>{eng.error}</AlertDescription>
            </Alert>
          ) : eng.loading || !eng.data ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <div className="space-y-3">
              {eng.data.engines.map((e) => (
                <div key={e.key} className="rounded-lg border border-border/60 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{e.name}</span>
                    {statusBadge(e.status)}
                    <Badge variant="outline" className="font-mono">
                      corr {e.corrVsCore}
                    </Badge>
                    <Badge variant="outline" className="font-mono">
                      exp {e.expected}
                    </Badge>
                    <Badge variant="outline" className="font-mono">
                      MaxDD {e.maxDD}
                    </Badge>
                    <Badge variant="outline" className="font-mono">
                      ความจุ {e.capacity}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{e.detail}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {e.gates.map((g) => (
                      <Badge
                        key={g.label}
                        variant="secondary"
                        className={
                          /* whitespace-normal: ป้ายข้อความยาวต้องตัดบรรทัดได้ ไม่งั้นดันหน้าล้นแนวนอนบนจอแคบ */
                          "whitespace-normal " +
                          (g.pass === true
                            ? "bg-neon-green/10 text-neon-green"
                            : g.pass === false
                              ? "bg-neon-rose/10 text-neon-rose"
                              : "")
                        }
                      >
                        {g.pass === true ? "✓" : g.pass === false ? "✗" : "○"} {g.label}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
              <div className="rounded-lg border border-dashed border-border/60 p-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-semibold">🧮 HRP Allocator</span>
                  <Badge variant="secondary">{eng.data.allocator.status}</Badge>
                  <span className="text-xs text-muted-foreground">เงื่อนไขเปิด: {eng.data.allocator.unlock}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{eng.data.allocator.note}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <PairsCard />

      <div className="grid gap-4 lg:grid-cols-2">
        <SyntheticCard />
        <VrpCard />
      </div>

      <BasisCard />
    </div>
  )
}
