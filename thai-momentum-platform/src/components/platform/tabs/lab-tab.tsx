"use client"

import { useMemo, useState, type ReactNode } from "react"
import {
  AlertTriangle,
  Beaker,
  BookOpen,
  CheckCircle2,
  FlaskConical,
  Gauge,
  Inbox,
  Loader2,
  Play,
  Scale,
  ShieldAlert,
  Tag,
  Target,
  TrendingUp,
  XCircle,
} from "lucide-react"
import { postJson, useApi } from "@/hooks/use-api"
import { toast } from "@/hooks/use-toast"
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Slider } from "@/components/ui/slider"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { AXIS_TICK, AXIS_TICK_11, CHART, TOOLTIP_STYLE } from "../chart-theme"
import ScrollBox from "../scroll-box"

/* ────────────────────────────── TOOLTIP_STYLE — เดียวกับแท็บอื่น ────────────────────────────── */

/* ────────────────────────────── types ────────────────────────────── */

interface LabGateResult {
  key?: string
  label?: string
  value?: number | null
  threshold?: number | null
  pass?: boolean
}

interface LabEvalResult {
  approved?: boolean
  verdict?: string
  gates?: LabGateResult[]
  tookMs?: number
}

interface LabStats {
  total?: number
  logs?: number
  agreementRate?: number | null
  executed?: number
  wouldExecute?: number
  brier?: number | null
}

interface LabDisagreement {
  id?: number | string
  date: string
  asset: string
  rule: string | null // null = NO_TRADE (API คง null ตามจริง)
  nimble: string
  conf?: number | null
}

interface LabBin {
  bin?: string
  label?: string
  pred?: number | null
  real?: number | null
  n?: number | null
}

interface LabPnlRow {
  date?: string
  cumR?: number | null
}

interface LabGateKill {
  gate?: string
  name?: string
  kills?: number
  count?: number
}

interface LabEdgeRow {
  id: number | string
  date?: string
  asset?: string
  rule?: string
  nimble?: string
  conf?: number | null
  wick?: number | null
  closePos?: number | string | null
  ruleSummary?: string | null
  nimbleSummary?: string | null
}

interface LabWeeklyMetric {
  pct?: number | null
  n?: number | null
}

interface LabWeekly {
  gutVsRule?: LabWeeklyMetric
  labelVsRule?: LabWeeklyMetric
  labelVsNimble?: LabWeeklyMetric
}

// shape ตรงจาก GET /api/lab/dashboard — ค่า *Pct เป็น "เปอร์เซ็นต์" (0–100) ไม่ใช่สัดส่วน
interface LabWeeklyApi {
  n?: number | null
  gutN?: number | null
  gutRulePct?: number | null
  labelRulePct?: number | null
  labelNimblePct?: number | null
}

interface LabAgreement {
  rules?: string[]
  nimble?: string[]
  matrix?: number[][] | Record<string, Record<string, number>> | { rows: string[]; cols: string[]; cells: number[][] }
  rows?: string[]
  cols?: string[]
  cells?: number[][]
}

interface LabDashboard {
  stats?: LabStats
  logs?: unknown[]
  total?: number
  agreementRate?: number | null
  executed?: number
  brier?: number | null
  agreement?: LabAgreement
  // รองรับ shape ตรงจาก API: matrix {rows,cols,cells} + gateKill [{gate,kills}] + expectancy
  matrix?: { rows: string[]; cols: string[]; cells: number[][] }
  gateKill?: { gate: string; kills: number }[]
  expectancy?: number | null
  brierN?: number | null
  disagreements?: LabDisagreement[]
  calibration?: LabBin[]
  pnl?: LabPnlRow[]
  expectancyR?: number | null
  executedN?: number | null
  gateKills?: Record<string, number> | LabGateKill[]
  gates?: LabGateKill[]
  edgeQueue?: LabEdgeRow[]
  weekly?: LabWeekly | LabWeeklyApi
  lastEval?: LabEvalResult | null
}

interface LabRunResponse {
  created?: number
  updated?: number
  count?: number
  n?: number
  message?: string
}

// shape ตรงจาก POST /api/lab/eval
interface LabEvalApiResponse {
  ok?: boolean
  results?: {
    syntheticAgreement?: number | null
    humanEdgeAgreement?: number | null
    brier?: number | null
    grammarValidity?: number | null
    noRegression?: boolean | null
    passed?: boolean | null
    promotion?: string | null
  }
  details?: {
    gate1?: { n?: number; agree?: number } | null
    gate2?: { n?: number; agree?: number } | null
    gate5?: { n?: number; baseAgree?: number; newAgree?: number } | null
  }
}

type LabEvalResponse = LabEvalResult & LabEvalApiResponse

interface LabLabelResponse {
  ok?: boolean
  message?: string
}

/* ────────────────────────────── constants + helpers ────────────────────────────── */

const ORIGIN_LABEL: Record<string, string> = {
  mix: "ผสม (mix)",
  synth: "สังเคราะห์ (synth)",
  panel: "จากแผงสัญญาณจริง (panel)",
}

const REASON_LABEL: Record<string, string> = {
  TRIG_WEAK: "ทริกเกอร์อ่อน — แท่งยืนยันไม่คม",
  ZONE_THIN: "โซนบาง — แนวรับ/แนวต้านไม่ชัด",
  REGIME_BORDER: "รีจิมอยู่ริมเส้น — ไม่ชัด risk_on/off",
  NEWS_OVERHANG: "มีข่าวค้าง — ความเสี่ยง event",
  FOMO_URGE: "อารมณ์ FOMO — อยากตามแท่งเขียว",
  FEAR_URGE: "อารมณ์กลัว — พลาดเพราะลังเล",
  DATA_GAP: "ข้อมูลมีรู — ราคา/ปริมาณไม่ครบ",
  OTHER: "อื่น ๆ",
}

