"use client"

import { useMemo, useState, type ReactNode } from "react"
import {
  AlertTriangle,
  CalendarDays,
  ClipboardCheck,
  Database,
  FlaskConical,
  History,
  LayoutGrid,
  Loader2,
  Play,
  RotateCcw,
  SlidersHorizontal,
  TrendingDown,
} from "lucide-react"
import { fmtPct, postJson, useApi } from "@/hooks/use-api"
import { toast } from "@/hooks/use-toast"
import GlobalEnginesPanel from "./global-engines-panel"
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
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"

/* ────────────────────────────── types (ตรงกับ /api/evidence + /api/config/th จริง) ────────────────────────────── */

interface ScanCell {
  form: number
  hold: number
  meanIC?: number | null
  ICIR?: number | null
  icir?: number | null
  t?: number | null
  n?: number | null
}

interface Hypothesis {
  pass?: boolean
  verdict?: string | null
  action?: string | null
  // H1 — best cells
  best?: ScanCell[]
  bestIcir?: number | null
  bestCell?: string | null
  // H2 — Snap-back Reversal
  winRate?: number | null
  avgNet?: number | null
  edgeVsCtrl?: number | null
  stopPct?: number | null
  n?: number | null
  // H3 — Turn-of-Month
  insideMean?: number | null
  outsideMean?: number | null
  t?: number | null
  nIn?: number | null
  // H4 — โมเมนตัมยาว
  longCells?: ScanCell[]
  nLongCells?: number | null
  nPositive?: number | null
}

interface EvidenceRun {
  id?: number | string
  mode?: string
  ranAt?: string
  createdAt?: string
  verdict?: string | null
}

interface ConfigHistoryEntry {
  ts?: number
  at?: string
  ranAt?: string
  updatedBy?: string
  verdict?: Record<string, boolean | string>
  verdicts?: Record<string, boolean | string> | (string | boolean)[]
  note?: string | null
}

interface EvidenceConfig {
  tfWeights?: Record<string, number> | { tf: number | string; weight: number }[]
  tf_weights?: Record<string, number> | { tf: number | string; weight: number }[]
  holdDefault?: number
  hold_default?: number
  calendarOverlay?: boolean
  reversalEnabled?: boolean
  updatedBy?: string
  updatedAt?: string
  history?: ConfigHistoryEntry[]
}

interface EvidenceBucket {
  source: string
  n: number
  winRate?: number | null
  avg?: number | null
}

interface EvidenceReport {
  ranAt?: string
  mode?: string
  updatedBy?: string
  actions?: Record<string, string>
  h1?: Hypothesis | null
  h2?: Hypothesis | null
  h3?: Hypothesis | null
  h4?: Hypothesis | null
  scan?: ScanCell[] | null
  icir?: ScanCell[] | { cells?: ScanCell[] } | null
  runs?: EvidenceRun[]
}

interface EvidenceResponse {
  report: EvidenceReport | null
  config?: EvidenceConfig | null
  buckets?: EvidenceBucket[]
  runs?: EvidenceRun[]
}

type ConfigResponse = EvidenceConfig & { config?: EvidenceConfig }

/* ────────────────────────────── constants + helpers ────────────────────────────── */

const MODE_LABEL: Record<string, string> = {
  all: "ทั้งหมด (H1–H4)",
  scan: "Horizon Scan",
  reversal: "Snap-back Reversal",
  tom: "Turn-of-Month",
}

const SOURCE_LABEL: Record<string, string> = {
  lite: "Lite — ระบบเบา",
  reversal: "Snap-back Reversal",
  human: "Human — มนุษย์เลือกเอง",
  system: "System — ระบบเต็ม",
}

const GATE_ICIR = 0.25
const TOM_GATE_T = 2 // H3 PASS เมื่อ t > 2 (ด้านเดียว)

// สีเดียวกับ Recharts ของแท็บอื่น (emerald-600 / rose-600 — ใช้แบบ rgba เมื่อต้อง map alpha)
const NEON_GREEN_RGB = "5, 150, 105"
const NEON_ROSE_RGB = "225, 29, 72"

const FORMS = [5, 10, 20, 40, 80, 160, 300]
const HOLDS = [3, 5, 10, 20]

function pctFrac(x: number | null | undefined, d = 1, sign = true): string {
  if (x === null || x === undefined || !isFinite(x)) return "—"
  const s = sign && x >= 0 ? "+" : ""
  return `${s}${(x * 100).toFixed(d)}%`
}

