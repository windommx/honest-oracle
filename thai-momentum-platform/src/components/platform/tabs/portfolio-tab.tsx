"use client"

import { AlertCircle, Hourglass, Info } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { fmtNum, fmtPct, useApi } from "@/hooks/use-api"
import { TH_RISK, TH_STRATEGY } from "@/lib/config/thai"
import type { PortfolioResponse } from "@/lib/momentum/contracts"
import { T1_TAG, fillSourceLabel } from "@/lib/jev/fill-rules"
import { cn } from "@/lib/utils"
import { Term } from "../glossary"

// ค่าจาก config/thai (single source of truth) — เดิม hardcode -10% / 10 สล็อต ไม่ตรงระบบจริง (-9% / 7)
const RULES = [
  // เดิมเขียน "ซื้อที่ราคาปิดวันรัน (T+1 จากสัญญาณ)" แต่โค้ดบันทึกราคาปิดของวันตัดสินใจ (T+0) — ตอนนี้ T+1 จริง
  "ซื้อที่ราคาปิดของวันทำการถัดจากวันตัดสินใจ (T+1 เหมือน backtest) — คำสั่งที่รอเติมแสดงแยก ไม่นับเป็นสถานะ",
  "หุ้นไม่มีราคาวันเติม (พัก/หยุดซื้อขาย) หรือ sector/slot ไม่ผ่านตอนเติม = ยกเลิกคำสั่ง (ไม่เลื่อนวัน ไม่แต่งราคา)",
  "slots 1.0 ถ้า conf ≥ 0.85 ไม่งั้น 0.5 (ก่อนปรับตาม vol/meta/sector)",
  `stop ตั้งที่ -${Math.round(TH_STRATEGY.stopPct * 100)}% (หุ้นผันผวนสูงแคบลง ×0.8) และ tighten เป็น +2% เมื่อหลุดจากโผ`,
  `สูงสุด ${TH_STRATEGY.maxPos} สล็อต`,
  "ทุกคำสั่งมี audit log",
]