const GATE_TH: Record<string, string> = {
  regime: "รีจิม",
  selection: "คัดเลือก",
  level: "โซนราคา",
  trigger: "ทริกเกอร์",
  risk: "ความเสี่ยง",
}

const SCROLL_CLS =
  "[&::-webkit-scrollbar]:size-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-foreground/10 [&::-webkit-scrollbar-track]:bg-transparent"

function pctFrac(x: number | null | undefined, d = 1, sign = false): string {
  if (x === null || x === undefined || !isFinite(x)) return "—"
  const s = sign && x >= 0 ? "+" : ""
  return `${s}${(x * 100).toFixed(d)}%`
}

function fmtR(x: number | null | undefined, d = 2): string {
  if (x === null || x === undefined || !isFinite(x)) return "—"
  return `${x >= 0 ? "+" : ""}${x.toFixed(d)}R`
}

function fmtVal(x: number | null | undefined): string {
  if (x === null || x === undefined || !isFinite(x)) return "—"
  return Math.abs(x) <= 1.0001 ? x.toFixed(3) : x.toFixed(2)
}

function fmtTime(iso: string | undefined): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString("th-TH", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
}

function num(v: unknown): number | null {
  return typeof v === "number" && isFinite(v) ? v : null
}

// แปลงผล POST /api/lab/eval ({results, details}) → view 5 ด่าน (ด่านที่ข้าม = null ถือว่าผ่านตามกติกา route)
function evalViewOf(r: LabEvalResponse): LabEvalResult {
  if (Array.isArray(r.gates)) return r
  const res = r.results
  if (!res) return r
  const g5 = r.details?.gate5
  const g5n = num(g5?.n)
  const frac = (v: unknown) => {
    const x = num(v)
    return x !== null && g5n !== null && g5n > 0 ? x / g5n : null
  }
  const s1 = num(res.syntheticAgreement)
  const s2 = num(res.humanEdgeAgreement)
  const s3 = num(res.brier)
  const s4 = num(res.grammarValidity)
  const approved = res.passed === true
  return {
    approved,
    verdict: res.promotion ?? (approved ? "APPROVED" : "REJECTED"),
    gates: [
      { key: "g1", label: "G1 synthetic agreement ≥0.97", value: s1, threshold: 0.97, pass: s1 !== null && s1 >= 0.97 },
      {
        key: "g2",
        label: s2 === null ? "G2 human edge (ข้าม — ยังไม่มี label)" : "G2 human edge ≥0.85",
        value: s2,
        threshold: 0.85,
        pass: s2 === null || s2 >= 0.85,
      },
      {
        key: "g3",
        label: s3 === null ? "G3 Brier (ข้าม — outcome < 10 แถว)" : "G3 Brier <0.15",
        value: s3,
        threshold: 0.15,
        pass: s3 === null || s3 < 0.15,
      },
      { key: "g4", label: "G4 grammar = 1.00", value: s4, threshold: 1, pass: s4 === 1 },
      {
        key: "g5",
        label: "G5 no-regression (ใหม่ / base)",
        value: frac(g5?.newAgree),
        threshold: frac(g5?.baseAgree),
        pass: res.noRegression === true,
      },
    ],
  }
}

// weekly จาก API (เปอร์เซ็นต์) → สัดส่วน 0–1 ให้ตรงกับ pctFrac และเกณฑ์ 0.3 / 0.1 ในการ์ด
function weeklyViewOf(w: LabWeekly | LabWeeklyApi | undefined): LabWeekly | undefined {
  if (!w) return undefined
  const a = w as LabWeeklyApi
  if (!("gutRulePct" in a || "labelRulePct" in a || "labelNimblePct" in a)) return w as LabWeekly
  const frac = (v: unknown) => {
    const x = num(v)
    return x === null ? null : x / 100
  }
  const n = num(a.n)
  return {
    gutVsRule: { pct: frac(a.gutRulePct), n: num(a.gutN) ?? n },
    labelVsRule: { pct: frac(a.labelRulePct), n },
    labelVsNimble: { pct: frac(a.labelNimblePct), n },
  }
}

interface MatrixView {
  rows: string[]
  cols: string[]
  get: (r: number, c: number) => number | null
}

function agreementMatrix(a?: LabAgreement): MatrixView | null {
  if (!a) return null
  // API ตรง: {rows, cols, cells}
  const shaped = a.matrix as { rows?: string[]; cols?: string[]; cells?: number[][] } | undefined
  const shapedCells = shaped?.cells
  if (shaped && !Array.isArray(shaped) && Array.isArray(shaped.rows) && Array.isArray(shapedCells)) {
    return {
      rows: shaped.rows,
      cols: shaped.cols ?? [],
      get: (r, c) => num(shapedCells[r]?.[c]),
    }
  }
  if (Array.isArray(a.cells)) {
    const rows = a.rows && a.rows.length > 0 ? a.rows : a.cells.map((_, i) => `R${i + 1}`)
    const cols = a.cols && a.cols.length > 0 ? a.cols : (a.cells[0]?.map((_, i) => `N${i + 1}`) ?? [])
    return { rows, cols, get: (r, c) => num(a.cells?.[r]?.[c]) }
  }
  const m = a.matrix
  if (!m) return null
  if (Array.isArray(m)) {
    const rows = a?.rules && a.rules.length > 0 ? a.rules : m.map((_, i) => `R${i + 1}`)
    const cols = a?.nimble && a.nimble.length > 0 ? a.nimble : (m[0]?.map((_, i) => `N${i + 1}`) ?? [])
    return { rows, cols, get: (r, c) => num(m[r]?.[c]) }
  }
  const rows = Object.keys(m)
  const cols = rows.length > 0 ? Object.keys(m[rows[0]]) : []
  return {
    rows,
    cols,
    get: (r, c) => {
      const v = m[rows[r]]?.[cols[c]]
      return v === undefined ? null : Number(v)
    },
  }
}

