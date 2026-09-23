"use client"

import { useState } from "react"
import {
  AlertCircle,
  CheckCircle2,
  CircleHelp,
  Loader2,
  PauseCircle,
} from "lucide-react"

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
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { fmtNum, fmtPct, postJson, useApi } from "@/hooks/use-api"
import { toast } from "@/hooks/use-toast"
import type {
  DecisionsResponse,
  GateActionResult,
  JevRunResponse,
  OverviewResponse,
  PendingResponse,
  VerifyResponse,
} from "@/lib/momentum/contracts"
import { cn } from "@/lib/utils"
import ScrollBox from "../scroll-box"
import { Term } from "../glossary"

// ---------- color maps ----------

const REGIME_BADGE: Record<string, { cls: string; label: string }> = {
  risk_on: {
    cls: "border-neon-green/40 bg-neon-green/10 text-neon-green shadow-[0_1px_2px_rgba(16,24,40,0.06)]",
    label: "🟢 RISK_ON",
  },
  neutral: {
    cls: "border-neon-amber/40 bg-neon-amber/10 text-neon-amber shadow-[0_1px_2px_rgba(16,24,40,0.06)]",
    label: "🟡 NEUTRAL",
  },
  risk_off: {
    cls: "border-neon-rose/40 bg-neon-rose/10 text-neon-rose shadow-[0_1px_2px_rgba(16,24,40,0.06)]",
    label: "🔴 RISK_OFF",
  },
}

const QUESTION_CLS: Record<string, string> = {
  Q_REGIME: "border-neon-purple/40 text-neon-purple",
  Q_ENTRY: "border-neon-green/40 text-neon-green",
  Q_EXIT: "border-neon-amber/40 text-neon-amber",
  Q_ESCALATE: "border-neon-rose/40 text-neon-rose",
}

function questionCls(q: string): string {
  return QUESTION_CLS[q] ?? "text-muted-foreground"
}

function actionCls(action: string): string {
  const a = action.toLowerCase()
  if (a === "buy") return "text-neon-green"
  if (a === "exit") return "text-neon-rose"
  if (a === "tighten") return "text-neon-amber"
  if (a === "review") return "text-neon-purple"
  return "text-muted-foreground" // hold / watch / ignore
}

function outcomeCls(x: number): string {
  return x >= 0 ? "text-neon-green" : "text-neon-rose"
}

function ConfChip({ conf }: { conf: number }) {
  return (
    <Badge
      variant="outline"
      className="px-1.5 text-[10px] font-normal text-muted-foreground"
    >
      conf {fmtNum(conf, 2)}
    </Badge>
  )
}

function CardError({ message }: { message: string }) {
  return (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>โหลดข้อมูลไม่สำเร็จ</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  )
}

function Loading({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-5 w-full" />
      ))}
    </div>
  )
}

// ---------- component ----------