function fmt2(x: number | null | undefined): string {
  if (x === null || x === undefined || !isFinite(x)) return "—"
  return x.toFixed(2)
}

function fmtTime(isoOrTs: string | number | undefined): string {
  if (isoOrTs === undefined || isoOrTs === null || isoOrTs === "") return "—"
  const d = typeof isoOrTs === "number" ? new Date(isoOrTs < 1e12 ? isoOrTs * 1000 : isoOrTs) : new Date(isoOrTs)
  if (Number.isNaN(d.getTime())) return String(isoOrTs)
  return d.toLocaleString("th-TH", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
}

async function putJson<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const j = (await r.json()) as T & { error?: string }
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
  return j as T
}

function normalizeConfig(raw: unknown): EvidenceConfig | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>
  const inner = (o.config && typeof o.config === "object" ? o.config : o) as Record<string, unknown>
  const cfg: EvidenceConfig = {
    tfWeights: (inner.tfWeights ?? inner.tf_weights) as EvidenceConfig["tfWeights"],
    holdDefault: typeof inner.holdDefault === "number" ? inner.holdDefault : typeof inner.hold_default === "number" ? inner.hold_default : undefined,
    calendarOverlay: Boolean(inner.calendarOverlay),
    reversalEnabled: Boolean(inner.reversalEnabled),
    updatedBy: typeof inner.updatedBy === "string" ? inner.updatedBy : undefined,
    updatedAt: typeof inner.updatedAt === "string" ? inner.updatedAt : undefined,
    history: Array.isArray(inner.history) ? (inner.history as ConfigHistoryEntry[]) : undefined,
  }
  if (
    cfg.tfWeights === undefined &&
    cfg.holdDefault === undefined &&
    !cfg.calendarOverlay &&
    !cfg.reversalEnabled &&
    !cfg.history
  ) {
    return null
  }
  return cfg
}

function weightsList(cfg: EvidenceConfig | null): { tf: number; w: number }[] {
  const raw = cfg?.tfWeights ?? cfg?.tf_weights
  if (!raw) return []
  const arr = Array.isArray(raw)
    ? raw.map((r) => ({ tf: Number(r.tf), w: Number(r.weight) }))
    : Object.entries(raw).map(([k, v]) => ({ tf: Number(k), w: Number(v) }))
  return arr.filter((r) => isFinite(r.tf) && isFinite(r.w)).sort((a, b) => a.tf - b.tf)
}

function scanCells(report: EvidenceReport | null): ScanCell[] {
  const raw = report?.scan ?? report?.icir ?? null
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  return raw.cells ?? []
}

function cellIcir(c: ScanCell | undefined): number | null {
  // n = 0 → ไม่มีวันที่วัดได้ (ICIR 0 ใน API เป็นค่าเติม ไม่ใช่ผลวัด) → แสดง "—"
  if (c?.n === 0) return null
  const v = c?.ICIR ?? c?.icir
  return typeof v === "number" && isFinite(v) ? v : null
}

function verdictChips(v: ConfigHistoryEntry["verdict"] | ConfigHistoryEntry["verdicts"]): { k: string; v: string }[] {
  if (!v) return []
  if (Array.isArray(v)) {
    return v.map((x, i) => ({ k: `H${i + 1}`, v: x === true || x === "PASS" ? "PASS" : x === false || x === "FAIL" ? "FAIL" : String(x) }))
  }
  return Object.entries(v).map(([k, val]) => ({
    k,
    v: val === true || val === "PASS" ? "PASS" : val === false || val === "FAIL" ? "FAIL" : String(val),
  }))
}

function verdictBadgeCls(v: string | null | undefined): string {
  if (v === "PASS")
    return "border-neon-green/40 bg-neon-green/10 text-neon-green shadow-[0_1px_2px_rgba(16,24,40,0.06)]"
  if (v === "FAIL")
    return "border-neon-rose/40 bg-neon-rose/10 text-neon-rose shadow-[0_1px_2px_rgba(16,24,40,0.06)]"
  return "border-neon-amber/40 bg-neon-amber/10 text-[#f59e0b]"
}

function hypVerdict(h: Hypothesis | null | undefined): { state: "pass" | "fail" | "other" | "none"; label: string | null } {
  if (!h) return { state: "none", label: null }
  if (typeof h.pass === "boolean") return { state: h.pass ? "pass" : "fail", label: h.pass ? "PASS" : "FAIL" }
  if (h.verdict) return { state: h.verdict === "PASS" ? "pass" : h.verdict === "FAIL" ? "fail" : "other", label: h.verdict }
  return { state: "none", label: null }
}