function gateKillData(d: LabDashboard | null): { gate: string; kills: number }[] {
  const ORDER = ["regime", "selection", "level", "trigger", "risk"]
  const raw = d?.gateKills ?? (Array.isArray(d?.gates) ? d?.gates : null) ?? d?.gateKill ?? null
  if (!raw) return []
  const rec: Record<string, number> = {}
  if (Array.isArray(raw)) {
    for (const g of raw) {
      const pair = _gateKillRec(g)
      if (pair) rec[pair.gate] = pair.kills
    }
  } else {
    for (const [k, v] of Object.entries(raw)) rec[k.toLowerCase()] = Number(v)
  }
  const main = ORDER.filter((k) => k in rec).map((k) => ({ gate: GATE_TH[k] ?? k, kills: rec[k] }))
  const extra = Object.keys(rec)
    .filter((k) => !ORDER.includes(k))
    .map((k) => ({ gate: GATE_TH[k] ?? k, kills: rec[k] }))
  return [...main, ...extra]
}

function _gateKillRec(g: unknown): { gate: string; kills: number } | null {
  const o = g as Record<string, unknown>
  const k = String(o.gate ?? o.name ?? "").toLowerCase()
  const v = o.kills ?? o.count
  if (k && v !== undefined) return { gate: k, kills: Number(v) }
  return null
}

function confBadgeCls(conf: number | null | undefined): string {
  if (conf === null || conf === undefined || !isFinite(conf)) return "border-border bg-foreground/5 text-muted-foreground"
  if (conf >= 0.8) return "border-neon-green/40 bg-neon-green/10 text-neon-green"
  if (conf >= 0.6) return "border-neon-amber/40 bg-neon-amber/10 text-neon-amber"
  return "border-border bg-foreground/5 text-foreground/80"
}

/* ────────────────────────────── KPI card ────────────────────────────── */

function Kpi({
  icon: Icon,
  label,
  value,
  sub,
  valueCls,
  badge,
}: {
  icon: typeof Gauge
  label: string
  value: string
  sub?: string
  valueCls?: string
  badge?: ReactNode
}) {
  return (
    <Card className="min-w-0 gap-1.5 py-4">
      <CardContent className="space-y-1.5 px-4">
        <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <Icon className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{label}</span>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn("min-w-0 truncate text-xl font-bold tabular-nums", valueCls)}>{value}</span>
          {badge}
        </div>
        {sub ? <p className="min-w-0 truncate text-[11px] text-muted-foreground">{sub}</p> : null}
      </CardContent>
    </Card>
  )
}

/* ────────────────────────────── main ────────────────────────────── */

