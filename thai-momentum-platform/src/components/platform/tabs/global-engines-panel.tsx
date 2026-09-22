"use client"

// Global Engines Panel — ผลทดสอบ logic/algorithms ที่นำเข้าจากงานวิจัยทั่วโลก
// บนข้อมูล SET จริง ด้วยเกณฑ์ preregistered (แสดงบน Evidence Board)

import { Globe2 } from "lucide-react"
import { useApi } from "@/hooks/use-api"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

interface EngineEval {
  id: string
  name: string
  source: { authors: string; year: number; title: string; venue: string }
  thesis: string
  verdict: "PASS" | "WEAK" | "FAIL" | "INFO"
  verdictWhy: string
  stats: Record<string, number | string>
  integration: { target: string; how: string }
  spark?: { label: string; values: number[] }
}

interface GlobalEnginesReport {
  generatedAt: string
  dates: number
  symbols: number
  latestDate: string
  engines: EngineEval[]
  runtimeMs: number
}

const VERDICT_META: Record<
  EngineEval["verdict"],
  { cls: string; label: string; dot: string }
> = {
  PASS: {
    cls: "border-neon-green/35 bg-neon-green/10 text-neon-green",
    label: "PASS — พร้อมเสนอเข้า config",
    dot: "bg-neon-green",
  },
  WEAK: {
    cls: "border-neon-amber/35 bg-neon-amber/10 text-neon-amber",
    label: "WEAK — เก็บเป็น feature เสริม",
    dot: "bg-neon-amber",
  },
  FAIL: {
    cls: "border-neon-rose/35 bg-neon-rose/10 text-neon-rose",
    label: "FAIL — ไม่นำเข้า (honest)",
    dot: "bg-neon-rose",
  },
  INFO: {
    cls: "border-neon-purple/35 bg-neon-purple/10 text-neon-purple",
    label: "INFO — เครื่องมือ ไม่ตัดสิน IC",
    dot: "bg-neon-purple",
  },
}

/** ป้ายอ่านง่ายของสถิติที่พบบ่อย */
const STAT_LABELS: Record<string, string> = {
  bestHold: "hold ที่ดีที่สุด (วัน)",
  meanIC: "mean IC",
  ICIR: "ICIR",
  t: "t-stat",
  nDays: "จำนวนวันทดสอบ",
  formWindow: "หน้าต่าง formation (วัน)",
  window: "หน้าต่าง (วัน)",
  liveValue: "ค่า live ล่าสุด",
  pctNearHigh: "% หุ้นใกล้ 52w high",
  sharpeRaw: "Sharpe ดิบ",
  sharpeManaged: "Sharpe หลังสเกล",
  mddRaw: "MaxDD ดิบ",
  mddManaged: "MaxDD หลังสเกล",
  avgWeight: "น้ำหนักเฉลี่ย w",
  lastWeight: "w ล่าสุด",
  csadPct: "CSAD percentile วันนี้",
  spread: "spread fwd10 (pp ตลาด)",
  tSpread: "t ของ spread",
  nSamples: "ตัวอย่าง (ไม้)",
  pctTp: "% โดนกำแพงบน",
  pctSl: "% โดนกำแพงล่าง",
  pctTimeout: "% หมดเวลา",
  evAfterCost: "EV หลังต้นทุน",
  avgHoldBars: "ถือเฉลี่ย (แท่ง)",
  pStressNow: "P(stress) วันนี้",
  stateNow: "สถานะวันนี้",
  fwdStress: "ตลาด fwd10 ตอน stress",
  fwdCalm: "ตลาด fwd10 ตอน calm",
  nAssets: "จำนวนหุ้น",
  obsDays: "วันที่ใช้คำนวณ",
  shrinkDelta: "LW shrinkage (%)",
  effectiveN: "Effective-N",
  topWeight: "น้ำหนักสูงสุด (%)",
  avgCorr: "avg pairwise corr (%)",
  topSymbols: "น้ำหนัก top-10",
  barrierUp: "กำแพงบน",
  barrierDn: "กำแพงล่าง",
  horizon: "กำแพงเวลา (แท่ง)",
}

const NUMBER_KEYS = new Set([
  "bestHold", "meanIC", "ICIR", "t", "nDays", "formWindow", "window", "liveValue",
  "pctNearHigh", "sharpeRaw", "sharpeManaged", "mddRaw", "mddManaged", "avgWeight",
  "lastWeight", "csadPct", "spread", "tSpread", "nSamples", "pctTp", "pctSl",
  "pctTimeout", "evAfterCost", "avgHoldBars", "pStressNow", "fwdStress", "fwdCalm",
  "nAssets", "obsDays", "shrinkDelta", "effectiveN", "topWeight", "avgCorr",
  "barrierUp", "barrierDn", "horizon",
])

function fmtStat(key: string, v: number | string): string {
  if (typeof v === "string") return v
  if (!Number.isFinite(v)) return "—"
  if (key === "liveValue" || key === "evAfterCost" || key === "fwdStress" || key === "fwdCalm") {
    return (v * 100).toFixed(2) + "%"
  }
  if (Number.isInteger(v)) return String(v)
  return String(Math.round(v * 1000) / 1000)
}