/* ────────────────────────────── การ์ดสมมติฐาน H1–H4 ────────────────────────────── */

function HypothesisCard({
  id,
  icon: Icon,
  title,
  h,
  action,
}: {
  id: string
  icon: typeof FlaskConical
  title: string
  h: Hypothesis | null | undefined
  action: string | null
}) {
  const has = !!h
  const v = hypVerdict(h)

  let stat: ReactNode = "—"
  if (has) {
    if (id === "H1") {
      const best = h?.best?.[0]
      const icir = cellIcir(best)
      stat = (
        <>
          best cell <span className="font-mono">{best ? `${best.form}×${best.hold}` : (h?.bestCell ?? "—")}</span> · ICIR{" "}
          <span className={cn("font-mono font-semibold", (icir ?? 0) > GATE_ICIR ? "text-neon-green" : "text-neon-rose")}>
            {fmt2(icir)}
          </span>
          {best?.t != null && <span className="text-muted-foreground"> · t {fmt2(best.t)}</span>}
          {best?.n != null && <span className="text-muted-foreground"> · n {best.n}</span>}
        </>
      )
    } else if (id === "H2" && h?.n === 0) {
      stat = <>ไม่มีสัญญาณเข้าเกณฑ์ (n 0) — ยังไม่มีไม้ให้วัด win/edge</>
    } else if (id === "H2") {
      stat = (
        <>
          win <span className="font-mono">{pctFrac(h?.winRate)}</span> · avgNet{" "}
          <span className={cn("font-mono", (h?.avgNet ?? 0) >= 0 ? "text-neon-green" : "text-neon-rose")}>{pctFrac(h?.avgNet, 2)}</span> · edge
          vs ctrl{" "}
          <span className={cn("font-mono", (h?.edgeVsCtrl ?? 0) > 0 ? "text-neon-green" : "text-neon-rose")}>
            {pctFrac(h?.edgeVsCtrl, 2)}
          </span>{" "}
          · n <span className="font-mono">{h?.n ?? "—"}</span>
          {h?.stopPct != null && <span className="text-muted-foreground"> · stop {pctFrac(h.stopPct)}</span>}
        </>
      )
    } else if (id === "H3" && h?.nIn === 0) {
      stat = <>ข้อมูลไม่พอ — ไม่มีวันในหน้าต่าง turn-of-month (nIn 0)</>
    } else if (id === "H3") {
      // insideMean/outsideMean จาก API เป็นหน่วย % อยู่แล้ว (thai-fit คูณ 100 ให้) — ห้ามคูณซ้ำ
      stat = (
        <>
          ในเดือน <span className="font-mono">{fmtPct(h?.insideMean, 3)}</span>/วัน vs นอกเดือน{" "}
          <span className="font-mono">{fmtPct(h?.outsideMean, 3)}</span>/วัน · t{" "}
          <span className={cn("font-mono", (h?.t ?? 0) > TOM_GATE_T ? "text-neon-green" : "text-neon-rose")}>{fmt2(h?.t)}</span>
          {h?.nIn != null && <span className="text-muted-foreground"> · nIn {h.nIn}</span>}
        </>
      )
    } else {
      const cells = h?.longCells ?? []
      // นับ long cell ที่ "ยังมีชีวิต" ตามเกณฑ์ H4 (ICIR > 0.25 และวัดได้จริง) — H4 PASS ⇔ 0
      const alive = cells.length > 0 ? cells.filter((c) => (cellIcir(c) ?? 0) > GATE_ICIR).length : (h?.nPositive ?? null)
      stat = (
        <>
          long cells ที่ยังมีชีวิต (ICIR&gt;{GATE_ICIR}){" "}
          <span className={cn("font-mono font-semibold", alive != null && alive > 0 ? "text-neon-rose" : "text-neon-green")}>{alive ?? "—"}</span>
          {cells.length > 0 && (
            <span className="block pt-0.5 font-mono text-[10px] text-muted-foreground">
              {cells.map((c) => `${c.form}×${c.hold} ICIR ${fmt2(cellIcir(c))}`).join(" · ")}
            </span>
          )}
        </>
      )
    }
  }

  return (
    <Card className="min-w-0 gap-2 py-4">
      <CardContent className="space-y-2.5 px-4">
        <div className="flex min-w-0 items-center gap-1.5">
          <Icon className="size-4 shrink-0 text-neon-cyan" aria-hidden />
          <span className="truncate text-xs font-medium text-muted-foreground">
            {id} · {title}
          </span>
        </div>
        {has ? (
          <>
            <div>
              <Badge
                className={cn(
                  "px-2.5 py-1 text-sm font-bold tracking-wide",
                  v.state === "pass" && verdictBadgeCls("PASS"),
                  v.state === "fail" && verdictBadgeCls("FAIL"),
                  v.state === "other" && verdictBadgeCls(v.label),
                )}
              >
                {v.state === "pass" ? "✓ PASS" : v.state === "fail" ? "✗ FAIL" : `● ${v.label ?? "—"}`}
              </Badge>
            </div>
            <p className="min-w-0 text-xs leading-5 text-foreground/80">{stat}</p>
            <p className="min-w-0 text-[11px] leading-4 text-muted-foreground">{action ?? "—"}</p>
          </>
        ) : (
          <div className="space-y-1.5">
            <div className="text-2xl font-bold text-muted-foreground/50">—</div>
            <p className="text-[11px] text-muted-foreground">ยังไม่รันในโหมดนี้</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/* ────────────────────────────── ICIR heatmap (form × hold) ────────────────────────────── */

function Cell({ cell }: { cell: ScanCell | undefined }) {
  const icir = cellIcir(cell)
  const has = icir !== null
  const alpha = has ? Math.min(1, Math.abs(icir) / 0.5) * 0.75 + 0.06 : 0
  const bg = has
    ? `rgba(${icir > 0 ? NEON_GREEN_RGB : NEON_ROSE_RGB}, ${alpha.toFixed(2)})`
    : "rgba(15,23,42,0.03)"
  const pass = has && icir > GATE_ICIR
  return (
    <div
      title={has ? `form ${cell?.form} · hold ${cell?.hold} · ICIR ${icir.toFixed(2)} · n ${cell?.n ?? "—"}` : "ไม่มีข้อมูล cell นี้ (form ยาวทดสอบเฉพาะถือ 10)"}
      className={cn(
        "flex min-w-0 flex-col items-center justify-center rounded px-1 py-1.5",
        pass && "ring-1 ring-neon-green",
      )}
      style={{ backgroundColor: bg }}
    >
      <span className={cn("font-mono text-[11px] leading-3", has ? "text-foreground" : "text-slate-600")}>
        {has ? icir.toFixed(2) : "—"}
      </span>
      <span className="font-mono text-[9px] leading-3 text-muted-foreground">{has && cell?.n != null ? `n=${cell.n}` : ""}</span>
    </div>
  )
}

function FormLabelRow({ label, cell }: { label: number; cell: ScanCell | undefined }) {
  return (
    <>
      <div className="flex items-center rounded bg-foreground/[0.03] px-1 font-mono text-[11px] text-muted-foreground">{label}</div>
      <Cell cell={cell} />
    </>
  )
}

function IcirHeatmap({ cells }: { cells: ScanCell[] }) {
  const map = useMemo(() => {
    const m = new Map<string, ScanCell>()
    for (const c of cells) m.set(`${c.form}x${c.hold}`, c)
    return m
  }, [cells])

  if (cells.length === 0) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-6 w-full" />
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
        <p className="pt-1 text-[11px] text-muted-foreground">ยังไม่มีตาราง ICIR — รัน Evidence Night โหมด scan/all ก่อน</p>
      </div>
    )
  }

  return (
    <div className="min-w-0">
      <div className="grid gap-1" style={{ gridTemplateColumns: "44px repeat(4, minmax(0, 1fr))" }}>
        <div className="flex items-end px-1 pb-1 text-[10px] leading-3 text-muted-foreground">
          form ↓
          <br />
          hold →
        </div>
        {HOLDS.map((h) => (
          <div key={h} className="pb-1 text-center text-[10px] font-medium text-muted-foreground">
            {h} วัน
          </div>
        ))}
        {FORMS.map((f) =>
          HOLDS.map((h) => {
            const cell = map.get(`${f}x${h}`)
            if (h === HOLDS[0]) return <FormLabelRow key={`row-${f}`} label={f} cell={cell} />
            return <Cell key={`${f}-${h}`} cell={cell} />
          }),
        )}
      </div>

      {/* legend */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: `rgba(${NEON_GREEN_RGB}, 0.7)` }} aria-hidden />
          ICIR &gt; 0
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: `rgba(${NEON_ROSE_RGB}, 0.7)` }} aria-hidden />
          ICIR &lt; 0
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm ring-1 ring-neon-green" aria-hidden />
          ICIR&gt;{GATE_ICIR} = ผ่านเกณฑ์ H1
        </span>
        <span>ความเข้มสี = |ICIR|/0.5</span>
      </div>
    </div>
  )
}