export default function PortfolioTab() {
  const { data, error, loading } = useApi<PortfolioResponse>("/api/portfolio")

  if (loading && !data) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    )
  }

  if (error && !data) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>โหลดข้อมูลพอร์ตไม่สำเร็จ</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }

  const positions = data?.positions ?? []
  const pendingFills = data?.pendingFills ?? []
  const totals = data?.totals ?? null
  const risk = data?.risk ?? {
    effN: null,
    weeklyDD: null,
    killSwitch: false,
    maxWeeklyDD: TH_RISK.maxWeeklyDD,
  }

  return (
    <div className="space-y-4">
      {/* 1) แถวความเสี่ยง */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">🚨 Kill Switch</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              {risk.killSwitch ? (
                <Badge variant="destructive">
                  🚨 ทำงาน — DD รายสัปดาห์แตะ{" "}
                  {fmtPct(risk.maxWeeklyDD * 100, 0)}
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="border-neon-green/40 bg-neon-green/10 text-neon-green shadow-[0_1px_2px_rgba(16,24,40,0.06)]"
                >
                  ปกติ
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {risk.weeklyDD !== null
                ? `พอร์ต 5 วันล่าสุด ${fmtPct(risk.weeklyDD * 100, 2)}`
                : "—"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              <Term id="eff-n">Effective N</Term>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-2xl font-bold tabular-nums">
              {risk.effN !== null ? risk.effN.toFixed(1) : "—"}
            </p>
            <p className="text-xs text-muted-foreground">
              ถือ N ตัวแต่ correl สูง = ความเสี่ยงจริงเท่ากับถือน้อยกว่า
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">สรุปพอร์ต</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-2xl font-bold tabular-nums">
              {totals
                ? `${totals.positions} สถานะ · ${fmtNum(totals.slots, 2)} สล็อต`
                : "0 สถานะ"}
            </p>
            <p className="text-xs text-muted-foreground">
              กำไรเฉลี่ยต่อสถานะ:{" "}
              <span
                className={cn(
                  "font-semibold",
                  totals && totals.avgPnl >= 0
                    ? "text-neon-green"
                    : "text-neon-rose"
                )}
              >
                {totals ? fmtPct(totals.avgPnl, 2) : "—"}
              </span>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 2) สถานะในพอร์ตกระดาษ */}
      <Card>
        <CardHeader>
          <CardTitle>💼 สถานะในพอร์ตกระดาษ</CardTitle>
          <CardDescription className="text-xs">
            แถวไฮไลต์ชมพู = ราคาล่าสุดใกล้ stop (ภายใน 3%)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {positions.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <p className="text-sm text-muted-foreground">
                {pendingFills.length > 0
                  ? `ยังไม่มีสถานะ — มีคำสั่งซื้อรอเติม T+1 ${pendingFills.length} รายการ (ตารางด้านล่าง)`
                  : "ยังไม่มีสถานะ — กด \"รันสมอง Jev\" ในแท็บ Jev AI เพื่อเริ่ม"}
              </p>
              <p className="text-xs text-muted-foreground">
                ระบบเป็น <Term id="paper">PAPER MODE</Term> 100% — ไม่มีคำสั่งเข้าตลาดจริง
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>หุ้น</TableHead>
                    <TableHead>เข้าวันที่</TableHead>
                    <TableHead className="text-right">ราคาเข้า</TableHead>
                    <TableHead className="text-right">สล็อต</TableHead>
                    <TableHead className="text-right">Stop</TableHead>
                    <TableHead className="text-right">ราคาล่าสุด</TableHead>
                    <TableHead className="text-right">P&amp;L</TableHead>
                    <TableHead className="text-right">ถือมา (วัน)</TableHead>
                    <TableHead>สถานะในโผ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {positions.map((p) => (
                    <TableRow
                      key={p.symbol}
                      className={cn(
                        p.lastPx <= p.stop * 1.03 && "bg-neon-rose/5"
                      )}
                    >
                      <TableCell className="font-mono font-bold">
                        {p.symbol}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {p.entryDate}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {fmtNum(p.entryPx, 2)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {/* กริด 0.25 — toFixed(1) เคยโชว์ 0.75 เป็น 0.8 */}
                        {fmtNum(p.slots, 2)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-neon-rose">
                        {fmtNum(p.stop, 2)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {fmtNum(p.lastPx, 2)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-mono font-bold",
                          p.pnlPct >= 0 ? "text-neon-green" : "text-neon-rose"
                        )}
                      >
                        {fmtPct(p.pnlPct, 2)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {p.daysHeld}
                      </TableCell>
                      <TableCell>
                        {p.inAnyList ? (
                          <Badge
                            variant="outline"
                            className="border-neon-green/40 bg-neon-green/10 text-neon-green"
                          >
                            ติด {p.nTfToday} โผ
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-neon-amber/40 bg-neon-amber/10 text-neon-amber"
                          >
                            หลุดโผแล้ว
                          </Badge>
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

      {/* 2b) คำสั่งซื้อรอเติม T+1 — แยกจากสถานะ (ยังไม่ได้ซื้อ ไม่นับใน P&L/ความเสี่ยงด้านบน) */}
      {pendingFills.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Hourglass className="h-4 w-4 text-neon-amber" aria-hidden />
              {T1_TAG} ({pendingFills.length})
            </CardTitle>
            <CardDescription className="text-xs">
              คำสั่งที่ส่งแล้วแต่ยังไม่ใช่สถานะ — รอบ Jev ถัดไปเติมที่ราคาปิดของวันทำการแรกหลัง
              &quot;หลังข้อมูล&quot; · ไม่นับในสรุปพอร์ต/Kill Switch/Effective N/exposure
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>หุ้น</TableHead>
                    <TableHead>ที่มา</TableHead>
                    <TableHead>วันตัดสินใจ</TableHead>
                    <TableHead>หลังข้อมูล</TableHead>
                    <TableHead className="text-right">สล็อต</TableHead>
                    <TableHead>จะเติม</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingFills.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="font-mono font-bold">{o.symbol}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            "px-1.5 text-[10px]",
                            o.source === "human" ? "border-neon-purple/40 text-neon-purple" : "text-muted-foreground"
                          )}
                        >
                          {fillSourceLabel(o.source)}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{o.decisionDate}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{o.afterDate}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{fmtNum(o.slots, 2)}</TableCell>
                      <TableCell className="text-xs">
                        {o.fillDate === null ? (
                          <span className="text-muted-foreground">รอข้อมูลวันทำการถัดไป</span>
                        ) : o.fillPx === null ? (
                          <span className="text-neon-rose">ไม่มีราคา {o.fillDate} → จะถูกยกเลิก</span>
                        ) : (
                          <span>
                            ราคาปิด <span className="font-mono">{o.fillDate}</span> ·{" "}
                            <span className="font-mono">{fmtNum(o.fillPx, 2)}</span> (รอรอบ Jev ถัดไปบันทึก)
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 3) กติกาพอร์ต */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Info className="h-4 w-4 text-muted-foreground" />
            ℹ️ กติกาพอร์ต
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            {RULES.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