/** กราฟแท่งเล็ก ๆ (ไม่พึ่ง recharts) */
function SparkBars({ values, label }: { values: number[]; label: string }) {
  if (values.length === 0) return null
  const max = Math.max(...values.map((v) => Math.abs(v)), 1e-9)
  return (
    <div className="space-y-1 border-t border-border/60 pt-2.5">
      <p className="text-[10px] font-medium text-muted-foreground">{label}</p>
      <div className="flex h-10 items-end gap-1" aria-hidden>
        {values.slice(-24).map((v, i) => {
          const pct = (Math.abs(v) / max) * 100
          const pos = v >= 0
          return (
            <div
              key={i}
              className={cn("min-w-[3px] flex-1 rounded-t-sm", pos ? "bg-neon-cyan/60" : "bg-neon-rose/60")}
              style={{ height: `${Math.max(pct, 4)}%` }}
            />
          )
        })}
      </div>
    </div>
  )
}

function EngineCard({ e }: { e: EngineEval }) {
  const meta = VERDICT_META[e.verdict]
  const entries = Object.entries(e.stats).filter(
    ([k, v]) => !k.startsWith("icHold") && k !== "topSymbols" && v !== undefined,
  )
  const icirRow = Object.entries(e.stats).filter(([k]) => k.startsWith("icHold"))
  return (
    <Card className="min-w-0">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-base leading-5">{e.name}</CardTitle>
            <CardDescription className="mt-1 text-[11px] leading-4">
              {e.source.authors} ({e.source.year}) · {e.source.title}
              <span className="block text-muted-foreground/80">{e.source.venue}</span>
            </CardDescription>
          </div>
          <Badge variant="outline" className={cn("shrink-0", meta.cls)} title={meta.label}>
            {e.verdict}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="min-w-0 space-y-3">
        <p className="text-xs leading-5 text-foreground/80">{e.thesis}</p>

        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-lg border border-border bg-foreground/[0.03] px-3 py-2.5 sm:grid-cols-3">
          {entries.slice(0, 9).map(([k, v]) => (
            <div key={k} className="min-w-0">
              <p className="truncate text-[10px] text-muted-foreground" title={STAT_LABELS[k] ?? k}>
                {STAT_LABELS[k] ?? k}
              </p>
              <p className="truncate font-mono text-xs font-semibold tabular-nums">
                {NUMBER_KEYS.has(k) || typeof v === "number" ? fmtStat(k, v) : String(v)}
              </p>
            </div>
          ))}
        </div>

        {icirRow.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {icirRow.map(([k, v]) => (
              <Badge
                key={k}
                variant="outline"
                className="border-border bg-foreground/[0.03] font-mono text-[10px] text-foreground/80"
              >
                {k.replace("icHold", "ICIR@")}: {String(v)}
              </Badge>
            ))}
          </div>
        )}

        <div
          className={cn(
            "rounded-md border px-3 py-2 text-[11px] leading-4",
            e.verdict === "PASS" && "border-neon-green/25 bg-neon-green/[0.06] text-neon-green",
            e.verdict === "WEAK" && "border-neon-amber/25 bg-neon-amber/[0.06] text-neon-amber",
            e.verdict === "FAIL" && "border-neon-rose/25 bg-neon-rose/[0.06] text-neon-rose",
            e.verdict === "INFO" && "border-neon-purple/25 bg-neon-purple/[0.06] text-neon-purple",
          )}
        >
          {e.verdictWhy}
        </div>

        <p className="text-[11px] leading-4 text-muted-foreground">
          <span className="font-semibold text-foreground/70">ถ้าใช้:</span> พ่วงที่{" "}
          <span className="font-mono">{e.integration.target}</span> — {e.integration.how}
        </p>

        {e.spark && <SparkBars values={e.spark.values} label={e.spark.label} />}
      </CardContent>
    </Card>
  )
}

export default function GlobalEnginesPanel() {
  const { data, loading, error } = useApi<GlobalEnginesReport>("/api/engines/global")

  const passed = data?.engines.filter((e) => e.verdict === "PASS").length ?? 0
  const weak = data?.engines.filter((e) => e.verdict === "WEAK").length ?? 0
  const failed = data?.engines.filter((e) => e.verdict === "FAIL").length ?? 0

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe2 className="size-4 text-neon-cyan" aria-hidden />
          Imported Global Engines — เก็บเกี่ยวจากงานวิจัยทั่วโลก แล้วทดสอบบน SET ของเรา
        </CardTitle>
        <CardDescription>
          ทุก engine ต้องผ่านเกณฑ์ที่ลงทะเบียนล่วงหน้าบนข้อมูลจริงของเราก่อนเสนอเข้า config — PASS = ICIR ≥ 0.25 + meanIC ≥
          0.02 + t ≥ 2 (โมเดลเดียวกับ H1) · overlay/regime ใช้เกณฑ์ Sharpe/t ของตัวเอง · ผลลบแสดงตรง ๆ ไม่ลบไม่ปิด
        </CardDescription>
        {data && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Badge variant="outline" className="border-neon-green/30 bg-neon-green/10 text-neon-green">
              PASS {passed}
            </Badge>
            <Badge variant="outline" className="border-neon-amber/30 bg-neon-amber/10 text-neon-amber">
              WEAK {weak}
            </Badge>
            <Badge variant="outline" className="border-neon-rose/30 bg-neon-rose/10 text-neon-rose">
              FAIL {failed}
            </Badge>
            <Badge variant="outline" className="border-border bg-foreground/[0.03] font-mono text-[10px] text-foreground/70">
              {data.symbols} ตัว × {data.dates} วัน (ถึง {data.latestDate}) · คำนวณ {data.runtimeMs}ms
            </Badge>
          </div>
        )}
      </CardHeader>
      <CardContent className="min-w-0">
        {error && !data ? (
          <Alert variant="destructive">
            <AlertTitle>โหลดผล Global Engines ไม่สำเร็จ</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : !data ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-64 w-full" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {data.engines.map((e) => (
              <EngineCard key={e.id} e={e} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