/* ────────────────────────────── main ────────────────────────────── */

export default function EvidenceTab() {
  const ev = useApi<EvidenceResponse>("/api/evidence")
  const cfgApi = useApi<ConfigResponse>("/api/config/th")

  const [mode, setMode] = useState("all")
  const [running, setRunning] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)
  // optimistic draft ผูกกับ cfgApi.data ชุดที่ใช้ตอนกด — ใช้ได้จนกว่าข้อมูลสดชุดใหม่จะมาถึง
  // (กันสวิตช์เด้งกลับค่าเก่าระหว่างรอ refetch / ค้างค่าเก่าถ้า refetch ล้มทั้งที่ server บันทึกแล้ว)
  const [cfgDraft, setCfgDraft] = useState<{ cfg: EvidenceConfig; base: ConfigResponse | null } | null>(null)
  const [cfgPending, setCfgPending] = useState(false)

  const report = ev.data?.report ?? null
  const cfg = useMemo(
    () =>
      (cfgDraft && cfgDraft.base === cfgApi.data ? cfgDraft.cfg : null) ??
      normalizeConfig(cfgApi.data) ??
      normalizeConfig(ev.data?.config),
    [cfgApi.data, cfgDraft, ev.data],
  )
  const cells = useMemo(() => scanCells(report), [report])
  // longCells ของ H4 ไม่มี n — เติมจากตาราง scan เพื่อแยก "วัดไม่ได้" (n=0) ออกจาก ICIR 0 จริง
  const h4 = useMemo<Hypothesis | null>(() => {
    const h = report?.h4
    if (!h) return null
    return {
      ...h,
      longCells: h.longCells?.map((c) => ({
        ...c,
        n: c.n ?? cells.find((s) => s.form === c.form && s.hold === c.hold)?.n ?? null,
      })),
    }
  }, [report, cells])

  async function runEvidence(m: string) {
    setRunning(true)
    setRunError(null)
    try {
      const r = await postJson<{ message?: string }>("/api/evidence/run", { mode: m })
      toast({
        title: "Evidence Night เสร็จแล้ว",
        description: r.message ?? `โหมด ${MODE_LABEL[m] ?? m} — ตลาดตอบแล้ว ดูผล H1–H4 ด้านล่าง`,
      })
      ev.refetch()
      cfgApi.refetch()
    } catch (e) {
      const msg = e instanceof Error ? e.message : "รัน Evidence Night ไม่สำเร็จ"
      setRunError(msg)
      toast({ title: "รัน Evidence Night ไม่สำเร็จ", description: msg, variant: "destructive" })
    } finally {
      setRunning(false)
    }
  }

  async function toggleConfig(key: "calendarOverlay" | "reversalEnabled") {
    if (!cfg || cfgPending) return
    const next: EvidenceConfig = { ...cfg, [key]: !cfg[key] }
    setCfgDraft({ cfg: next, base: cfgApi.data }) // optimistic
    setCfgPending(true)
    try {
      await putJson<unknown>("/api/config/th", {
        tfWeights: cfg.tfWeights ?? cfg.tf_weights,
        holdDefault: cfg.holdDefault ?? cfg.hold_default,
        calendarOverlay: next.calendarOverlay,
        reversalEnabled: next.reversalEnabled,
      })
      toast({
        title: "บันทึก config v1 แล้ว",
        description: `${key === "calendarOverlay" ? "calendarOverlay" : "reversalEnabled"} → ${next[key] ? "เปิด" : "ปิด"} (config as data — ใช้ตั้งแต่รอบถัดไป)`,
      })
      // คง draft (= ค่าที่ server ยืนยันแล้ว) ไว้จนข้อมูลสดชุดใหม่มาถึง — draft หมดอายุเองเมื่อ cfgApi.data เปลี่ยน
      cfgApi.refetch()
    } catch (e) {
      setCfgDraft(null) // revert
      toast({
        title: "บันทึก config ไม่สำเร็จ",
        description: e instanceof Error ? e.message : "เกิดข้อผิดพลาด",
        variant: "destructive",
      })
    } finally {
      setCfgPending(false)
    }
  }

  /* ---------- empty / error state ---------- */
  if ((ev.error && !ev.data) || (ev.data && !report)) {
    return (
      <Card className="neon-card-cyan">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="size-5 text-neon-cyan" aria-hidden />
            Evidence Board — ตลาดไทย &quot;ยอม&quot; ให้เราเก็บเบี้ยช่องไหน
          </CardTitle>
          <CardDescription>prior จากวรรณกรรม ≠ คำตอบ — ผู้ตัดสินคือข้อมูลจริง</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {ev.error && (
            <Alert variant="destructive">
              <AlertTriangle />
              <AlertTitle>โหลดหลักฐานไม่สำเร็จ</AlertTitle>
              <AlertDescription>{ev.error}</AlertDescription>
            </Alert>
          )}
          <p className="text-sm text-muted-foreground">ยังไม่มีหลักฐาน — กดรัน Evidence Night เพื่อให้ตลาดตอบครั้งแรก</p>
          <Button onClick={() => runEvidence("all")} disabled={running} className="h-11 sm:h-10">
            {running ? <Loader2 className="animate-spin" aria-hidden /> : <Play aria-hidden />}
            {running ? "กำลังรัน Evidence Night…" : "รัน Evidence Night (โหมดทั้งหมด)"}
          </Button>
          {runError && <p className="text-xs text-neon-rose">{runError}</p>}
        </CardContent>
      </Card>
    )
  }

  if (ev.loading && !ev.data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-36 w-full rounded-xl" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    )
  }

  const runs = [...(ev.data?.runs ?? report?.runs ?? [])]
    .sort((a, b) => new Date(b.createdAt ?? b.ranAt ?? 0).getTime() - new Date(a.createdAt ?? a.ranAt ?? 0).getTime())
    .slice(0, 5)
  const buckets = ev.data?.buckets ?? []
  const weights = weightsList(cfg)
  const history = [...(cfg?.history ?? [])].slice(-6).reverse()
  const updatedBy = cfg?.updatedBy ?? report?.updatedBy

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* ── 1) Header — ควบคุมการรัน Evidence Night ─────────────────── */}
      <Card className="neon-card-cyan">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="size-5 text-neon-cyan" aria-hidden />
            Evidence Board — ตลาดไทย &quot;ยอม&quot; ให้เราเก็บเบี้ยช่องไหน
          </CardTitle>
          <CardDescription>prior จากวรรณกรรม ≠ คำตอบ — ผู้ตัดสินคือข้อมูลจริง</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="evidence-mode" className="text-xs text-muted-foreground">
                โหมดรัน
              </Label>
              <Select value={mode} onValueChange={setMode}>
                <SelectTrigger
                  id="evidence-mode"
                  className="h-11 w-full min-w-44 sm:h-9 sm:w-52"
                  aria-label="เลือกโหมดการรัน Evidence Night"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(MODE_LABEL).map(([v, label]) => (
                    <SelectItem key={v} value={v}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => runEvidence(mode)} disabled={running} className="h-11 sm:h-9">
              {running ? <Loader2 className="animate-spin" aria-hidden /> : <Play aria-hidden />}
              {running ? "กำลังรัน…" : "รัน Evidence Night"}
            </Button>
          </div>

          {runError && (
            <Alert variant="destructive">
              <AlertTitle>รันไม่สำเร็จ</AlertTitle>
              <AlertDescription>{runError}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {updatedBy && (
              <Badge variant="outline" className="border-neon-purple/40 bg-neon-purple/10 font-mono text-[#8b5cf6]">
                updatedBy: {updatedBy}
              </Badge>
            )}
            {report?.ranAt && <span>รันล่าสุด {fmtTime(report.ranAt)}</span>}
            {report?.mode && <span>· โหมด {MODE_LABEL[report.mode] ?? report.mode}</span>}
          </div>

          {runs.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">ประวัติรันล่าสุด:</span>
              {runs.map((r, i) => {
                const verdict = r.verdict ?? "—"
                return (
                  <Badge
                    key={r.id ?? `${r.createdAt}-${i}`}
                    variant="outline"
                    className={cn("font-mono text-[10px]", verdict.includes("PASS") ? verdictBadgeCls("PASS") : verdictBadgeCls("FAIL"))}
                    title={`${MODE_LABEL[r.mode ?? ""] ?? "run"} · ${fmtTime(r.createdAt ?? r.ranAt)}`}
                  >
                    {verdict}
                  </Badge>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 2) H1–H4 verdict row ────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <HypothesisCard
          id="H1"
          icon={FlaskConical}
          title="โมเมนตัมสั้นมีชีวิต"
          h={report?.h1 ?? null}
          action={report?.actions?.H1 ?? report?.h1?.action ?? null}
        />
        <HypothesisCard
          id="H2"
          icon={RotateCcw}
          title="Snap-back Reversal"
          h={report?.h2 ?? null}
          action={report?.actions?.H2 ?? report?.h2?.action ?? null}
        />
        <HypothesisCard
          id="H3"
          icon={CalendarDays}
          title="Turn-of-Month"
          h={report?.h3 ?? null}
          action={report?.actions?.H3 ?? report?.h3?.action ?? null}
        />
        <HypothesisCard
          id="H4"
          icon={TrendingDown}
          title="โมเมนตัมยาวตายตามวรรณกรรม"
          h={h4}
          action={report?.actions?.H4 ?? report?.h4?.action ?? null}
        />
      </div>

      {/* ── 3) ICIR heatmap (form × hold) ───────────────────────────── */}
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LayoutGrid className="size-4 text-neon-magenta" aria-hidden />
            ICIR Heatmap — form × hold (H1)
          </CardTitle>
          <CardDescription>
            แต่ละช่อง = Information-ICIR ของสัญญาณโมเมนตัม form {FORMS[0]}–{FORMS[FORMS.length - 1]} วัน ถือ {HOLDS[0]}–
            {HOLDS[HOLDS.length - 1]} วัน (form 160/300 ทดสอบเฉพาะถือ 10 วัน)
          </CardDescription>
        </CardHeader>
        <CardContent className="min-w-0">
          <IcirHeatmap cells={cells} />
        </CardContent>
      </Card>

      {/* ── 3.5) Global Engine Imports — logic/algorithms จากทั่วโลก ทดสอบบนข้อมูลเรา ── */}
      <GlobalEnginesPanel />

      {/* ── 4) Config v1 + Buckets ──────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <SlidersHorizontal className="size-4 text-neon-amber" aria-hidden />
              Config v1 — Config as Data
            </CardTitle>
            <CardDescription>
              น้ำหนัก timeframe + กติกาปฏิทิน — ตัวเลขชุดนี้คือสิ่งเดียวที่ระบบเทรดอ่าน (แก้ผ่านหลักฐาน ไม่ใช่ความรู้สึก)
            </CardDescription>
          </CardHeader>
          <CardContent className="min-w-0 space-y-4">
            {cfgApi.error && !cfg ? (
              <Alert variant="destructive">
                <AlertTitle>โหลด config ไม่สำเร็จ</AlertTitle>
                <AlertDescription>{cfgApi.error}</AlertDescription>
              </Alert>
            ) : !cfg ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <>
                {/* tf_weights — horizontal bars */}
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">tf_weights (น้ำหนักต่อ timeframe)</p>
                  {weights.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">ยังไม่มีน้ำหนักใน config</p>
                  ) : (
                    weights.map(({ tf, w }) => (
                      <div key={tf} className="flex items-center gap-2">
                        <span className={cn("w-10 shrink-0 font-mono text-[11px]", w > 0 ? "text-foreground/80" : "text-slate-600")}>{tf}D</span>
                        <div className="h-5 min-w-0 flex-1 overflow-hidden rounded bg-foreground/[0.06]">
                          {w > 0 && (
                            <div
                              className="h-full rounded bg-neon-cyan/70 shadow-[0_1px_2px_rgba(16,24,40,0.06)]"
                              style={{ width: `${Math.min(100, w * 100).toFixed(1)}%` }}
                            />
                          )}
                        </div>
                        <span
                          className={cn("w-12 shrink-0 text-right font-mono text-[11px]", w > 0 ? "text-neon-cyan" : "text-slate-600")}
                        >
                          {(w * 100).toFixed(0)}%
                        </span>
                      </div>
                    ))
                  )}
                </div>

                {/* hold_default + switches */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border border-border bg-foreground/[0.03] px-3 py-2.5">
                    <p className="text-[11px] text-muted-foreground">hold_default</p>
                    <p className="text-2xl font-bold tabular-nums">
                      {cfg.holdDefault ?? cfg.hold_default ?? "—"}
                      <span className="ml-1 text-xs font-normal text-muted-foreground">วัน</span>
                    </p>
                  </div>
                  <label className="flex cursor-pointer items-center justify-between gap-2 rounded-lg border border-border bg-foreground/[0.03] px-3 py-2.5">
                    <span className="min-w-0 text-xs leading-4 text-foreground/80">
                      calendarOverlay
                      <span className="block text-[10px] text-muted-foreground">ซ้อนกติกาปฏิทิน (H3)</span>
                    </span>
                    <Switch
                      checked={!!cfg.calendarOverlay}
                      onCheckedChange={() => toggleConfig("calendarOverlay")}
                      disabled={cfgPending}
                      aria-label="สลับ calendarOverlay — ซ้อนกติกาปฏิทิน"
                    />
                  </label>
                  <label className="flex cursor-pointer items-center justify-between gap-2 rounded-lg border border-border bg-foreground/[0.03] px-3 py-2.5">
                    <span className="min-w-0 text-xs leading-4 text-foreground/80">
                      reversalEnabled
                      <span className="block text-[10px] text-muted-foreground">เปิดกลยุทธ์ Snap-back (H2)</span>
                    </span>
                    <Switch
                      checked={!!cfg.reversalEnabled}
                      onCheckedChange={() => toggleConfig("reversalEnabled")}
                      disabled={cfgPending}
                      aria-label="สลับ reversalEnabled — เปิดกลยุทธ์ Snap-back Reversal"
                    />
                  </label>
                </div>

                {/* footer: updatedBy + history timeline */}
                <div className="space-y-1.5 border-t border-border/60 pt-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <History className="size-3.5 text-muted-foreground" aria-hidden />
                    <span className="text-xs font-medium text-muted-foreground">ไทม์ไลน์การตัดสิน config ล่าสุด</span>
                    {cfg.updatedBy && (
                      <Badge
                        variant="outline"
                        className="border-neon-purple/40 bg-neon-purple/10 font-mono text-[10px] text-[#8b5cf6]"
                      >
                        updatedBy: {cfg.updatedBy}
                      </Badge>
                    )}
                  </div>
                  {history.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">ยังไม่มีประวัติ — config ชุดแรกรอผล Evidence Night</p>
                  ) : (
                    <ol className="space-y-1.5">
                      {history.map((h, i) => {
                        const chips = verdictChips(h.verdict ?? h.verdicts)
                        return (
                          <li
                            // ts เป็นวินาที — บันทึก 2 ครั้งในวินาทีเดียวกันได้ จึงต่อ index กัน key ชน
                            key={`${h.ts ?? h.at ?? h.ranAt ?? "h"}-${i}`}
                            className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 px-2.5 py-1.5 text-xs"
                          >
                            <span className="font-mono text-[10px] text-muted-foreground">{fmtTime(h.ts ?? h.at ?? h.ranAt)}</span>
                            {chips.map((c) => (
                              <Badge
                                key={c.k}
                                variant="outline"
                                className={cn("px-1.5 py-0 text-[10px]", verdictBadgeCls(c.v))}
                                title={`${c.k} → ${c.v}`}
                              >
                                {c.k} {c.v}
                              </Badge>
                            ))}
                            {h.note && <span className="min-w-0 text-[11px] text-muted-foreground">{h.note}</span>}
                            {h.updatedBy && <span className="ml-auto font-mono text-[10px] text-slate-600">{h.updatedBy}</span>}
                          </li>
                        )
                      })}
                    </ol>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="size-4 text-neon-green" aria-hidden />
              Buckets — ถังผลตัดสินจริง
            </CardTitle>
            <CardDescription>ถังผลตัดสินจริงแยกตาม source — ตัวเลขวันนี้ตัดสิน config พรุ่งนี้</CardDescription>
          </CardHeader>
          <CardContent className="min-w-0">
            {buckets.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                ยังไม่มีผลตัดสินจริงในถัง — รัน Evidence Night แล้วเทรดกระดาษไปสักระยะ
              </p>
            ) : (
              <div className="min-w-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Source</TableHead>
                      <TableHead className="text-right">n</TableHead>
                      <TableHead className="text-right">Win rate</TableHead>
                      <TableHead className="text-right">Avg outcome</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {buckets.map((b) => (
                      <TableRow key={b.source}>
                        <TableCell className="min-w-0">
                          <span className="block truncate font-medium">{SOURCE_LABEL[b.source] ?? b.source}</span>
                          <span className="font-mono text-[10px] text-muted-foreground">{b.source}</span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{b.n}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          <span className={(b.winRate ?? 0) >= 0.5 ? "text-neon-green" : "text-neon-rose"}>{pctFrac(b.winRate)}</span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {/* avg = ค่าเฉลี่ย Decision.outcome ซึ่งเป็นหน่วย % อยู่แล้ว (verify คูณ 100) — ห้ามคูณซ้ำ */}
                          <span className={(b.avg ?? 0) >= 0 ? "text-neon-green" : "text-neon-rose"}>{fmtPct(b.avg, 2)}</span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