export default function LabTab() {
  const lab = useApi<LabDashboard>("/api/lab/dashboard")

  const [n, setN] = useState(12)
  const [origin, setOrigin] = useState("mix")
  const [batchRunning, setBatchRunning] = useState(false)
  const [evalRunning, setEvalRunning] = useState(false)
  const [evalResult, setEvalResult] = useState<LabEvalResult | null>(null)
  const [evalError, setEvalError] = useState<string | null>(null)

  // dialog state
  const [editing, setEditing] = useState<LabEdgeRow | null>(null)
  const [gut, setGut] = useState("UNSURE")
  const [labelVal, setLabelVal] = useState("")
  const [reason, setReason] = useState("OTHER")
  const [confLabel, setConfLabel] = useState(3)
  const [labelBusy, setLabelBusy] = useState(false)

  const d = lab.data
  const stats = useMemo(() => {
    const s = d?.stats ?? {}
    return {
      total: num(s.total) ?? num(s.logs) ?? num(d?.total) ?? (Array.isArray(d?.logs) ? d.logs.length : 0),
      agreementRate: num(s.agreementRate) ?? num(d?.agreementRate),
      executed: num(s.executed) ?? num(s.wouldExecute) ?? num(d?.executed) ?? 0,
      brier: num(s.brier) ?? num(d?.brier),
    }
  }, [d])

  const matrix = useMemo(() => agreementMatrix(d?.agreement ?? (d as unknown as LabAgreement)), [d])
  // rule null = NO_TRADE ตามสัญญา API (ไม่ใช่ "ไม่รู้")
  const disagreements = (d?.disagreements ?? []).slice(0, 20).map((x) => ({ ...x, rule: x.rule ?? "NO_TRADE" }))
  const gateKills = useMemo(() => gateKillData(d), [d])
  // normalize edgeQueue จาก API: {key, wickRatio, closePos} → {id, wick, closePos}
  const edgeQueue: LabEdgeRow[] = (d?.edgeQueue ?? []).map((raw, i) => {
    const r = raw as unknown as Record<string, unknown>
    return {
      id: (r.key as string) ?? (r.id as string) ?? `${String(r.date ?? "")}-${String(r.asset ?? "")}-${i}`,
      date: r.date as string | undefined,
      asset: r.asset as string | undefined,
      rule: (r.rule as string | null | undefined) ?? "NO_TRADE",
      nimble: r.nimble as string | undefined,
      conf: num(r.conf),
      wick: num(r.wickRatio) ?? num(r.wick),
      closePos: (r.closePos as number | string | undefined) ?? (r.close_pos as number | string | undefined),
    }
  })
  const weekly = weeklyViewOf(d?.weekly)
  const evalView = evalResult ?? d?.lastEval ?? null

  const calibData = useMemo(() => {
    const rows = d?.calibration ?? []
    const maxV = Math.max(0, ...rows.flatMap((r) => [num(r.pred) ?? 0, num(r.real) ?? 0]))
    const mult = maxV > 1.5 ? 1 : 100 // ยอมรับทั้ง fraction และ %
    return rows.map((r, i) => ({
      name: r.bin ?? r.label ?? `ถัง ${i + 1}`,
      pred: (num(r.pred) ?? 0) * mult,
      real: (num(r.real) ?? 0) * mult,
      n: r.n ?? null,
    }))
  }, [d])

  const pnlData = useMemo(
    () =>
      (d?.pnl ?? []).map((r) => ({
        date: r.date ?? "",
        cumR: num(r.cumR),
      })),
    [d],
  )

  const expectancyR = num(d?.expectancyR) ?? num(d?.expectancy)
  const executedN = num(d?.executedN)
  // Brier ต้องมี outcome ≥10 แถวก่อนตัดสินผ่าน/ไม่ผ่าน (เกณฑ์เดียวกับ G3 ของ eval) — n น้อยกว่านั้นห้ามโชว์ว่า "ผ่าน"
  const brierN = num(d?.brierN)
  const brierJudgeable = brierN === null || brierN >= 10

  async function runBatch() {
    setBatchRunning(true)
    try {
      const nn = Math.min(24, Math.max(4, Math.round(n) || 12))
      const r = await postJson<LabRunResponse>("/api/lab/run", { n: nn, origin })
      const created = r.created ?? r.count ?? r.n
      const updatedNote = r.updated ? ` · อัปเดต ${r.updated}` : ""
      toast({
        title: "รัน Shadow Batch แล้ว",
        description: r.message ?? `สร้างใหม่ ${created ?? 0} ไม้เงา${updatedNote} (origin: ${ORIGIN_LABEL[origin] ?? origin})`,
      })
      lab.refetch()
    } catch (e) {
      toast({
        title: "รัน Shadow Batch ไม่สำเร็จ",
        description: e instanceof Error ? e.message : "เกิดข้อผิดพลาด",
        variant: "destructive",
      })
    } finally {
      setBatchRunning(false)
    }
  }

  async function runEval() {
    setEvalRunning(true)
    setEvalError(null)
    try {
      const r = evalViewOf(await postJson<LabEvalResponse>("/api/lab/eval", { n: 40 }))
      setEvalResult(r)
      toast({
        title: r.approved ? "Eval Harness ผ่านทั้ง 5 ด่าน" : "Eval Harness ยังไม่ผ่าน",
        description: r.approved
          ? "APPROVED — ระบบเงาพร้อมถูกเลี้ยงต่อ"
          : "REJECTED — ดู gate ที่ตกแล้วไปดริลด์เดือน",
        variant: r.approved ? undefined : "destructive",
      })
      lab.refetch()
    } catch (e) {
      const msg = e instanceof Error ? e.message : "รัน Eval Harness ไม่สำเร็จ"
      setEvalError(msg)
      toast({ title: "รัน Eval Harness ไม่สำเร็จ", description: msg, variant: "destructive" })
    } finally {
      setEvalRunning(false)
    }
  }

  function openLabel(row: LabEdgeRow) {
    setEditing(row)
    setGut("UNSURE")
    setLabelVal("")
    setReason("OTHER")
    setConfLabel(3)
  }

  async function submitLabel() {
    if (!editing || !labelVal || labelBusy) return
    setLabelBusy(true)
    try {
      const r = await postJson<LabLabelResponse>("/api/lab/label", {
        logKey: editing.id, // API ต้องการ logKey (key ของ ShadowLog)
        id: editing.id,
        gut: gut === "UNSURE" ? "" : gut,
        label: labelVal,
        reason,
        confLabel,
      })
      toast({ title: "บันทึก label แล้ว", description: r.message ?? "พิธี 5 นาทีครบ — ขอบคุณที่ซื่อสัตย์กับตัวเอง" })
      setEditing(null)
      lab.refetch()
    } catch (e) {
      toast({
        title: "บันทึก label ไม่สำเร็จ",
        description: e instanceof Error ? e.message : "เกิดข้อผิดพลาด",
        variant: "destructive",
      })
    } finally {
      setLabelBusy(false)
    }
  }

  const noLogs = lab.data !== null && stats.total === 0

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* ── 1) Header — วงจรปิดเงา ──────────────────────────────────── */}
      <Card className="neon-card-magenta">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Beaker className="size-5 text-neon-magenta" aria-hidden />
            Shadow Lab — วงจรปิดเงา (Rule × Nimble × Label)
          </CardTitle>
          <CardDescription>
            เงินจริงยังไม่ถูกแตะ — double-key ทุกไม้ (กฎกับลิ้นต้องเห็นพร้อมกันก่อนบันทึก)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="lab-n" className="text-xs text-muted-foreground">
                จำนวนไม้เงาต่อ batch (4–24)
              </Label>
              <Input
                id="lab-n"
                type="number"
                min={4}
                max={24}
                value={n}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10)
                  if (!Number.isNaN(v)) setN(v)
                }}
                className="h-11 w-full sm:h-9 sm:w-28"
              />
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="lab-origin" className="text-xs text-muted-foreground">
                แหล่ง origin
              </Label>
              <Select value={origin} onValueChange={setOrigin}>
                <SelectTrigger id="lab-origin" className="h-11 w-full min-w-44 sm:h-9 sm:w-56" aria-label="เลือกแหล่ง origin ของไม้เงา">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ORIGIN_LABEL).map(([v, label]) => (
                    <SelectItem key={v} value={v}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={runBatch} disabled={batchRunning} className="h-11 sm:h-9">
              {batchRunning ? <Loader2 className="animate-spin" aria-hidden /> : <Play aria-hidden />}
              {batchRunning ? "กำลังรัน…" : "รัน Shadow Batch"}
            </Button>
            <Button onClick={runEval} disabled={evalRunning} variant="outline" className="h-11 sm:h-9">
              {evalRunning ? <Loader2 className="animate-spin" aria-hidden /> : <FlaskConical aria-hidden />}
              {evalRunning ? "กำลังทดสอบ…" : "รัน Eval Harness"}
            </Button>
          </div>

          {evalRunning && (
            <p className="flex items-center gap-2 text-xs text-neon-amber" role="status">
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              กำลังทดสอบ 5 ด่าน… ใช้เวลา 1–3 นาที — อย่าปิดแท็บนี้
            </p>
          )}

          {evalError && (
            <Alert variant="destructive">
              <AlertTitle>รัน Eval Harness ไม่สำเร็จ</AlertTitle>
              <AlertDescription>{evalError}</AlertDescription>
            </Alert>
          )}

          {evalView && Array.isArray(evalView.gates) && evalView.gates.length > 0 && (
            <Alert>
              <ShieldAlert aria-hidden />
              <AlertTitle>ผล Eval Harness — 5 ด่าน</AlertTitle>
              <AlertDescription className="space-y-2">
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
                  {evalView.gates.map((g, i) => (
                    <div key={g.key ?? i} className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-foreground/[0.03] px-2.5 py-1.5 text-xs">
                      {g.pass ? (
                        <CheckCircle2 className="size-4 shrink-0 text-neon-green" aria-hidden />
                      ) : (
                        <XCircle className="size-4 shrink-0 text-neon-rose" aria-hidden />
                      )}
                      <span className="min-w-0 truncate font-medium">{g.label ?? g.key ?? `gate ${i + 1}`}</span>
                      <span className="ml-auto shrink-0 font-mono text-foreground/80">
                        {fmtVal(num(g.value))}
                        {g.threshold !== null && g.threshold !== undefined ? ` / ${fmtVal(num(g.threshold))}` : ""}
                      </span>
                      <span className={cn("shrink-0 text-[10px]", g.pass ? "text-neon-green" : "text-neon-rose")}>
                        {g.pass ? "ผ่าน" : "ไม่ผ่าน"}
                      </span>
                    </div>
                  ))}
                </div>
                <div
                  role="status"
                  className={cn(
                    "rounded-lg border px-4 py-3 text-center text-lg font-bold tracking-widest",
                    evalView.approved
                      ? "border-neon-green/40 bg-neon-green/10 text-neon-green shadow-[0_1px_2px_rgba(16,24,40,0.06)]"
                      : "border-neon-rose/40 bg-neon-rose/10 text-neon-rose shadow-[0_1px_2px_rgba(16,24,40,0.06)]",
                  )}
                >
                  {evalView.approved ? "✓ APPROVED — ผ่านทั้ง 5 ด่าน" : "✗ REJECTED — ยังไม่ผ่าน"}
                </div>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* ── empty / loading states ──────────────────────────────────── */}
      {lab.loading && !lab.data ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : lab.error && !lab.data ? (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>โหลด Shadow Lab ไม่สำเร็จ</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>{lab.error}</span>
            <Button variant="outline" size="sm" className="h-11 sm:h-8" onClick={() => lab.refetch()}>
              <Loader2 className="size-4" aria-hidden /> ลองใหม่
            </Button>
          </AlertDescription>
        </Alert>
      ) : noLogs ? (
        <Card className="neon-card-green">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <Beaker className="size-8 text-neon-green" aria-hidden />
            <p className="text-sm font-medium">ยังไม่มีบันทึกไม้เงา — แล็บยังว่างเปล่า</p>
            <p className="max-w-md text-xs text-muted-foreground">
              รัน Shadow Batch เพื่อสร้างไม้เงาชุดแรก แล้วเริ่มพิธี 5 นาที (rule × nimble × label)
            </p>
            <Button onClick={runBatch} disabled={batchRunning} className="h-11 sm:h-10">
              {batchRunning ? <Loader2 className="animate-spin" aria-hidden /> : <Play aria-hidden />}
              {batchRunning ? "กำลังรัน…" : "รัน Shadow Batch"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ── 2) Stats row ────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi icon={Inbox} label="บันทึกไม้เงาทั้งหมด" value={stats.total.toLocaleString()} sub="ทุก origin สะสม" />
            <Kpi
              icon={Scale}
              label="Agreement rate (Rule × Nimble)"
              value={pctFrac(stats.agreementRate)}
              valueCls={stats.agreementRate !== null && stats.agreementRate >= 0.7 ? "text-neon-green" : undefined}
              sub="สองกุญแจตรงกันกี่ %"
            />
            <Kpi
              icon={TrendingUp}
              label="Executed (wouldExecute)"
              value={stats.executed.toLocaleString()}
              sub="ไม้ที่จะถูกลงมือจริงถ้าไม่เงา"
            />
            <Kpi
              icon={Target}
              label="Brier score"
              value={stats.brier === null ? "—" : stats.brier.toFixed(3)}
              badge={
                stats.brier !== null && !brierJudgeable ? (
                  <Badge variant="outline" className="border-border bg-foreground/5 text-[10px] text-muted-foreground">
                    n={brierN} (&lt;10) ยังน้อยเกินตัดสิน
                  </Badge>
                ) : stats.brier !== null ? (
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px]",
                      stats.brier < 0.15
                        ? "border-neon-green/40 bg-neon-green/10 text-neon-green"
                        : "border-neon-amber/40 bg-neon-amber/10 text-neon-amber",
                    )}
                  >
                    {stats.brier < 0.15 ? "ผ่านเกณฑ์ <0.15" : "ยังเกินเกณฑ์"}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-border bg-foreground/5 text-[10px] text-muted-foreground">
                    ยังวัดไม่ได้
                  </Badge>
                )
              }
              sub="conf ต้องสอบเทียบกับชนะจริง"
            />
          </div>

          {/* ── 3) Agreement matrix + disagreements ─────────────────── */}
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Scale className="size-4 text-neon-cyan" aria-hidden />
                Agreement Matrix — Rule × Nimble
              </CardTitle>
              <CardDescription>
                แถว = กฎ คอลัมน์ = Nimble · เส้นทแยง (เขียว) = เห็นตรงกัน · นอกเส้น (แดง) = เห็นต่าง — ไม้ต่างกันจะไม่ถูกลงมือ
              </CardDescription>
            </CardHeader>
            <CardContent className="min-w-0 space-y-3">
              {matrix && matrix.rows.length > 0 ? (
                <div className="min-w-0 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="whitespace-nowrap">Rule ↓ · Nimble →</TableHead>
                        {matrix.cols.map((c) => (
                          <TableHead key={c} className="whitespace-nowrap font-mono text-xs">
                            {c}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {matrix.rows.map((r, ri) => (
                        <TableRow key={r}>
                          <TableCell className="whitespace-nowrap font-mono text-xs">{r}</TableCell>
                          {matrix.cols.map((c, ci) => {
                            const v = matrix.get(ri, ci)
                            const diag = ri === ci
                            return (
                              <TableCell key={c} className="p-1">
                                <div
                                  className={cn(
                                    "flex h-9 min-w-12 items-center justify-center rounded px-2 font-mono text-xs tabular-nums",
                                    diag ? "bg-neon-green/10 text-neon-green" : "bg-neon-rose/10 text-neon-rose",
                                    v === null && "text-muted-foreground",
                                  )}
                                  title={diag ? `${r} = ${c} (เห็นตรงกัน)` : `${r} ≠ ${c} (เห็นต่าง)`}
                                >
                                  {v === null ? "—" : v.toLocaleString()}
                                </div>
                              </TableCell>
                            )
                          })}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                  ยังไม่มีข้อมูล matrix — รัน Shadow Batch ก่อน
                </p>
              )}

              {disagreements.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">
                    เคสเห็นต่างล่าสุด ({disagreements.length} เคส) — ถูกคุมขังไว้จนกว่าสองกุญแจจะตรงกัน
                  </p>
                  <ScrollBox className={cn("max-h-72 space-y-1 overflow-y-auto pr-1", SCROLL_CLS)} label="รายการที่กฎกับ Nimble เห็นต่าง (เลื่อนดูได้)">
                    {disagreements.map((x, i) => (
                      <div
                        key={x.id ?? `${x.date}-${x.asset}-${i}`}
                        className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-border/60 bg-foreground/[0.02] px-2.5 py-1.5 text-xs"
                      >
                        <span className="font-mono text-[10px] text-muted-foreground">{x.date}</span>
                        <span className="font-mono font-semibold text-foreground">{x.asset}</span>
                        <span className="min-w-0 truncate text-muted-foreground">
                          <span className="text-neon-cyan">{x.rule}</span> → <span className="text-neon-magenta">{x.nimble}</span>
                        </span>
                        <Badge variant="outline" className={cn("ml-auto shrink-0 font-mono text-[10px]", confBadgeCls(x.conf))}>
                          conf {x.conf === null || x.conf === undefined ? "—" : pctFrac(x.conf, 0)}
                        </Badge>
                      </div>
                    ))}
                  </ScrollBox>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── 4) Calibration chart ────────────────────────────────── */}
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="size-4 text-neon-magenta" aria-hidden />
                Calibration — ความมั่นใจ vs ชนะจริง
              </CardTitle>
              <CardDescription>
                conf ต้องสอบเทียบกับชนะจริง — Brier &lt; 0.15 เท่านั้นถึงเลี้ยงโมเดลต่อ
              </CardDescription>
            </CardHeader>
            <CardContent className="min-w-0">
              {calibData.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                  ยังไม่มีข้อมูล calibration — ต้องมี outcome จริงกลับมาก่อน
                </p>
              ) : (
                <div className="min-w-0">
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={calibData} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
                      <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" tick={AXIS_TICK} />
                      <YAxis
                        domain={[0, "auto"]}
                        tick={AXIS_TICK}
                        tickFormatter={(v: number) => `${v.toFixed(0)}%`}
                        width={40}
                      />
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        cursor={{ fill: CHART.cursor }}
                        formatter={(v: number, name: string) => [`${Number(v).toFixed(1)}%`, name === "pred" ? "conf ทำนาย" : "ชนะจริง"]}
                      />
                      <Bar dataKey="pred" name="pred" fill={CHART.magenta} radius={[3, 3, 0, 0]} maxBarSize={28} />
                      <Bar dataKey="real" name="real" fill={CHART.green} radius={[3, 3, 0, 0]} maxBarSize={28} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── 5) Shadow P&L ───────────────────────────────────────── */}
          <Card className="min-w-0">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="size-4 text-neon-green" aria-hidden />
                  Shadow P&amp;L — กำไรสะสม (R)
                </CardTitle>
                <div className="flex items-center gap-2 text-xs">
                  <Badge variant="outline" className="border-neon-green/40 bg-neon-green/10 font-mono text-neon-green">
                    Expectancy {fmtR(expectancyR)}
                  </Badge>
                  <Badge variant="outline" className="border-border bg-foreground/5 font-mono text-foreground/80">
                    executedN {executedN ?? "—"}
                  </Badge>
                </div>
              </div>
              <CardDescription>double-key only — rule และ Nimble ต้องเห็นพร้อมกันถึงจะนับเป็นไม้เงาที่ &quot;ลงมือ&quot;</CardDescription>
            </CardHeader>
            <CardContent className="min-w-0">
              {pnlData.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                  ยังไม่มีบันทึก P&amp;L เงา
                </p>
              ) : (
                <div className="min-w-0">
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={pnlData} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
                      <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="date"
                        tick={AXIS_TICK}
                        tickFormatter={(v: string) => String(v).slice(5)}
                        interval="preserveStartEnd"
                        minTickGap={24}
                      />
                      <YAxis
                        domain={["auto", "auto"]}
                        tick={AXIS_TICK}
                        tickFormatter={(v: number) => `${v.toFixed(1)}R`}
                        width={44}
                      />
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        cursor={{ stroke: CHART.ref }}
                        formatter={(v: number) => fmtR(Number(v))}
                      />
                      <Line type="monotone" dataKey="cumR" name="cumR" stroke={CHART.green} strokeWidth={1.5} dot={false} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── 6) Gate Kill ────────────────────────────────────────── */}
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldAlert className="size-4 text-neon-rose" aria-hidden />
                Gate Kill — setup ถูกฆ่าที่ด่านไหน
              </CardTitle>
              <CardDescription>
                gate ไหนฆ่า setup มากสุด = ดริลเดือนถึงโฟกัส gate นั้น
              </CardDescription>
            </CardHeader>
            <CardContent className="min-w-0">
              {gateKills.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                  ยังไม่มีสถิติ gate — รัน Shadow Batch / Eval Harness ก่อน
                </p>
              ) : (
                <div className="min-w-0">
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={gateKills} layout="vertical" margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
                      <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tick={AXIS_TICK} />
                      <YAxis type="category" dataKey="gate" width={82} tick={AXIS_TICK_11} />
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        cursor={{ fill: CHART.cursor }}
                        formatter={(v: number) => [`${v.toLocaleString()} setup`, "ถูกฆ่า"]}
                      />
                      <Bar dataKey="kills" name="kills" fill={CHART.rose} radius={[0, 4, 4, 0]} maxBarSize={18} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── 7) Edge Queue + Labeling ─────────────────────────────── */}
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Inbox className="size-4 text-neon-amber" aria-hidden />
                Edge Queue + Labeling — พิธี 5 นาที
              </CardTitle>
              <CardDescription>
                เคสที่กฎกับลิ้นเห็นต่าง รอให้คุณติดป้ายความจริง — ซื่อสัตย์ตอนนี้ = LoRA แม่นภายหลัง
              </CardDescription>
            </CardHeader>
            <CardContent className="min-w-0">
              {edgeQueue.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
                  ไม่มี edge case ค้าง — ระบบสงบ
                </p>
              ) : (
                <div className={cn("max-h-96 space-y-1.5 overflow-y-auto pr-1", SCROLL_CLS)}>
                  {edgeQueue.map((row, i) => (
                    <div
                      key={row.id ?? `${row.date}-${row.asset}-${i}`}
                      className="flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-lg border border-border/60 bg-foreground/[0.02] px-3 py-2 text-xs"
                    >
                      <span className="font-mono text-[10px] text-muted-foreground">{row.date ?? "—"}</span>
                      <span className="font-mono font-semibold text-foreground">{row.asset ?? "—"}</span>
                      <span className="min-w-0 truncate text-muted-foreground">
                        <span className="text-neon-cyan">{row.rule ?? "?"}</span> →{" "}
                        <span className="text-neon-magenta">{row.nimble ?? "?"}</span>
                      </span>
                      <Badge variant="outline" className={cn("shrink-0 font-mono text-[10px]", confBadgeCls(row.conf))}>
                        conf {row.conf === null || row.conf === undefined ? "—" : pctFrac(row.conf, 0)}
                      </Badge>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        wick {row.wick === null || row.wick === undefined ? "—" : `${row.wick.toFixed(2)}×`}
                        {" · "}
                        closePos {row.closePos ?? "—"}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openLabel(row)}
                        aria-label={`ติดป้ายเคส ${row.asset ?? ""} วันที่ ${row.date ?? ""}`}
                        className="ml-auto h-11 shrink-0 border-neon-amber/40 bg-neon-amber/10 px-3 text-neon-amber hover:bg-neon-amber/20 sm:h-8"
                      >
                        <Tag className="size-3.5" aria-hidden /> Label
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── 8) Weekly reading ───────────────────────────────────── */}
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="size-4 text-neon-purple" aria-hidden />
                Weekly Reading — อ่านใจตัวเองประจำสัปดาห์
              </CardTitle>
              <CardDescription>สามไม้วัดสุขภาพวงจรปิดเงา — อ่านทุกสัปดาห์ก่อนปรับกติกา</CardDescription>
            </CardHeader>
            <CardContent className="min-w-0">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {(() => {
                  const gutM = weekly?.gutVsRule
                  const lrM = weekly?.labelVsRule
                  const lnM = weekly?.labelVsNimble
                  const rows: { key: string; title: string; hint: string; m: LabWeeklyMetric | undefined; badge: string; cls: string }[] = [
                    {
                      key: "gutVsRule",
                      title: "gut ≠ rule",
                      hint: ">30% → gate จิตวิทยาคุณรั่ว — ลิ้นชนะกฎบ่อยเกิน = ระบบไม่ได้เล่นแทนคุณ",
                      m: gutM,
                      badge: gutM?.pct == null ? "—" : gutM.pct > 0.3 ? "⚠ เฝ้าระวัง" : "✓ ผ่าน",
                      cls:
                        gutM?.pct == null
                          ? "border-border bg-foreground/5 text-muted-foreground"
                          : gutM.pct > 0.3
                            ? "border-neon-amber/40 bg-neon-amber/10 text-neon-amber"
                            : "border-neon-green/40 bg-neon-green/10 text-neon-green",
                    },
                    {
                      key: "labelVsRule",
                      title: "label ≠ rule",
                      hint: ">10% → กฎมีช่องว่างจริง (แก้ได้เดือนละครั้ง)",
                      m: lrM,
                      badge: lrM?.pct == null ? "—" : lrM.pct > 0.1 ? "⚠ เฝ้าระวัง" : "✓ ผ่าน",
                      cls:
                        lrM?.pct == null
                          ? "border-border bg-foreground/5 text-muted-foreground"
                          : lrM.pct > 0.1
                            ? "border-neon-amber/40 bg-neon-amber/10 text-neon-amber"
                            : "border-neon-green/40 bg-neon-green/10 text-neon-green",
                    },
                    {
                      key: "labelVsNimble",
                      title: "label ≠ nimble",
                      hint: "สูงแต่ label=rule → เก็บเคสเป็น edge-set น้ำหนักสูงตอน LoRA",
                      m: lnM,
                      badge:
                        lnM?.pct == null
                          ? "—"
                          : lnM.pct > 0.3 && (lrM?.pct ?? 1) <= 0.1
                            ? "★ edge-set"
                            : "⚠ เฝ้าระวัง",
                      cls:
                        lnM?.pct == null
                          ? "border-border bg-foreground/5 text-muted-foreground"
                          : lnM.pct > 0.3 && (lrM?.pct ?? 1) <= 0.1
                            ? "border-neon-green/40 bg-neon-green/10 text-neon-green"
                            : "border-neon-amber/40 bg-neon-amber/10 text-neon-amber",
                    },
                  ]
                  return rows.map((r) => (
                    <div key={r.key} className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-foreground/[0.03] p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-semibold text-foreground">{r.title}</span>
                        <Badge variant="outline" className={cn("shrink-0 text-[10px]", r.cls)}>
                          {r.badge}
                        </Badge>
                      </div>
                      <p className="text-lg font-bold tabular-nums">
                        {pctFrac(r.m?.pct)}
                        <span className="ml-2 text-[11px] font-normal text-muted-foreground">n = {r.m?.n ?? "—"}</span>
                      </p>
                      <p className="text-[11px] leading-4 text-muted-foreground">{r.hint}</p>
                    </div>
                  ))
                })()}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* ── Label dialog (พิธี 5 นาที) ───────────────────────────────── */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>ติดป้ายเคสเงา — {editing?.asset ?? "—"} ({editing?.date ?? "—"})</DialogTitle>
            <DialogDescription>
              กฎเห็น <span className="font-mono text-neon-cyan">{editing?.ruleSummary ?? editing?.rule ?? "—"}</span> · Nimble เห็น{" "}
              <span className="font-mono text-neon-magenta">{editing?.nimbleSummary ?? editing?.nimble ?? "—"}</span> — ตอบตามที่รู้สึกจริง
              ห้ามเดาสิ่งที่ระบบอยากได้ยิน
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">ลิ้น (gut) บอกว่าอะไร — ก่อนดูคำตอบของกฎ</Label>
              <RadioGroup value={gut} onValueChange={setGut} className="grid-cols-1 sm:grid-cols-3">
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-foreground/[0.03] px-3 py-2.5 text-sm">
                  <RadioGroupItem value="ENTER" aria-label="gut: เข้าไม้" />
                  เข้าไม้ (ENTER)
                </label>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-foreground/[0.03] px-3 py-2.5 text-sm">
                  <RadioGroupItem value="NO_TRADE" aria-label="gut: ไม่เอา" />
                  ไม่เอา (NO_TRADE)
                </label>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-foreground/[0.03] px-3 py-2.5 text-sm">
                  <RadioGroupItem value="UNSURE" aria-label="gut: ไม่แน่ใจ" />
                  ไม่แน่ใจ
                </label>
              </RadioGroup>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lab-label" className="text-xs text-muted-foreground">
                ป้ายจริง (label) — ถ้าย้อนเวลาได้จะทำอะไร
              </Label>
              <Select value={labelVal} onValueChange={setLabelVal}>
                <SelectTrigger id="lab-label" className="h-11 sm:h-9" aria-label="เลือกป้ายจริงของเคสนี้">
                  <SelectValue placeholder="เลือกป้าย" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ENTER_LONG">ENTER_LONG — ควรเข้าซื้อจริง</SelectItem>
                  <SelectItem value="NO_TRADE">NO_TRADE — ไม่ควรทำอะไรเลย</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lab-reason" className="text-xs text-muted-foreground">
                เหตุผลที่ลิ้นกับกฎเห็นต่าง
              </Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger id="lab-reason" className="h-11 sm:h-9" aria-label="เลือกเหตุผลที่เห็นต่าง">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(REASON_LABEL).map(([v, label]) => (
                    <SelectItem key={v} value={v}>
                      <span className="font-mono text-xs">{v}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="lab-conf" className="text-xs text-muted-foreground">
                  ความมั่นใจในป้ายนี้ (confLabel)
                </Label>
                <span className="font-mono text-sm font-semibold text-neon-cyan">{confLabel}/5</span>
              </div>
              <Slider
                id="lab-conf"
                min={1}
                max={5}
                step={1}
                value={[confLabel]}
                onValueChange={(v) => setConfLabel(v[0] ?? 3)}
                aria-label="ระดับความมั่นใจ 1 ถึง 5"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground" aria-hidden>
                <span>1 = ลังเลมาก</span>
                <span>5 = แน่นอน 100%</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)} className="h-11 sm:h-9">
              ยกเลิก
            </Button>
            <Button
              onClick={submitLabel}
              disabled={!labelVal || labelBusy}
              className="h-11 bg-neon-green text-on-neon hover:bg-neon-green/85 sm:h-9"
            >
              {labelBusy && <Loader2 className="animate-spin" aria-hidden />}
              บันทึก label
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
