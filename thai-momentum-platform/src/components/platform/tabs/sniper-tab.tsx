"use client"

// แท็บ SET Sniper — ICT × Order Flow (Task 16-c)
// อ่านรายงานจาก GET /api/sniper (SniperReport) แล้วเรนเดอร์แบบ honest:
// location/value เป็น null ได้เมื่อหุ้นไม่มีข้อมูล OHLC → แสดง "—" เสมอ ไม่เดาแทน
// ทุกชั้นคือ "ระบบแนะนำ" — คำสั่งจริงยังผ่าน Human Gate (default-deny) เหมือนเดิม

import { Fragment, useMemo, useState, type ReactNode } from "react"
import { ChevronDown, ChevronRight, RefreshCw } from "lucide-react"
import { useApi } from "@/hooks/use-api"
import type { ConfluenceRow, LayerScore, SniperReport } from "@/lib/sniper/types"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"

// ---------- helpers ----------

function pct(x: number | null | undefined, digits = 1): string {
  if (x === null || x === undefined || !isFinite(x)) return "—"
  return `${x >= 0 ? "+" : ""}${x.toFixed(digits)}%`
}

function retClass(x: number | null | undefined): string {
  if (x === null || x === undefined || !isFinite(x) || x === 0) return "text-muted-foreground"
  return x > 0 ? "text-neon-green" : "text-neon-rose"
}

// 3 สีเดียวกับทั้งแพลตฟอร์ม: risk_on เขียว 🟢 · risk_off แดง 🔴 · neutral/caution เหลือง 🟡
function stanceBadge(label: string): ReactNode {
  if (label === "risk_on")
    return <Badge className="border-neon-green/35 bg-neon-green/10 text-neon-green">🟢 risk_on</Badge>
  if (label === "risk_off")
    return <Badge className="border-neon-rose/35 bg-neon-rose/10 text-neon-rose">🔴 risk_off</Badge>
  return <Badge className="border-neon-amber/35 bg-neon-amber/10 text-neon-amber">🟡 {label}</Badge>
}

function sweepBadge(side: "bullish" | "bearish", long = false): ReactNode {
  if (side === "bullish")
    return <Badge className="border-neon-green/35 bg-neon-green/10 text-neon-green">{long ? "SWEEP↑ กระทะแล้วกลับ" : "SWEEP↑"}</Badge>
  return <Badge className="border-neon-rose/35 bg-neon-rose/10 text-neon-rose">SWEEP↓</Badge>
}

function verdictBadge(v: ConfluenceRow["verdict"]): ReactNode {
  if (v === "high") return <Badge className="border-neon-green/35 bg-neon-green/10 text-neon-green">สูง</Badge>
  if (v === "medium") return <Badge className="border-neon-amber/35 bg-neon-amber/10 text-neon-amber">กลาง</Badge>
  return <Badge variant="secondary" className="text-muted-foreground">ต่ำ</Badge>
}

function MiniTile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border border-border/60 bg-foreground/[0.03] px-2.5 py-2">
      <div className="truncate text-[10px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-mono text-sm font-semibold tabular-nums">{children}</div>
    </div>
  )
}

// คะแนนชั้นย่อย = mini progress bar + ตัวเลข mono — hover ได้เหตุผลเต็มผ่าน title
function LayerCell({ layer }: { layer: LayerScore | null }) {
  if (!layer)
    return (
      <span className="font-mono text-xs text-muted-foreground" title="ไม่มีข้อมูล OHLC — ชั้นนี้ปิดแบบ honest">
        —
      </span>
    )
  return (
    <div className="w-14 min-w-10" title={layer.reasons.join(" · ")}>
      <div className="h-1.5 w-full min-w-10 overflow-hidden rounded-full bg-foreground/[0.06]">
        <div className="h-full rounded-full bg-neon-green" style={{ width: `${Math.max(0, Math.min(100, layer.score))}%` }} />
      </div>
      <div className="mt-0.5 font-mono text-[11px] tabular-nums">{layer.score}</div>
    </div>
  )
}

