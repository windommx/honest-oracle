"use client"

import { useState } from "react"
import {
  CheckCircle2,
  FlaskConical,
  Loader2,
  Lock,
  RotateCcw,
  ShieldCheck,
  ShieldX,
  Sparkles,
  XCircle,
} from "lucide-react"
import { useApi, postJson, fmtNum } from "@/hooks/use-api"
import type {
  AuditResponse,
  CpcvListResponse,
  CpcvResponse,
  Criterion,
  PreregResponse,
  TrialListResponse,
  TrialResponse,
  TrialParams,
} from "@/lib/momentum/contracts"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import CpcvCharts from "../cpcv-charts"

// ---------- helpers ----------

function pct(x: number | null | undefined, d = 1, sign = true): string {
  if (x === null || x === undefined || !isFinite(x)) return "—"
  const s = sign && x >= 0 ? "+" : ""
  return `${s}${(x * 100).toFixed(d)}%`
}

function fmtTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString("th-TH", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
}

function NumField({
  id,
  label,
  value,
  step = 1,
  onValue,
}: {
  id: string
  label: string
  value: number
  step?: number
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
        step={step}
        value={value}
        onChange={(e) => {
          const v = parseFloat(e.target.value)
          if (!Number.isNaN(v)) onValue(v)
        }}
      />
    </div>
  )
}

function verdictStyle(v: string): string {
  if (v === "GO")
    return "border-neon-green/40 bg-neon-green/10 text-[#10b981] shadow-[0_1px_2px_rgba(16,24,40,0.06)]"
  if (v === "WEAK")
    return "border-neon-amber/40 bg-neon-amber/10 text-[#f59e0b] shadow-[0_1px_2px_rgba(16,24,40,0.06)]"
  return "border-neon-rose/40 bg-neon-rose/10 text-[#f43f5e] shadow-[0_1px_2px_rgba(16,24,40,0.06)]"
}

function verdictText(v: string): string {
  if (v === "GO") return "🟢 GO — ผ่านเกณฑ์ความพร้อม นำไป paper trade ต่อได้"
  if (v === "WEAK") return "🟡 WEAK — ผ่านบางส่วน เก็บ evidence ต่อก่อนตัดสิน"
  return "🔴 NO-GO — ยังไม่มี edge ที่เชื่อถือได้ อยู่โหมดกระดาษต่อ"
}

function CriterionRow({ c }: { c: Criterion }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border px-3 py-2">
      <div className="flex min-w-0 items-start gap-2">
        {c.pass ? (
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-neon-green" aria-hidden />
        ) : (
          <XCircle className="mt-0.5 size-4 shrink-0 text-neon-rose" aria-hidden />
        )}
        <div className="min-w-0">
          <p className={cn("text-sm font-medium", c.pass ? "text-[#10b981]" : "text-[#f43f5e]")}>
            {c.label}
          </p>
          <p className="text-xs text-muted-foreground">{c.detail}</p>
        </div>
      </div>
      <Badge variant="outline" className={c.pass ? "border-neon-green/40 text-neon-green" : "border-neon-rose/40 text-neon-rose"}>
        {c.pass ? "ผ่าน" : "ไม่ผ่าน"}
      </Badge>
    </div>
  )
}

function ParamChips({ params }: { params: TrialParams }) {
  return (
    <div className="flex flex-wrap gap-1.5 text-[11px]">
      <Badge variant="outline" className="font-mono">k≥{params.k}</Badge>
      <Badge variant="outline" className="font-mono">ถือ {params.hold}d</Badge>
      <Badge variant="outline" className="font-mono">stop {(params.stopPct * 100).toFixed(0)}%</Badge>
      <Badge variant="outline" className="font-mono">≤{params.maxPos} สถานะ</Badge>
      <Badge variant="outline" className="font-mono">{params.costBps} bps</Badge>
      <Badge variant="outline" className="font-mono">boot ×{params.bootN}</Badge>
      <Badge variant="outline" className="font-mono">CPCV {params.nGroups}×{params.nTestGroups}</Badge>
      <Badge variant="outline" className="font-mono">purge {params.purge}</Badge>
      <Badge variant="outline" className="font-mono">hit≥{(params.hitGate * 100).toFixed(0)}%</Badge>
    </div>
  )
}

// ---------- main ----------