export default function JevTab() {
  const overview = useApi<OverviewResponse>("/api/overview")
  const pending = useApi<PendingResponse>("/api/jev/pending")
  const decisions = useApi<DecisionsResponse>("/api/jev/decisions?limit=120")
  const verify = useApi<VerifyResponse>("/api/verify")

  const [runResult, setRunResult] = useState<JevRunResponse | null>(null)
  const [running, setRunning] = useState(false)
  // ปุ่มที่กำลังทำงาน (แถว + อนุมัติ/ปฏิเสธ) — spinner ขึ้นเฉพาะปุ่มที่กด
  const [gateBusy, setGateBusy] = useState<{ id: number; approve: boolean } | null>(null)

  async function handleRun() {
    setRunning(true)
    try {
      const r = await postJson<JevRunResponse>("/api/jev/run", {})
      toast({ title: "Jev ตัดสินใจแล้ว", description: r.message })
      setRunResult(r)
      pending.refetch()
      decisions.refetch()
    } catch (e) {
      toast({
        title: "รันสมอง Jev ไม่สำเร็จ",
        description: e instanceof Error ? e.message : "เกิดข้อผิดพลาด",
        variant: "destructive",
      })
    } finally {
      setRunning(false)
    }
  }

  async function handleGate(id: number, approve: boolean) {
    setGateBusy({ id, approve })
    try {
      const r = await postJson<GateActionResult>("/api/jev/pending", {
        id,
        approve,
      })
      toast({
        title: approve ? "อนุมัติคำสั่งแล้ว" : "ปฏิเสธคำสั่งแล้ว",
        description: r.message,
      })
      pending.refetch()
      decisions.refetch()
    } catch (e) {
      toast({
        title: "ทำรายการไม่สำเร็จ",
        description: e instanceof Error ? e.message : "เกิดข้อผิดพลาด",
        variant: "destructive",
      })
    } finally {
      setGateBusy(null)
    }
  }

  const regime = overview.data?.regime ?? null
  const regimeBadge = regime ? REGIME_BADGE[regime.action] : null

  return (
    <div className="space-y-4">
      {/* 1) สมอง Jev — regime + ปุ่มรัน */}
      <Card>
        <CardHeader>
          <CardTitle>🧠 สมอง Jev — ชั้นตัดสินใจ</CardTitle>
          <CardDescription>
            ชั้น Q_REGIME → Q_ENTRY → Q_EXIT → Q_ESCALATE ทุกคำสั่งผ่าน audit
            log ก่อนเสมอ
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {overview.error ? (
            <CardError message={overview.error} />
          ) : overview.loading && !overview.data ? (
            <Loading rows={2} />
          ) : regime && regimeBadge ? (
            <div className="flex flex-wrap items-center gap-3">
              <Badge
                variant="outline"
                className={cn(
                  "border px-3 py-1 text-sm font-semibold",
                  regimeBadge.cls
                )}
              >
                {regimeBadge.label}
              </Badge>
              <span className="text-sm">
                conf {fmtNum(regime.conf, 2)} · repeat_z{" "}
                {fmtNum(regime.repeatZ, 2)} · market 20d{" "}
                {fmtPct(regime.mktMom20 * 100, 1)}
              </span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              ยังไม่มีข้อมูล regime — ต้องมีข้อมูล snapshot ก่อน
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Jev แยกคนตัดสินใจออกจากคนลงมือ — conf ≥ 0.70 + regime risk_on =
            ซื้ออัตโนมัติในพอร์ตกระดาษ · regime neutral / ติดหลายโผวันแรก
            (escalate) / pairs = ส่งเข้า Human Gate (default-deny)
          </p>
          <Button size="lg" onClick={handleRun} disabled={running}>
            {running && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            🧠 รันสมอง Jev วันนี้
          </Button>
        </CardContent>
      </Card>

      {/* 2) ผลรันล่าสุด — regime ที่รอบนี้ใช้ตัดสินจริง (composite v2; badge ด้านบนเป็น regime ภาพรวมแบบเดิม อาจต่างกัน) */}
      {runResult && (
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span>รอบ {runResult.date} · regime ที่ใช้ตัดสิน</span>
          <Badge
            variant="outline"
            className={cn("px-1.5 text-[10px]", REGIME_BADGE[runResult.regime]?.cls)}
          >
            {REGIME_BADGE[runResult.regime]?.label ?? runResult.regime}
          </Badge>
          <span className="min-w-0 break-words">· {runResult.message}</span>
        </p>
      )}
      {/* 3 คอลัมน์ */}
      {runResult && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                ✅ ทำงานอัตโนมัติ ({runResult.executed.length})
              </CardTitle>
              <CardDescription className="text-xs">
                conf เพียงพอ + regime เปิด → ลงพอร์ตกระดาษทันที
              </CardDescription>
            </CardHeader>
            <CardContent>
              {runResult.executed.length === 0 ? (
                <p className="text-sm text-muted-foreground">—</p>
              ) : (
                <div className="space-y-2">
                  {runResult.executed.map((d, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-neon-green" />
                      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                        <span>
                          {d.question}{" "}
                          <span className="font-bold">{d.target}</span> →{" "}
                          <span
                            className={cn("font-semibold", actionCls(d.action))}
                          >
                            {d.action}
                          </span>
                        </span>
                        <ConfChip conf={d.conf} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                🙋 รออนุมัติ ({runResult.gated.length})
              </CardTitle>
              <CardDescription className="text-xs">
                regime neutral / escalate / pairs — มนุษย์ตัดสินก่อน
              </CardDescription>
            </CardHeader>
            <CardContent>
              {runResult.gated.length === 0 ? (
                <p className="text-sm text-muted-foreground">—</p>
              ) : (
                <div className="space-y-2">
                  {runResult.gated.map((d, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <CircleHelp className="mt-0.5 h-4 w-4 shrink-0 text-neon-purple" />
                      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                        <span>
                          <span className="font-mono text-xs text-neon-purple">
                            #{d.id}
                          </span>{" "}
                          {d.question}{" "}
                          <span className="font-bold">{d.target}</span> →{" "}
                          <span
                            className={cn("font-semibold", actionCls(d.action))}
                          >
                            {d.action}
                          </span>
                        </span>
                        <ConfChip conf={d.conf} />
                      </div>
                    </div>
                  ))}
                  <p className="pt-1 text-xs text-muted-foreground">
                    กดอนุมัติ/ปฏิเสธในการ์ดด้านล่าง
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                ⏸ ถูก threshold gate ({runResult.blocked.length})
              </CardTitle>
              <CardDescription className="text-xs">
                ไม่ผ่านเงื่อนไข — บันทึกไว้แต่ไม่ลงมือ
              </CardDescription>
            </CardHeader>
            <CardContent>
              {runResult.blocked.length === 0 ? (
                <p className="text-sm text-muted-foreground">—</p>
              ) : (
                <div className="space-y-2">
                  {runResult.blocked.map((d, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <PauseCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <div>
                        <span className="text-muted-foreground">
                          {d.question} {d.target} → {d.action}
                        </span>
                        <p className="text-xs text-muted-foreground/70">
                          {d.reason}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* 3) Human Gate */}
      <Card>
        <CardHeader>
          <CardTitle>
            🙋 <Term id="human-gate">Human Gate</Term> — คำสั่งรออนุมัติ
          </CardTitle>
          <CardDescription className="text-xs">
            Jev เสนอ — คุณตัดสิน · ทุกการตัดสินถูกบันทึกใน audit log
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pending.error ? (
            <CardError message={pending.error} />
          ) : pending.loading && !pending.data ? (
            <Loading rows={2} />
          ) : !pending.data || pending.data.pending.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              ไม่มีคำสั่งค้าง — ระบบ default-deny: ไม่มีการเทรดโดยไม่มีเหตุผลบันทึกไว้
            </p>
          ) : (
            <div className="space-y-3">
              {pending.data.pending.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-bold">
                      {p.question} · {p.target} → {p.action}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      conf {fmtNum(p.conf, 2)} · {p.reason}
                    </p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {p.date}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleGate(p.id, true)}
                      disabled={gateBusy !== null}
                    >
                      {gateBusy?.id === p.id && gateBusy.approve && (
                        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                      )}
                      ✓ อนุมัติ
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-neon-rose/40 text-neon-rose hover:bg-neon-rose/10 hover:text-neon-rose"
                      onClick={() => handleGate(p.id, false)}
                      disabled={gateBusy !== null}
                    >
                      {gateBusy?.id === p.id && !gateBusy.approve && (
                        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                      )}
                      ✕ ปฏิเสธ
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 4) audit log + calibration — [&>*]:min-w-0 กัน card ล้น cell เมื่อเนื้อหา min-content กว้าง (มือถือ) */}
      <div className="grid gap-4 [&>*]:min-w-0 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              📜 บันทึกการตัดสินใจ (audit log)
            </CardTitle>
            <CardDescription className="text-xs">
              120 รายการล่าสุด — ทุกแถวคือเหตุผลที่บันทึกไว้
            </CardDescription>
          </CardHeader>
          <CardContent>
            {decisions.error ? (
              <CardError message={decisions.error} />
            ) : decisions.loading && !decisions.data ? (
              <Loading rows={5} />
            ) : !decisions.data || decisions.data.decisions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                ยังไม่มีบันทึก — กด &quot;รันสมอง Jev วันนี้&quot; เพื่อเริ่มต้น
              </p>
            ) : (
              <ScrollBox className="max-h-96 overflow-auto [&::-webkit-scrollbar]:size-1.5 [&::-webkit-scrollbar-thumb]:bg-foreground/10 [&::-webkit-scrollbar-track]:bg-transparent" label="บันทึกการตัดสินใจ (เลื่อนดูได้)">
                <div className="space-y-1 font-mono text-xs">
                  {decisions.data.decisions.map((d) => (
                    <div
                      key={d.id}
                      className="flex items-center gap-2 whitespace-nowrap rounded px-1 py-0.5 hover:bg-foreground/[0.05]"
                    >
                      <span className="w-[10ch] shrink-0 text-muted-foreground">
                        {d.date.slice(0, 10)}
                      </span>
                      <Badge
                        variant="outline"
                        className={cn(
                          "shrink-0 px-1.5 text-[10px]",
                          questionCls(d.question)
                        )}
                      >
                        {d.question}
                      </Badge>
                      <span className="font-bold">{d.target}</span>
                      <span className="text-muted-foreground">→</span>
                      <span
                        className={cn("font-semibold", actionCls(d.action))}
                      >
                        {d.action}
                      </span>
                      <span className="text-muted-foreground">{fmtNum(d.conf, 2)}</span>
                      <span
                        className={
                          d.executed ? "text-neon-green" : "text-muted-foreground"
                        }
                      >
                        {d.executed ? "✓" : "·"}
                      </span>
                      {d.outcome !== null && (
                        <span className={outcomeCls(d.outcome)}>
                          {fmtPct(d.outcome)}
                        </span>
                      )}
                      {d.source === "human" && (
                        <Badge
                          variant="outline"
                          className="shrink-0 px-1.5 text-[10px] text-muted-foreground"
                        >
                          human
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollBox>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              🎯 Calibration — สมองเชื่อได้แค่ไหน?
            </CardTitle>
            <CardDescription className="text-xs">
              เทียบ conf ที่ Jev บอก กับ win rate ที่เกิดขึ้นจริง
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {verify.error ? (
              <CardError message={verify.error} />
            ) : verify.loading && !verify.data ? (
              <Loading rows={4} />
            ) : !verify.data || verify.data.total === 0 ? (
              <p className="text-sm text-muted-foreground">
                ยังไม่มี outcome — รอข้อมูล 10 วันหลังตัดสินใจแรก
              </p>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ช่วง conf</TableHead>
                      <TableHead className="text-right">n</TableHead>
                      <TableHead className="text-right">win rate จริง</TableHead>
                      <TableHead className="text-right">avg conf</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {verify.data.buckets.map((b) => (
                      <TableRow key={b.range}>
                        <TableCell className="font-mono text-xs">
                          {b.range}
                        </TableCell>
                        <TableCell className="text-right">{b.n}</TableCell>
                        <TableCell className="text-right">
                          {b.winRate === null
                            ? "—"
                            : fmtPct(b.winRate * 100, 1)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {/* bucket ว่าง: API ส่ง avgConf = 0 (ไม่มีข้อมูล) — ไม่โชว์ 0.00 ปลอม */}
                          {b.n === 0 ? "—" : fmtNum(b.avgConf, 2)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span>
                    Brier ={" "}
                    <span className="font-mono">
                      {fmtNum(verify.data.brier, 3)}
                    </span>
                  </span>
                  {verify.data.brier !== null &&
                    (verify.data.brier < 0.25 ? (
                      <Badge
                        variant="outline"
                        className="border-neon-green/40 bg-neon-green/10 text-neon-green"
                      >
                        ดีกว่าเดามั่ว (0.25)
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-neon-rose/40 bg-neon-rose/10 text-neon-rose"
                      >
                        แย่กว่าเดามั่ว
                      </Badge>
                    ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  เป้าหมาย: bucket conf สูงต้องมี win rate สูงตาม — ไม่งั้นปรับ
                  threshold
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