function ReasonCol({ title, layer }: { title: string; layer: LayerScore | null }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-medium text-muted-foreground">{title}</div>
      {layer ? (
        <>
          <div className="font-mono text-[11px] tabular-nums">คะแนน {layer.score}</div>
          <ul className="mt-0.5 grid gap-0.5 text-[11px] text-muted-foreground">
            {layer.reasons.map((s, i) => (
              <li key={i}>· {s}</li>
            ))}
          </ul>
        </>
      ) : (
        <div className="mt-0.5 text-[11px] text-muted-foreground">— ไม่มีข้อมูล OHLC (CSV ไม่มี open/high/low)</div>
      )}
    </div>
  )
}

function SniperSkeleton() {
  return (
    <div className="grid gap-4" aria-busy="true">
      <Card>
        <CardContent className="grid gap-3 pt-6">
          <Skeleton className="h-6 w-72 max-w-full" />
          <Skeleton className="h-4 w-full max-w-lg" />
          <div className="grid gap-2 sm:grid-cols-4">
            <Skeleton className="h-6" />
            <Skeleton className="h-6" />
            <Skeleton className="h-6" />
            <Skeleton className="h-6" />
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
      <Skeleton className="h-28" />
      <Skeleton className="h-96" />
    </div>
  )
}

export default function SniperTab() {
  const { data, loading, error, refetch } = useApi<SniperReport>("/api/sniper")
  const [expanded, setExpanded] = useState<string | null>(null)

  // เรียงตามคะแนนรวม desc — checklist จัดอันดับให้เอง ผู้ใช้อ่านจากบนลงล่าง
  const confluence = useMemo(
    () => (data ? [...data.confluence].sort((a, b) => b.total - a.total) : []),
    [data],
  )

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>โหลดรายงาน SET Sniper ไม่สำเร็จ</AlertTitle>
        <AlertDescription className="flex flex-wrap items-center gap-3">
          <span>{error}</span>
          <Button variant="outline" size="sm" className="min-h-9" onClick={refetch}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden /> ลองใหม่
          </Button>
        </AlertDescription>
      </Alert>
    )
  }
  if (loading || !data) return <SniperSkeleton />

  const { meta, briefing, breaker, events } = data
  const topRotation = [...briefing.rotation].sort((a, b) => a.rankNow - b.rankNow).slice(0, 3)
  const fvgBadge = (kind: "bullish" | "bearish") =>
    kind === "bullish" ? (
      <Badge className="border-neon-green/35 bg-neon-green/10 text-neon-green">FVG↑</Badge>
    ) : (
      <Badge className="border-neon-rose/35 bg-neon-rose/10 text-neon-rose">FVG↓</Badge>
    )

  return (
    <div className="grid gap-4">
      {/* ---------- 1. Header ---------- */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            🎯 SET Sniper — ICT × Order Flow
            <Badge className="border-neon-amber/35 bg-neon-amber/10 text-neon-amber">DAILY PROXY</Badge>
          </CardTitle>
          <CardDescription>
            ปรับใช้ Blueprint &quot;ICT (Location) + Volume Profile (Value) + Order Flow (Behavior) + Circuit
            Breaker&quot; บนข้อมูลรายวันของระบบ — ตัดสินใจด้วย checklist 3 ชั้น ไม่ใช่ความรู้สึก
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <Badge variant="outline" className="font-mono tabular-nums">
              {meta.latestDate}
            </Badge>
            <span aria-hidden>·</span>
            <span>
              watchlist <span className="font-mono tabular-nums">{meta.watchlistCount}</span> ตัว
            </span>
            <span aria-hidden>·</span>
            <span>
              มี OHLC <span className="font-mono tabular-nums">{meta.hasOhlcCount}</span> ตัว
            </span>
            <span aria-hidden>·</span>
            <span className="font-mono tabular-nums">{meta.runtimeMs}ms</span>
          </div>
          <div className="rounded-lg border border-neon-amber/30 bg-neon-amber/[0.06] px-3 py-2 text-[11px] text-neon-amber">
            {meta.proxyNotice}
          </div>
        </CardContent>
      </Card>

      {/* ---------- 2. Daily Brief ---------- */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">🌅 Daily Brief — One-Glance</CardTitle>
          <CardDescription>
            สถานะรวมของวัน: regime พอร์ตไทย + สัญญาณโลก + ตลาด + ผู้นำกลุ่ม — อ่านจบในหนึ่งบรรทัดต่อชั้น
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="grid min-w-0 content-start gap-2 rounded-lg border border-border/60 bg-foreground/[0.03] p-3">
            <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Regime (ระบบไทย)</div>
            <div className="flex flex-wrap items-center gap-2">
              {briefing.regime ? stanceBadge(briefing.regime.label) : <span className="text-xs text-muted-foreground">—</span>}
              {briefing.regime && (
                <span className="font-mono text-xs tabular-nums text-muted-foreground">conf {briefing.regime.score.toFixed(2)}</span>
              )}
            </div>
            <div className="h-px bg-border/60" aria-hidden />
            <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">GTAA (สัญญาณโลก)</div>
            <div className="flex flex-wrap items-center gap-2">
              {briefing.gtaa ? stanceBadge(briefing.gtaa.stance) : <span className="text-xs text-muted-foreground">—</span>}
            </div>
            {briefing.gtaa && (
              <div className="text-[11px] text-muted-foreground">
                เงินสด <span className="font-mono tabular-nums">{(briefing.gtaa.cashPct * 100).toFixed(0)}%</span> · ถึง{" "}
                {briefing.gtaa.asOfMonth}
              </div>
            )}
          </div>

          <div className="grid min-w-0 content-start gap-2">
            <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">ตลาด (SET)</div>
            <div className="grid grid-cols-3 gap-2">
              <MiniTile label="วันล่าสุด">
                <span className={retClass(briefing.mkt.ret1d)}>{pct(briefing.mkt.ret1d * 100)}</span>
              </MiniTile>
              <MiniTile label="5 วัน">
                <span className={retClass(briefing.mkt.ret5d)}>{pct(briefing.mkt.ret5d * 100)}</span>
              </MiniTile>
              <MiniTile label="Breadth 20d">{(briefing.mkt.breadth20 * 100).toFixed(0)}%</MiniTile>
            </div>
            <p className="text-xs text-muted-foreground">{briefing.mkt.note}</p>
          </div>

          <div className="grid min-w-0 content-start gap-2">
            <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">ผู้นำกลุ่ม</div>
            <div className="flex flex-wrap gap-1.5">
              {topRotation.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
              {topRotation.map((r, i) => (
                <span
                  key={r.sector}
                  className="inline-flex min-h-9 items-center gap-1 rounded-md border border-border/60 bg-foreground/[0.03] px-1.5 py-1 text-[11px]"
                >
                  <span className="font-medium">{r.sector}</span>
                  <span className={cn("font-mono tabular-nums", retClass(r.ret20))}>{pct(r.ret20)}</span>
                  {i === 0 && r.leader && (
                    <Badge className="border-neon-green/35 bg-neon-green/10 px-1 py-0 text-[9px] text-neon-green">ผู้นำ</Badge>
                  )}
                </span>
              ))}
            </div>
            <div className="grid gap-0.5">
              {briefing.leadlag.slice(0, 3).map((row) => (
                <div key={row.asset} title={row.note} className="truncate text-[11px] text-muted-foreground">
                  <span className="font-mono">{row.asset}</span>{" "}
                  {row.direction === "leads" ? `นำ ${row.bestLag} วัน` : "เคลื่อนพร้อมกัน"} (r{" "}
                  {row.bestCorr.toFixed(2)})
                </div>
              ))}
              {briefing.leadlag.length === 0 && <span className="text-[11px] text-muted-foreground">—</span>}
            </div>
          </div>

          {briefing.notes.length > 0 && (
            <p className="text-[10px] text-muted-foreground md:col-span-3">{briefing.notes.join(" · ")}</p>
          )}
        </CardContent>
      </Card>

      {/* ---------- 3. Circuit Breaker ---------- */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">🛑 Circuit Breaker — ระบบตัดฉุกเฉิน 3 ระดับ</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid gap-3 md:grid-cols-[auto_1fr]">
            <div
              className={cn(
                "flex min-h-24 flex-col items-center justify-center rounded-xl border px-5 py-3 text-center",
                breaker.level === 0 && "border-neon-green/35 bg-neon-green/10 text-neon-green",
                breaker.level === 1 && "border-neon-amber/35 bg-neon-amber/10 text-neon-amber",
                breaker.level === 2 && "border-neon-rose/35 bg-neon-rose/10 text-neon-rose",
                breaker.level === 3 && "border-neon-rose/35 bg-neon-rose/20 text-neon-rose",
              )}
            >
              <div className="font-mono text-4xl font-bold leading-none tabular-nums">{breaker.level}</div>
              <div className="mt-1 text-xs font-medium">{breaker.level === 0 ? "ปกติ" : breaker.label}</div>
            </div>
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              <div className="min-w-0">
                <div className="text-xs font-medium">สาเหตุ</div>
                <ul className="mt-1 grid gap-0.5 text-[11px] text-muted-foreground">
                  {breaker.reasons.length === 0 ? <li>— ไม่มีเงื่อนไขใดชนเกณฑ์</li> : null}
                  {breaker.reasons.map((s, i) => (
                    <li key={i}>· {s}</li>
                  ))}
                </ul>
              </div>
              <div className="min-w-0">
                <div className="text-xs font-medium">การกระทำที่ระบบแนะนำ</div>
                <ul className="mt-1 grid gap-0.5 text-[11px] text-muted-foreground">
                  {breaker.actions.map((s, i) => (
                    <li key={i}>→ {s}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">
            ระบบแนะนำเท่านั้น — คำสั่งจริงต้องผ่าน Human Gate (default-deny) เหมือนเดิม
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <MiniTile label="ตลาดวันนี้">
              <span className={retClass(breaker.metrics.mkt1d)}>{pct(breaker.metrics.mkt1d * 100)}</span>
            </MiniTile>
            <MiniTile label="5 วัน">
              <span className={retClass(breaker.metrics.mkt5d)}>{pct(breaker.metrics.mkt5d * 100)}</span>
            </MiniTile>
            <MiniTile label="Win rate 10 ไม้">
              {breaker.metrics.winRate10 !== null ? `${(breaker.metrics.winRate10 * 100).toFixed(0)}%` : "—"}
            </MiniTile>
            <MiniTile label="ไม้ที่ปิดล่าสุด">
              {breaker.metrics.lastClosedPnlPct !== null
                ? `${pct(breaker.metrics.lastClosedPnlPct)} (${breaker.metrics.lastClosedCount} ไม้)`
                : "—"}
            </MiniTile>
            <MiniTile label="DQ flags">{breaker.metrics.dqFlags}</MiniTile>
          </div>
        </CardContent>
      </Card>

      {/* ---------- 4. Confluence Checklist ---------- */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">🎯 Confluence Checklist — Location × Value × Behavior</CardTitle>
          <CardDescription>
            น้ำหนักลงทะเบียน: Location 40% · Value 30% · Behavior 30% · ครบ 3 ชั้น = setup ความน่าจะเป็นสูง (≥65) ·
            เรียงตามคะแนนรวม
          </CardDescription>
        </CardHeader>
        <CardContent>
          {confluence.length === 0 ? (
            <p className="text-xs text-muted-foreground">ยังไม่มีข้อมูล watchlist — รัน ingest ก่อน</p>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[760px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>หุ้น</TableHead>
                    <TableHead className="text-right">ราคา</TableHead>
                    <TableHead className="text-right">20 วัน</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead>Behavior</TableHead>
                    <TableHead className="text-right">รวม</TableHead>
                    <TableHead>มุมมอง</TableHead>
                    <TableHead>ร่องรอย</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {confluence.map((r) => (
                    <Fragment key={r.symbol}>
                      <TableRow>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-9 w-9 shrink-0 p-0"
                              aria-expanded={expanded === r.symbol}
                              aria-label={expanded === r.symbol ? `ยุบรายละเอียด ${r.symbol}` : `ขยายรายละเอียด ${r.symbol}`}
                              onClick={() => setExpanded(expanded === r.symbol ? null : r.symbol)}
                            >
                              {expanded === r.symbol ? (
                                <ChevronDown className="h-4 w-4" aria-hidden />
                              ) : (
                                <ChevronRight className="h-4 w-4" aria-hidden />
                              )}
                            </Button>
                            <div className="min-w-0">
                              <div className="font-mono text-sm font-bold">{r.symbol}</div>
                              <div className="truncate text-[10px] text-muted-foreground">{r.sector}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">{r.close.toFixed(2)}</TableCell>
                        <TableCell className={cn("text-right font-mono tabular-nums", retClass(r.ret20))}>
                          {pct(r.ret20)}
                        </TableCell>
                        <TableCell><LayerCell layer={r.location} /></TableCell>
                        <TableCell><LayerCell layer={r.value} /></TableCell>
                        <TableCell><LayerCell layer={r.behavior} /></TableCell>
                        <TableCell
                          className={cn(
                            "text-right font-mono text-sm font-bold tabular-nums",
                            r.total >= 65 && "text-neon-green",
                          )}
                        >
                          {r.total}
                        </TableCell>
                        <TableCell>{verdictBadge(r.verdict)}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {r.sweep && sweepBadge(r.sweep.side)}
                            {r.fvgs.some((f) => !f.mitigated) && (
                              <Badge className="border-neon-cyan/35 bg-neon-cyan/10 text-neon-cyan">FVG</Badge>
                            )}
                            {!r.sweep && !r.fvgs.some((f) => !f.mitigated) && (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      {expanded === r.symbol && (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={9} className="bg-foreground/[0.02]">
                            <div className="grid gap-3 p-1 md:grid-cols-3">
                              <ReasonCol title="Location (น้ำหนัก 40%)" layer={r.location} />
                              <ReasonCol title="Value (น้ำหนัก 30%)" layer={r.value} />
                              <ReasonCol title="Behavior (น้ำหนัก 30%)" layer={r.behavior} />
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5 p-1">
                              <span className="text-[10px] font-medium text-muted-foreground">Key Levels:</span>
                              {r.levels.length === 0 && (
                                <span className="text-[10px] text-muted-foreground">— ไม่มีระดับสำคัญที่เข้าเกณฑ์</span>
                              )}
                              {r.levels.map((lv, i) => (
                                <span
                                  key={`${lv.kind}-${lv.price}-${i}`}
                                  title={lv.note}
                                  className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-card px-1.5 py-0.5 font-mono text-[10px] tabular-nums"
                                >
                                  {lv.kind} {lv.price.toFixed(2)}
                                  <span className={retClass(lv.gapPct)}>{pct(lv.gapPct)}</span>
                                </span>
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---------- 5. Structure feed ---------- */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">🧭 ร่องรอยโครงสร้างล่าสุด — Sweep &amp; FVG</CardTitle>
          <CardDescription>
            Sweep = แทงทะลุระดับ liquidity แล้วราคากลับ (จุดกลับของ ICT) · FVG ที่ยังไม่ถูก mitigate = โซนราคา
            (POI) ที่รอเทส
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="min-w-0">
            <div className="mb-2 text-xs font-medium">Sweep — liquidity grab</div>
            {events.sweeps.length === 0 ? (
              <p className="text-xs text-muted-foreground">ไม่มี sweep ในรอบ 5 แท่ง</p>
            ) : (
              <ul className="grid gap-1.5">
                {events.sweeps.map((s, i) => (
                  <li
                    key={`${s.symbol}-${s.date}-${i}`}
                    className="flex min-h-9 flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg border border-border/60 bg-foreground/[0.03] px-2.5 py-1.5 text-[11px]"
                  >
                    <span className="font-mono text-sm font-bold">{s.symbol}</span>
                    {sweepBadge(s.side, true)}
                    <span className="font-mono tabular-nums text-muted-foreground">
                      ทะลุ {s.pierced.toFixed(2)} · ลึก {s.depthPct.toFixed(1)}% · วอลุ่ม {s.valZ.toFixed(1)}σ
                    </span>
                    <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                      {s.date} · {s.barsAgo === 0 ? "แท่งล่าสุด" : `${s.barsAgo} แท่งก่อน`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="min-w-0">
            <div className="mb-2 text-xs font-medium">FVG — Fair Value Gap</div>
            {events.fvgs.length === 0 ? (
              <p className="text-xs text-muted-foreground">ไม่มี FVG ในรอบ 5 แท่ง</p>
            ) : (
              <ul className="grid gap-1.5">
                {events.fvgs.map((f, i) => (
                  <li
                    key={`${f.symbol}-${f.to}-${i}`}
                    className="flex min-h-9 flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg border border-border/60 bg-foreground/[0.03] px-2.5 py-1.5 text-[11px]"
                  >
                    <span className="font-mono text-sm font-bold">{f.symbol}</span>
                    {fvgBadge(f.kind)}
                    <span className="font-mono tabular-nums text-muted-foreground">
                      โซน {f.bottom.toFixed(2)}–{f.top.toFixed(2)} ({f.sizePct.toFixed(1)}%)
                    </span>
                    <span className="ml-auto flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
                      {f.to}
                      {f.mitigated ? (
                        <Badge variant="secondary" className="text-[9px] text-muted-foreground">
                          โดนกลับเข้าแล้ว
                        </Badge>
                      ) : (
                        <Badge className="border-neon-green/35 bg-neon-green/10 text-[9px] text-neon-green">
                          ยังไม่ถูก mitigate (POI)
                        </Badge>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ---------- 6. Sector rotation ---------- */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">🔄 Sector Rotation — จับผู้นำก่อนผู้ตาม</CardTitle>
          <CardDescription>
            ret20/ret60 ของกลุ่ม + เงินไหล 5 วันเทียบ 20 วัน (+ = เงินเข้า) · อันดับเทียบกับ 60 วันก่อนหน้าเพื่อดู
            acceleration
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.rotation.length === 0 ? (
            <p className="text-xs text-muted-foreground">ไม่มีข้อมูล sector rotation</p>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[640px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>กลุ่ม</TableHead>
                    <TableHead className="text-right">ret20</TableHead>
                    <TableHead className="text-right">ret60</TableHead>
                    <TableHead className="text-right">เงินไหล 5v20</TableHead>
                    <TableHead>อันดับ</TableHead>
                    <TableHead className="text-right">หุ้น</TableHead>
                    <TableHead>ผู้นำ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rotation.map((s) => (
                    <TableRow key={s.sector}>
                      <TableCell className="font-medium">{s.sector}</TableCell>
                      <TableCell className={cn("text-right font-mono tabular-nums", retClass(s.ret20))}>
                        {pct(s.ret20)}
                      </TableCell>
                      <TableCell className={cn("text-right font-mono tabular-nums", retClass(s.ret60))}>
                        {pct(s.ret60)}
                      </TableCell>
                      <TableCell className={cn("text-right font-mono tabular-nums", retClass(s.valTrendPct))}>
                        {pct(s.valTrendPct)}
                      </TableCell>
                      <TableCell>
                        <div className="font-mono tabular-nums">#{s.rankNow}</div>
                        <div
                          className={cn(
                            "text-[10px]",
                            s.rankPrev > s.rankNow
                              ? "text-neon-green"
                              : s.rankPrev < s.rankNow
                                ? "text-neon-rose"
                                : "text-muted-foreground",
                          )}
                        >
                          {s.rankPrev > s.rankNow ? "▲ เร่ง" : s.rankPrev < s.rankNow ? "▼ ถอย" : "="}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{s.stocks}</TableCell>
                      <TableCell>
                        {s.leader ? (
                          <Badge className="border-neon-green/35 bg-neon-green/10 text-neon-green">ผู้นำ</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---------- 7. Footer note ---------- */}
      <p className="px-1 text-[10px] text-muted-foreground">
        ต่อยอดจาก Blueprint &quot;SET Alpha-X&quot;: ชั้นที่ต้องใช้ข้อมูล tick/Order Book จริง (Delta แท้, Iceberg,
        Ghost Wall, Block Trade window 16:30–16:40, Sentiment Pantip) ยังไม่เปิด — ดูแผนเต็มที่
        docs/research/set-sniper.md
      </p>
    </div>
  )
}