export default function ResearchTab() {
  const prereg = useApi<PreregResponse>("/api/research/prereg")
  const trialHistory = useApi<TrialListResponse>("/api/research/trial")
  const cpcvStatus = useApi<CpcvListResponse>("/api/research/cpcv")
  const audit = useApi<AuditResponse>("/api/events/audit")

  const [trialRunning, setTrialRunning] = useState(false)
  const [trial, setTrial] = useState<TrialResponse | null>(null)
  const [trialError, setTrialError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const [cpcvForm, setCpcvForm] = useState({
    hold: 10,
    nGroups: 6,
    nTestGroups: 2,
    purge: 10,
    embargo: 10,
    hitGate: 0.55,
  })

  // preset: ตามสเปก CPCV มาตรฐานของระบบ (N=6, k=2, purge=10, embargo=10)
  function applySpecPreset() {
    setCpcvForm((f) => ({ ...f, nGroups: 6, nTestGroups: 2, purge: 10, embargo: 10 }))
  }
  // preset: ผูกกับ horizon — purge = hold, embargo = round(hold/2) (กัน label leakage แบบพอดี horizon)
  function applyAutoPreset() {
    setCpcvForm((f) => ({ ...f, purge: f.hold, embargo: Math.round(f.hold / 2) }))
  }
  const [cpcvRunning, setCpcvRunning] = useState(false)
  const [cpcv, setCpcv] = useState<CpcvResponse | null>(null)
  const [cpcvError, setCpcvError] = useState<string | null>(null)

  async function freezePrereg(reset = false) {
    setBusy(reset ? "reset" : "freeze")
    try {
      await postJson<PreregResponse>("/api/research/prereg", reset ? { reset: true } : {})
      await Promise.all([prereg.refetch(), trialHistory.refetch()])
    } catch {
      // แสดงเงียบ ๆ — ปุ่มนี้ไม่ควรพังบ่อย
    } finally {
      setBusy(null)
    }
  }

  async function runTrial() {
    setTrialRunning(true)
    setTrialError(null)
    try {
      const res = await postJson<TrialResponse>("/api/research/trial", {})
      setTrial(res)
      trialHistory.refetch()
    } catch (e) {
      setTrialError(e instanceof Error ? e.message : "รัน Profit Engine ไม่สำเร็จ")
    } finally {
      setTrialRunning(false)
    }
  }

  async function runCpcv(deploy = false) {
    setCpcvRunning(true)
    setCpcvError(null)
    try {
      const res = await postJson<CpcvResponse>("/api/research/cpcv", { ...cpcvForm, deploy })
      setCpcv(res)
      cpcvStatus.refetch()
      audit.refetch()
    } catch (e) {
      setCpcvError(e instanceof Error ? e.message : "รัน CPCV ไม่สำเร็จ")
    } finally {
      setCpcvRunning(false)
    }
  }

  async function disableModel() {
    setBusy("disable")
    try {
      await postJson<CpcvResponse>("/api/research/cpcv", { disableModel: true })
      await Promise.all([cpcvStatus.refetch(), audit.refetch()])
    } finally {
      setBusy(null)
    }
  }

  const pr = prereg.data?.prereg ?? null
  const model = cpcvStatus.data?.model

  return (
    <div className="space-y-6">
      {/* ── 1) Pre-registration ─────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="size-4 text-neon-amber" aria-hidden />
            Pre-registration — ล็อกกติกาก่อนเห็นผล
          </CardTitle>
          <CardDescription>
            ห้ามแก้กติกาหลังรัน (กัน curve-fitting) — ทุก trial จะใช้กติกาที่ freeze ด้วย sha256 เท่านั้น
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {prereg.loading && !prereg.data ? (
            <Skeleton className="h-16 w-full" />
          ) : prereg.error ? (
            <Alert variant="destructive">
              <AlertTitle>โหลดสถานะ prereg ไม่สำเร็จ</AlertTitle>
              <AlertDescription>{prereg.error}</AlertDescription>
            </Alert>
          ) : pr ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-neon-amber/40 bg-neon-amber/10 text-[#f59e0b]">
                  🔒 ล็อกแล้ว
                </Badge>
                <span className="font-mono text-xs text-muted-foreground">
                  sha256 {pr.hash.slice(0, 16)}…
                </span>
                <span className="text-xs text-muted-foreground">freeze เมื่อ {fmtTime(pr.frozenAt)}</span>
              </div>
              <ParamChips params={pr.params} />
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="mt-1">
                    <RotateCcw className="size-3.5" aria-hidden /> ล็อกกติกาใหม่
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>ล็อกกติกาใหม่ทั้งหมด?</AlertDialogTitle>
                    <AlertDialogDescription>
                      การ reset prereg ถือเป็นการเริ่มการทดลองใหม่ — ผลรอบเก่ายังอยู่ในประวัติ
                      เพื่อให้ตรวจสอบย้อนหลังได้ว่าเคยเปลี่ยนกติกา
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
                    <AlertDialogAction onClick={() => freezePrereg(true)}>ยืนยัน reset</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                ยังไม่ได้ล็อกกติกา — รอบถัดไปจะใช้ค่า default (k≥3 · ถือ 10 วัน · stop 10% · 10 สถานะ · 55 bps)
              </p>
              <Button size="sm" onClick={() => freezePrereg(false)} disabled={busy !== null}>
                {busy === "freeze" ? <Loader2 className="size-4 animate-spin" /> : <Lock className="size-3.5" />}
                ล็อกกติกาด้วยค่า default
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 2) Profit Engine ────────────────────────────────────── */}
      <Card className="neon-card-purple">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FlaskConical className="size-4 text-neon-green" aria-hidden />
            Profit Engine — ตัดสินความพร้อมในคลิกเดียว
          </CardTitle>
          <CardDescription>
            Backtest กลยุทธ์ vs naive baseline (Top-N โดย ret20) + time-half split + bootstrap CI +
            cost sensitivity + meta-model CPCV → เช็กลิสต์ 7 เกณฑ์
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button onClick={runTrial} disabled={trialRunning} className="min-w-52">
              {trialRunning ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" aria-hidden />}
              {trialRunning ? "กำลังรันชุดทดสอบ (10–25 วิ)..." : "รัน Profit Engine"}
            </Button>
            {trial && (
              <span className="text-xs text-muted-foreground">
                ใช้เวลา {trial.tookMs} ms · {trial.frozen ? "🔒 ใช้กติกาที่ล็อกไว้" : "ใช้ค่า default (ยังไม่ล็อก)"}
              </span>
            )}
          </div>

          {trialError && (
            <Alert variant="destructive">
              <AlertTitle>รันไม่สำเร็จ</AlertTitle>
              <AlertDescription>{trialError}</AlertDescription>
            </Alert>
          )}

          {trial && (
            <div className="space-y-4">
              {/* verdict banner */}
              <div className={cn("rounded-xl border px-4 py-4", verdictStyle(trial.verdict))}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold">{verdictText(trial.verdict)}</p>
                    <p className="mt-0.5 text-xs opacity-80">
                      ผ่าน {trial.passed}/{trial.total} เกณฑ์ · run #{trial.id} · hash {trial.paramsHash.slice(0, 12)}…
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-black tabular-nums">{trial.passed}/7</div>
                    <div className="text-[11px] opacity-75">คะแนนความพร้อม</div>
                  </div>
                </div>
              </div>

              {/* criteria checklist */}
              <div className="grid gap-2 lg:grid-cols-2">
                {trial.criteria.map((c) => (
                  <CriterionRow key={c.key} c={c} />
                ))}
              </div>

              {/* strategy vs naive */}
              <div>
                <p className="mb-2 text-sm font-semibold">เทียบกับ naive baseline</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ชุด</TableHead>
                      <TableHead className="text-right">CAGR</TableHead>
                      <TableHead className="text-right">MaxDD</TableHead>
                      <TableHead className="text-right">Sharpe</TableHead>
                      <TableHead className="text-right">Winrate</TableHead>
                      <TableHead className="text-right">เทรด</TableHead>
                      <TableHead className="text-right">Exposure</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="font-medium text-[#10b981]">กลยุทธ์โมเมนตัม</TableCell>
                      <TableCell className="text-right tabular-nums">{pct(trial.strategy.cagr)}</TableCell>
                      <TableCell className="text-right tabular-nums text-neon-rose">{pct(trial.strategy.maxDD, 1, false)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNum(trial.strategy.sharpe, 2)}</TableCell>
                      <TableCell className="text-right tabular-nums">{pct(trial.strategy.winRate, 1, false)}</TableCell>
                      <TableCell className="text-right tabular-nums">{trial.strategy.trades}</TableCell>
                      <TableCell className="text-right tabular-nums">{pct(trial.strategy.exposure, 0, false)}</TableCell>
                    </TableRow>
                    <TableRow className="text-muted-foreground">
                      <TableCell>naive: Top-{trial.params.maxPos} โดย ret20</TableCell>
                      <TableCell className="text-right tabular-nums">{pct(trial.naive.cagr)}</TableCell>
                      <TableCell className="text-right tabular-nums">{pct(trial.naive.maxDD, 1, false)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNum(trial.naive.sharpe, 2)}</TableCell>
                      <TableCell className="text-right tabular-nums">{pct(trial.naive.winRate, 1, false)}</TableCell>
                      <TableCell className="text-right tabular-nums">{trial.naive.trades}</TableCell>
                      <TableCell className="text-right tabular-nums">{pct(trial.naive.exposure, 0, false)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              {/* halves + bootstrap + cost grid */}
              <div className="grid gap-3 md:grid-cols-3">
                <Card className="gap-1 px-4 py-3">
                  <div className="text-xs text-muted-foreground">Time-half split (mean/day)</div>
                  <div className="text-sm font-bold tabular-nums">
                    ครึ่งแรก <span className={trial.halves.first > 0 ? "text-neon-green" : "text-neon-rose"}>{trial.halves.first >= 0 ? "+" : ""}{trial.halves.first.toFixed(3)}%</span>
                    {" · "}
                    ครึ่งหลัง <span className={trial.halves.second > 0 ? "text-neon-green" : "text-neon-rose"}>{trial.halves.second >= 0 ? "+" : ""}{trial.halves.second.toFixed(3)}%</span>
                  </div>
                </Card>
                <Card className="gap-1 px-4 py-3">
                  <div className="text-xs text-muted-foreground">Bootstrap CI (กลยุทธ์ − naive, ต่อวัน)</div>
                  <div className="text-sm font-bold tabular-nums">
                    กลาง {trial.bootstrap.mean >= 0 ? "+" : ""}{trial.bootstrap.mean.toFixed(3)}% · 5–95% [{trial.bootstrap.low5.toFixed(3)}%, {trial.bootstrap.high95 >= 0 ? "+" : ""}{trial.bootstrap.high95.toFixed(3)}%]
                  </div>
                  <div className={cn("text-[11px]", trial.bootstrap.low5 > 0 ? "text-neon-green" : "text-neon-amber")}>
                    {trial.bootstrap.low5 > 0 ? "ขอบล่าง > 0 — edge แน่นพอทางสถิติ" : "ขอบล่างยังติดลบ — edge ยังไม่แน่น"}
                  </div>
                </Card>
                <Card className="gap-1 px-4 py-3">
                  <div className="text-xs text-muted-foreground">Cost sensitivity (CAGR)</div>
                  <div className="text-sm font-bold tabular-nums">
                    {trial.costGrid.map((c) => `${c.costBps}bps: ${pct(c.cagr, 0)}`).join(" · ")}
                  </div>
                </Card>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 3) CPCV / Meta-model ────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-neon-purple" aria-hidden />
            CPCV — ทดสอบ meta-model แบบทน leakage
          </CardTitle>
          <CardDescription>
            Combinatorial Purged CV: แบ่งข้อมูลเป็นกลุ่ม เลือก test ทุก combination + purge/embargo
            → ดูการกระจายของ hit rate และ Long−Short gap ข้ามช่วงเวลา
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <NumField id="cp-hold" label="label horizon (วัน)" value={cpcvForm.hold} onValue={(v) => setCpcvForm((f) => ({ ...f, hold: Math.round(v) }))} />
            <NumField id="cp-g" label="กลุ่ม (N)" value={cpcvForm.nGroups} onValue={(v) => setCpcvForm((f) => ({ ...f, nGroups: Math.round(v) }))} />
            <NumField id="cp-k" label="test groups (k)" value={cpcvForm.nTestGroups} onValue={(v) => setCpcvForm((f) => ({ ...f, nTestGroups: Math.round(v) }))} />
            <NumField id="cp-purge" label="purge (วัน)" value={cpcvForm.purge} onValue={(v) => setCpcvForm((f) => ({ ...f, purge: Math.round(v) }))} />
            <NumField id="cp-embargo" label="embargo (วัน)" value={cpcvForm.embargo} onValue={(v) => setCpcvForm((f) => ({ ...f, embargo: Math.round(v) }))} />
            <NumField id="cp-gate" label="hit gate" step={0.05} value={cpcvForm.hitGate} onValue={(v) => setCpcvForm((f) => ({ ...f, hitGate: v }))} />
          </div>

          {/* presets — ชุดค่าที่ผ่านการพิสูจน์แล้ว กันมือปนเปื้อน */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-muted-foreground">ชุดค่าพร้อมใช้:</span>
            <Button type="button" variant="secondary" size="sm" className="h-7 border border-neon-cyan/30 bg-neon-cyan/10 text-xs text-neon-cyan hover:bg-neon-cyan/20" onClick={applySpecPreset}>
              <Sparkles className="size-3" aria-hidden /> สเปกมาตรฐาน 6/2/10/10
            </Button>
            <Button type="button" variant="secondary" size="sm" className="h-7 border border-neon-purple/30 bg-neon-purple/10 text-xs text-[#8b5cf6] hover:bg-neon-purple/20" onClick={applyAutoPreset}>
              ผูก horizon (auto: purge=hold · embargo=hold/2)
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => runCpcv(false)} disabled={cpcvRunning} variant="outline">
              {cpcvRunning ? <Loader2 className="size-4 animate-spin" /> : <span aria-hidden>▶</span>}
              {cpcvRunning ? "กำลังรัน CPCV..." : "รัน CPCV"}
            </Button>
            {cpcv?.metaPass && (
              <Button onClick={() => runCpcv(true)} disabled={cpcvRunning} className="bg-neon-purple text-white hover:bg-neon-purple/85">
                <ShieldCheck className="size-4" aria-hidden /> เปิดใช้ meta-sizing (deploy โมเดล)
              </Button>
            )}
            {model?.enabled && (
              <Button variant="ghost" size="sm" onClick={disableModel} disabled={busy !== null} className="text-neon-rose">
                <ShieldX className="size-3.5" aria-hidden /> ปิดโมเดล
              </Button>
            )}
            {model?.enabled ? (
              <Badge variant="outline" className="border-neon-purple/40 bg-neon-purple/10 text-[#8b5cf6]">
                โมเดลเปิดใช้ · hold {model.hold}d · AUC {model.auc?.toFixed(3)} · {fmtTime(model.trainedAt ?? "")}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">ยังไม่มีโมเดล (Jev ใช้กติกาธรรมดา)</Badge>
            )}
          </div>

          {cpcvError && (
            <Alert variant="destructive">
              <AlertTitle>รัน CPCV ไม่สำเร็จ</AlertTitle>
              <AlertDescription>{cpcvError}</AlertDescription>
            </Alert>
          )}

          {cpcv && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={cpcv.metaPass ? "border-neon-green/40 text-[#10b981]" : "border-neon-rose/40 text-[#f43f5e]"}>
                  {cpcv.metaPass ? "ผ่านเกณฑ์ meta-model" : "ไม่ผ่านเกณฑ์ meta-model"}
                </Badge>
                {cpcv.deployed && <Badge className="bg-neon-purple text-white">deployed → Jev sizing ×0.5–1.5</Badge>}
                <span className="text-xs text-muted-foreground">
                  panel {cpcv.panelN.toLocaleString()} แถว · {cpcv.paths} paths · {cpcv.tookMs} ms
                  {cpcv.skipped > 0 ? ` · ข้าม ${cpcv.skipped} path` : ""}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Card className="gap-1 px-4 py-3">
                  <div className="text-xs text-muted-foreground">Mean Hit ± Std</div>
                  <div className="text-lg font-bold tabular-nums">
                    {(cpcv.meanHit * 100).toFixed(1)}% <span className="text-xs font-normal text-muted-foreground">± {(cpcv.stdHit * 100).toFixed(1)}</span>
                  </div>
                </Card>
                <Card className="gap-1 px-4 py-3">
                  <div className="text-xs text-muted-foreground">Mean AUC / pooled</div>
                  <div className="text-lg font-bold tabular-nums">
                    {cpcv.meanAuc.toFixed(3)} <span className="text-xs font-normal text-muted-foreground">/ {cpcv.pooledAuc.toFixed(3)}</span>
                  </div>
                </Card>
                <Card className="gap-1 px-4 py-3">
                  <div className="text-xs text-muted-foreground">% paths ที่ Hit &gt; {(cpcv.params.hitGate * 100).toFixed(0)}%</div>
                  <div className={cn("text-lg font-bold tabular-nums", cpcv.pctAbove >= 0.6 ? "text-neon-green" : "text-neon-amber")}>
                    {(cpcv.pctAbove * 100).toFixed(0)}%
                  </div>
                </Card>
                <Card className="gap-1 px-4 py-3">
                  <div className="text-xs text-muted-foreground">Long − Short gap</div>
                  <div className={cn("text-lg font-bold tabular-nums", cpcv.avgGap > 0 ? "text-neon-green" : "text-neon-rose")}>
                    {cpcv.avgGap >= 0 ? "+" : ""}{cpcv.avgGap.toFixed(2)}%
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    long {cpcv.avgLong.toFixed(2)}% · short {cpcv.avgShort.toFixed(2)}%
                  </div>
                </Card>
              </div>

              {/* ภาพการกระจายผล — หัวใจของ CPCV (hit/gap/AUC ต่อ path + histogram) */}
              <CpcvCharts result={cpcv} />

              {cpcv.pathRows.length > 0 && (
                <ScrollArea className="max-h-72 pr-3">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Path</TableHead>
                        <TableHead className="text-right">n</TableHead>
                        <TableHead className="text-right">Hit</TableHead>
                        <TableHead className="text-right">AUC</TableHead>
                        <TableHead className="text-right">Long %</TableHead>
                        <TableHead className="text-right">Short %</TableHead>
                        <TableHead className="text-right">Gap %</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cpcv.pathRows.map((r) => (
                        <TableRow key={r.path}>
                          <TableCell className="font-mono">#{r.path}</TableCell>
                          <TableCell className="text-right tabular-nums">{r.n}</TableCell>
                          <TableCell className={cn("text-right tabular-nums", r.hit > cpcv.params.hitGate ? "text-neon-green" : "")}>
                            {(r.hit * 100).toFixed(1)}%
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{r.auc.toFixed(3)}</TableCell>
                          <TableCell className="text-right tabular-nums text-neon-green">{r.longRet.toFixed(2)}</TableCell>
                          <TableCell className="text-right tabular-nums text-neon-rose">{r.shortRet.toFixed(2)}</TableCell>
                          <TableCell className="text-right tabular-nums font-medium">{r.gap.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </div>
          )}

          {/* cpcv history */}
          {cpcvStatus.data && cpcvStatus.data.runs.length > 0 && (
            <div className="space-y-1.5">
              <Separator />
              <p className="pt-1 text-xs font-medium text-muted-foreground">รอบ CPCV ล่าสุด</p>
              {cpcvStatus.data.runs.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-xs">
                  <span>
                    <span className="font-mono text-muted-foreground">#{r.id}</span> · hit{" "}
                    {(r.meanHit * 100).toFixed(1)}% · {r.paths} paths · gap {r.avgGap.toFixed(2)}%
                  </span>
                  <span className="flex items-center gap-2 text-muted-foreground">
                    {fmtTime(r.createdAt)}
                    <Badge variant="outline" className={r.verdict === "PASS" ? "border-neon-green/40 text-neon-green" : "border-neon-rose/40 text-neon-rose"}>
                      {r.verdict}
                    </Badge>
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 4) Event audit ──────────────────────────────────────── */}
      <Card className="neon-card-cyan">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-neon-cyan" aria-hidden />
            Event Audit — hash chain
          </CardTitle>
          <CardDescription>
            ทุกเหตุการณ์สำคัญ (seed, ingest, backtest, jev, gate, research) ถูกผูกด้วย sha256 — แก้ log ย้อนหลังไม่ได้โดยไม่พังทั้งสาย
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {audit.loading && !audit.data ? (
            <Skeleton className="h-20 w-full" />
          ) : audit.error ? (
            <Alert variant="destructive">
              <AlertTitle>โหลด audit ไม่สำเร็จ</AlertTitle>
              <AlertDescription>{audit.error}</AlertDescription>
            </Alert>
          ) : audit.data ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={audit.data.ok ? "border-neon-green/40 bg-neon-green/10 text-[#10b981]" : "border-neon-rose/40 bg-neon-rose/10 text-[#f43f5e]"}>
                  {audit.data.ok ? "✓ chain ครบถ้วน" : `✗ chain พังที่ event #${audit.data.brokenAt}`}
                </Badge>
                <span className="text-xs text-muted-foreground">รวม {audit.data.total} เหตุการณ์</span>
              </div>
              {audit.data.events.length > 0 && (
                <ScrollArea className="max-h-64 pr-3">
                  <div className="space-y-1 font-mono text-[11px] leading-relaxed">
                    {audit.data.events.map((e) => (
                      <div key={e.id} className="rounded border border-border/60 px-2 py-1">
                        <span className="text-muted-foreground">#{e.id}</span>{" "}
                        <span className="text-[#f59e0b]">{e.kind}</span>{" "}
                        <span className="text-muted-foreground">({e.actor})</span>{" "}
                        <span className="text-[#0e7490]">{e.payload.slice(0, 110)}{e.payload.length > 110 ? "…" : ""}</span>{" "}
                        <span className="text-muted-foreground">{fmtTime(e.ts)}</span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
