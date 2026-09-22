"use client"

import { AlertCircle, Info } from "lucide-react"

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
import type { PortfolioResponse } from "@/lib/momentum/contracts"
import { cn } from "@/lib/utils"

const RULES = [
  "ซื้อที่ราคาปิดวันรัน (T+1 จากสัญญาณ)",
  "slots 1.0 ถ้า conf ≥ 0.85 ไม่งั้น 0.5",
  "stop ตั้งที่ -10% และ tighten เป็น +2% เมื่อหลุดจากโผ",
  "สูงสุด 10 สล็อต",
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
  const totals = data?.totals ?? null
  const risk = data?.risk ?? { effN: null, weeklyDD: null, killSwitch: false }

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
                  🚨 ทำงาน — DD รายสัปดาห์แตะ -6%
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
            <CardTitle className="text-base">Effective N</CardTitle>
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
                ? `${totals.positions} สถานะ · ${totals.slots.toFixed(1)} สล็อต`
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
                ยังไม่มีสถานะ — กด &quot;รันสมอง Jev&quot; ในแท็บ Jev AI
                เพื่อเริ่ม
              </p>
              <p className="text-xs text-muted-foreground">
                ระบบเป็น PAPER MODE 100% — ไม่มีคำสั่งเข้าตลาดจริง
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
                    <TableHead className="text-right">Stop (-10%)</TableHead>
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
                        {p.slots.toFixed(1)}
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
