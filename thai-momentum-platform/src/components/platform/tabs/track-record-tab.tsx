"use client"

// แท็บ TRACK RECORD — ผลงานจริงของพอร์ตกระดาษ Jev นับจากรอบตัดสินใจแรก (GET /api/track-record)
// + ความน่าเชื่อถือของข้อมูล (GET /api/data/trust)
//
// กติกาความจริงใจของแท็บนี้:
//  - ป้ายที่มาข้อมูล (SYNTHETIC / REAL) อยู่บนหัวแท็บเสมอ — ข้อมูลจำลองติดป้ายทุกจุดที่มีตัวเลข
//  - ยังไม่ถึง 60 วันซื้อขาย / 30 เทรดปิด = ป้าย "ยังเร็วเกินไปที่จะตัดสิน" · ค่าที่วัดไม่ได้ = "—" (ไม่ใช่ 0)
//  - หลักฐานกันแก้ย้อนหลัง (hash chain ของ EventLog + ledger hash + snapshot) แสดงให้ตรวจเองได้
//  - ล็อกกติกาช่วงเก็บผล (freeze): วันที่ล็อก + กติกาที่เปลี่ยน/ไม่ตรงกับตอนล็อกระหว่าง record ขึ้นป้ายแดง

import { type ReactNode } from "react"
import {
  AlertTriangle,
  CalendarClock,
  Database,
  Fingerprint,
  History,
  Hourglass,
  LineChart as LineChartIcon,
  ListChecks,
  Lock,
  LockOpen,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react"
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { fmtNum, fmtPct, useApi } from "@/hooks/use-api"
import type { LegRow, TrackRecordResponse } from "@/lib/track/types"
import type { FrozenKey, TrackFreezeInfo } from "@/lib/research/freeze"
import type { DataTrustResponse } from "@/lib/feed/trust"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { EmptyNote, FeatureModule, Meter, MiniStat, type Tone } from "@/components/platform/feature-module"
import { AXIS_TICK_11, CHART, TOOLTIP_LABEL_STYLE, TOOLTIP_STYLE } from "@/components/platform/chart-theme"
import { cn } from "@/lib/utils"

// ---------------- helpers ----------------

const tonePct = (x: number | null | undefined): Tone => (x === null || x === undefined || !isFinite(x) ? "neutral" : x > 0 ? "green" : x < 0 ? "rose" : "neutral")
const short = (h: string | null | undefined, n = 12) => (h ? `${h.slice(0, n)}…` : "—")
const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return "—"
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("th-TH", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" })
}

const EVIDENCE_BADGE: Record<string, { cls: string; text: string; title: string }> = {
  REAL: { cls: "border-neon-green/40 bg-neon-green/10 text-neon-green", text: "REAL — ข้อมูลจริง", title: "ข้อมูลตลาดจริงล้วนจากแหล่งที่ระบบรู้จัก (ตรวจจาก EventLog)" },
  SYNTHETIC: { cls: "border-neon-amber/40 bg-neon-amber/10 text-neon-amber", text: "SYNTHETIC — ข้อมูลจำลอง", title: "ราคาจาก demo seed (หุ้นสมมติ) — ไม่ใช่หลักฐาน" },
  MIXED: { cls: "border-neon-amber/40 bg-neon-amber/10 text-neon-amber", text: "MIXED — จริงปนจำลอง", title: "ingest ข้อมูลจริงหลัง seed โดยไม่ล้าง demo" },
  UNVERIFIED_SOURCE: { cls: "border-neon-amber/40 bg-neon-amber/10 text-neon-amber", text: "UNVERIFIED — ไม่รู้แหล่ง", title: "มีข้อมูลจากแหล่งที่ระบบไม่รู้จักในยุคนี้" },
  NO_DATA: { cls: "border-border bg-foreground/[0.04] text-muted-foreground", text: "NO DATA", title: "ยังไม่มีข้อมูลตลาด" },
  UNKNOWN: { cls: "border-neon-amber/40 bg-neon-amber/10 text-neon-amber", text: "UNKNOWN", title: "ตรวจที่มาข้อมูลไม่ได้" },
}

const MODE_BADGE: Record<string, { cls: string; text: string; title: string }> = {
  LIVE: { cls: "border-neon-cyan/40 bg-neon-cyan/10 text-neon-cyan", text: "LIVE", title: "ทุกรอบตัดสินใจภายใน 4 วันหลังวันของข้อมูล" },
  REPLAY: { cls: "border-neon-rose/40 bg-neon-rose/10 text-neon-rose", text: "REPLAY", title: "รอบตัดสินใจย้อนหลัง — ไม่ใช่ live out-of-sample" },
  MIXED: { cls: "border-neon-amber/40 bg-neon-amber/10 text-neon-amber", text: "LIVE+REPLAY", title: "มีบางรอบตัดสินใจย้อนหลัง" },
  NONE: { cls: "border-border bg-foreground/[0.04] text-muted-foreground", text: "ยังไม่มีรอบ", title: "ยังไม่มีรอบตัดสินใจของ Jev" },
}

const VERDICT_TONE: Record<string, string> = {
  PROMISING: "border-neon-green/30 bg-neon-green/[0.06]",
  UNDERPERFORM: "border-neon-rose/30 bg-neon-rose/[0.06]",
  NOT_REAL: "border-neon-amber/30 bg-neon-amber/[0.06]",
  TOO_EARLY: "border-neon-amber/30 bg-neon-amber/[0.06]",
  NO_EDGE_YET: "border-border bg-foreground/[0.03]",
  NO_RUNS: "border-border bg-foreground/[0.03]",
  NO_DATA: "border-border bg-foreground/[0.03]",
}

/** GET /api/track-record แนบ freeze มาด้วย (optional ในชนิดของ view — ข้อมูลเก่า/test ที่ไม่มีฟิลด์นี้ยังเรนเดอร์ได้) */
type TrackView = TrackRecordResponse & { freeze?: TrackFreezeInfo }

const STATUS_TEXT: Record<LegRow["status"], string> = { open: "ถืออยู่", closed: "ปิดแล้ว", orphan: "ไม่มีไม้ออก" }
const SLOTS_SRC: Record<LegRow["slotsSource"], string> = { position: "จากพอร์ต", snapshot: "จาก snapshot", estimated: "ประมาณจาก conf" }
const COMMERCIAL: Record<string, string> = { no: "ใช้ส่วนตัวเท่านั้น", check: "ต้องตรวจเงื่อนไข", licensed: "ตามสัญญา", user: "ผู้ใช้รับผิดชอบ" }

function Pill({ cls, title, children }: { cls: string; title?: string; children: ReactNode }) {
  return (
    <Badge variant="outline" className={cn("max-w-full shrink whitespace-nowrap shadow-[0_1px_2px_rgba(16,24,40,0.06)]", cls)} title={title}>
      {children}
    </Badge>
  )
}

// ---------------- NAV chart ----------------

function NavChart({ nav, chartWidth }: { nav: TrackRecordResponse["nav"]; chartWidth?: number }) {
  if (nav.length < 2)
    return (
      <EmptyNote minH={220}>
        {nav.length === 1 ? `มี NAV จุดเดียว (${nav[0].date}) — กราฟเริ่มแสดงเมื่อผ่านไปอย่างน้อย 1 วันซื้อขาย` : "ยังไม่มีจุด NAV"}
      </EmptyNote>
    )
  const data = nav.map((p) => ({ date: p.date, nav: p.nav, bench: p.bench }))
  const pctLabel = (v: number) => `${v >= 1 ? "+" : ""}${((v - 1) * 100).toFixed(1)}%`
  // ป้ายแกนวันที่ ~6 ป้ายเสมอ (ไม่พึ่งการวัดขนาดตัวอักษร — ก่อนวัดขนาดจริงป้ายเคยซ้อนกัน)
  const tickEvery = Math.max(0, Math.ceil(data.length / 6) - 1)
  return (
    <div>
      {/* legend แบบ line key (สีอยู่ที่เส้น ตัวอักษรใช้สีข้อความ) — ตัดบรรทัดเองบนมือถือ ไม่ทับแกน */}
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <svg width="18" height="6" aria-hidden>
            <line x1="0" y1="3" x2="18" y2="3" stroke={CHART.gold} strokeWidth="2" strokeLinecap="round" />
          </svg>
          พอร์ต Jev (NAV)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width="18" height="6" aria-hidden>
            <line x1="0" y1="3" x2="18" y2="3" stroke={CHART.slate} strokeWidth="2" strokeDasharray="4 3" />
          </svg>
          Benchmark — equal-weight หุ้นที่ผ่านเกณฑ์สภาพคล่อง
        </span>
        <span>1.00 = วันเริ่ม ({data[0].date})</span>
      </div>
      <div className="h-[300px] w-full" role="img" aria-label="กราฟ NAV ของพอร์ตกระดาษเทียบ benchmark (1.00 = วันเริ่ม)">
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: chartWidth ?? 720, height: 300 }}>
          <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={CHART.grid} vertical={false} />
            <XAxis dataKey="date" tickFormatter={(v: string) => String(v).slice(5)} interval={tickEvery} tick={AXIS_TICK_11} stroke={CHART.grid} />
            <YAxis domain={["auto", "auto"]} tickFormatter={pctLabel} width={56} tick={AXIS_TICK_11} stroke={CHART.grid} />
            <ReferenceLine y={1} stroke={CHART.ref} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelStyle={TOOLTIP_LABEL_STYLE}
              cursor={{ stroke: CHART.ref, strokeWidth: 1 }}
              formatter={(v: number, name: string) => [pctLabel(Number(v)), name]}
            />
            <Line dataKey="nav" name="พอร์ต Jev (NAV)" stroke={CHART.gold} strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line
              dataKey="bench"
              name="Benchmark"
              stroke={CHART.slate}
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ---------------- sections ----------------

function HonestyBanners({ t }: { t: TrackView }) {
  const c = t.confidence
  const notReal = t.provenance.evidenceLabel !== "REAL"
  const f = t.freeze
  const afterFreeze = f ? f.changes.filter((x) => x.afterFreeze && x.keys.length > 0) : []
  return (
    <div className="space-y-3">
      {f?.violated ? (
        <Alert className="border-neon-rose/30 bg-neon-rose/[0.06]">
          <ShieldAlert className="size-4 text-neon-rose" aria-hidden />
          <AlertTitle className="text-neon-rose">กติกาเปลี่ยน/ตรวจไม่ผ่านระหว่างช่วงล็อก — record ช่วงนี้ไม่ใช่หลักฐานของกติกาที่ลงทะเบียนไว้</AlertTitle>
          <AlertDescription className="text-foreground/80">
            <ul className="list-disc space-y-0.5 pl-5">
              {f.drift.length > 0 ? <li>ค่าที่ระบบเทรดใช้ไม่ตรงกับตอนล็อก: {f.drift.map((d) => d.key).join(", ")} (แก้ข้ามด่านล็อก เช่นแก้ตรงใน DB)</li> : null}
              {f.integrity.map((i) => (
                <li key={i}>{i}</li>
              ))}
              {afterFreeze.length > 0 ? <li>EventLog มีการเปลี่ยนกติกาหลังล็อก {afterFreeze.length} ครั้ง: {afterFreeze.map((x) => `#${x.id} ${x.text}`).join(" · ")}</li> : null}
              {f.beforeEpoch ? <li>ยุคข้อมูลเริ่มใหม่ (seed/ล้าง demo) หลังล็อก — policy ที่ล็อกไว้ถูกล้าง</li> : null}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}
      {notReal && t.status !== "NO_DATA" ? (
        <Alert className="border-neon-amber/30 bg-neon-amber/[0.06]">
          <AlertTriangle className="size-4 text-neon-amber" aria-hidden />
          <AlertTitle className="text-neon-amber">{EVIDENCE_BADGE[t.provenance.evidenceLabel]?.text ?? t.provenance.evidenceLabel} — ตัวเลขในหน้านี้ไม่ใช่หลักฐานของ edge</AlertTitle>
          <AlertDescription className="text-foreground/80">
            ที่มาข้อมูล: {t.provenance.label}
            {t.provenance.latestSource ? ` · แหล่งล่าสุด ${t.provenance.latestSource}` : ""} — track record นับเป็นหลักฐานได้เฉพาะบนข้อมูลตลาดจริงล้วนจากแหล่งที่รู้จัก
          </AlertDescription>
        </Alert>
      ) : null}
      {t.status === "OK" && c.tooEarly ? (
        <Alert className="border-neon-amber/30 bg-neon-amber/[0.06]">
          <Hourglass className="size-4 text-neon-amber" aria-hidden />
          <AlertTitle className="text-neon-amber">ยังเร็วเกินไปที่จะตัดสิน</AlertTitle>
          <AlertDescription className="space-y-2 text-foreground/80">
            <p>
              ต้องมีอย่างน้อย {c.minSessions} วันซื้อขาย และ {c.minClosedTrades} เทรดที่ปิดแล้ว ก่อนตีความผลงาน — ตอนนี้ {t.sessions} วัน · {t.stats.closedTrades} เทรด
            </p>
            <div className="grid max-w-xl gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <p className="text-[11px] text-muted-foreground">
                  วันซื้อขาย {t.sessions}/{c.minSessions}
                </p>
                <Meter value={t.sessions / c.minSessions} tone="amber" ariaLabel="ความคืบหน้าจำนวนวันซื้อขาย" />
              </div>
              <div className="space-y-1">
                <p className="text-[11px] text-muted-foreground">
                  เทรดปิด {t.stats.closedTrades}/{c.minClosedTrades}
                </p>
                <Meter value={t.stats.closedTrades / c.minClosedTrades} tone="amber" ariaLabel="ความคืบหน้าจำนวนเทรดที่ปิดแล้ว" />
              </div>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}
      <div className={cn("rounded-xl border px-4 py-3", VERDICT_TONE[c.verdict] ?? "border-border")}>
        <p className="gold-kicker">ข้อสรุปทางสถิติ · {c.verdict}</p>
        <p className="mt-1 text-sm font-semibold">{c.label}</p>
        {c.notes.length > 0 ? (
          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
            {c.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  )
}

function LegsTable({ legs }: { legs: LegRow[] }) {
  if (legs.length === 0) return <EmptyNote>ยังไม่มีไม้ที่ Jev เข้าซื้อจริงในยุคข้อมูลนี้</EmptyNote>
  return (
    <div className="max-h-[420px] overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>หุ้น</TableHead>
            <TableHead>สถานะ</TableHead>
            <TableHead>เข้า</TableHead>
            <TableHead className="text-right">ราคาเข้า</TableHead>
            <TableHead>ออก</TableHead>
            <TableHead className="text-right">ราคาออก</TableHead>
            <TableHead className="text-right">สล็อต</TableHead>
            <TableHead className="text-right">ผลสุทธิ</TableHead>
            <TableHead className="text-right">ถือ (วัน)</TableHead>
            <TableHead>ผู้ตัดสินใจ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {legs.map((l) => (
            <TableRow key={`${l.symbol}-${l.entryDate}`} className={cn(l.status === "orphan" && "opacity-60")}>
              <TableCell className="font-mono font-bold">{l.symbol}</TableCell>
              <TableCell className="text-xs">{STATUS_TEXT[l.status]}</TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">{l.entryDate}</TableCell>
              <TableCell className="text-right font-mono text-xs">{fmtNum(l.entryPx, 2)}</TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">{l.exitDate ?? "—"}</TableCell>
              <TableCell className="text-right font-mono text-xs">{fmtNum(l.exitPx, 2)}</TableCell>
              <TableCell className="text-right font-mono text-xs" title={SLOTS_SRC[l.slotsSource]}>
                {fmtNum(l.slots, 2)}
                {l.slotsSource === "estimated" ? <span className="ml-1 text-[10px] text-neon-amber">ประมาณ</span> : null}
              </TableCell>
              <TableCell
                className={cn("text-right font-mono text-xs font-bold", l.netRetPct === null ? "" : l.netRetPct >= 0 ? "text-neon-green" : "text-neon-rose")}
                title={l.recordedRetPct !== null ? `ผลที่บันทึกตอนปิดไม้ ${fmtPct(l.recordedRetPct, 2)}` : l.status === "open" ? "ไม้เปิด: ราคาปิดล่าสุด หักต้นทุนขาเข้า" : undefined}
              >
                {fmtPct(l.netRetPct, 2)}
              </TableCell>
              <TableCell className="text-right font-mono text-xs">{l.holdSessions ?? "—"}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{l.source}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

const FREEZE_KEYS_SHORT: [FrozenKey, string][] = [
  ["config_th", "config"],
  ["signals_policy", "signals"],
  ["stops_policy", "stops"],
  ["meta_model", "meta"],
  ["prereg_trial", "prereg"],
]

/** ล็อกกติกาช่วงเก็บผล (TR4) — วันที่ล็อก · hash ที่ล็อก · ค่าที่ไม่ตรง · การเปลี่ยนกติกาใน EventLog ระหว่าง record */
function FreezeBlock({ f }: { f: TrackFreezeInfo }) {
  const tone = f.violated ? "border-neon-rose/40 bg-neon-rose/[0.04]" : f.frozen ? "border-neon-cyan/30 bg-neon-cyan/[0.03]" : "border-border"
  return (
    <div className={cn("mt-3 min-w-0 space-y-1.5 rounded-lg border px-3 py-2 text-xs", tone)}>
      <p className="flex items-center gap-1.5 font-semibold">
        {f.frozen ? <Lock className="size-4 text-neon-cyan" aria-hidden /> : <LockOpen className="size-4 text-muted-foreground" aria-hidden />}
        ล็อกกติกาช่วงเก็บผล: {f.frozen ? (f.frozenAt ? `ล็อกตั้งแต่ ${fmtDate(f.frozenAt)}` : "ล็อกอยู่ (บันทึกล็อกอ่านไม่ได้)") : "ยังไม่ล็อก"}
      </p>
      {f.frozen && f.frozenAt ? (
        <>
          <p className="text-muted-foreground">
            ข้อมูลตลาดล่าสุดตอนล็อก {f.dataDate ?? "—"}
            {f.note ? ` · สมมติฐาน: ${f.note}` : ""}
          </p>
          {f.hashes ? (
            <p className="break-all font-mono text-[11px]" title="sha256 ของค่าใน Setting ตอนล็อก — เผยแพร่คู่กับวันที่ล็อก">
              {FREEZE_KEYS_SHORT.map(([k, label]) => `${label} ${short(f.hashes?.[k], 10)}`).join(" · ")}
              {f.preregHash ? ` · prereg hash ${short(f.preregHash, 10)}` : ""}
            </p>
          ) : null}
        </>
      ) : null}
      {f.drift.length > 0 ? (
        <p className="font-semibold text-neon-rose">⚠️ ค่าที่ระบบเทรดใช้ไม่ตรงกับตอนล็อก: {f.drift.map((d) => d.key).join(", ")}</p>
      ) : f.frozen && f.frozenAt ? (
        <p className="text-neon-green">ค่าที่ระบบเทรดใช้ตรงกับตอนล็อกทุกตัว</p>
      ) : null}
      {f.startedBeforeFreeze ? <p className="text-neon-amber">record เริ่มก่อนล็อก — ช่วงก่อนวันล็อกไม่ได้อยู่ใต้กติกาที่ลงทะเบียนไว้</p> : null}
      {f.changes.length > 0 ? (
        <div>
          <p className="text-muted-foreground">การเปลี่ยนกติกาใน EventLog ระหว่าง record{f.frozen ? " / หลังล็อก" : ""} ({f.changes.length})</p>
          <ul className="mt-0.5 space-y-0.5">
            {f.changes.slice(-12).map((c) => (
              <li key={c.id} className={cn("min-w-0", c.afterFreeze ? "font-semibold text-neon-rose" : "text-foreground/80")}>
                #{c.id} · {fmtDate(c.ts)} — {c.text}
                {c.afterFreeze ? " (หลังล็อก)" : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {!f.frozen ? (
        <p className="text-[11px] text-muted-foreground">ล็อกที่แท็บ Evidence ก่อนเริ่มนับ — ระหว่างล็อก config_th / signals_policy / stops_policy เปลี่ยนไม่ได้</p>
      ) : null}
    </div>
  )
}

function TrustPanel({ trust, loading, error }: { trust: DataTrustResponse | null; loading: boolean; error: string | null }) {
  if (loading && !trust) return <Skeleton className="h-48 w-full rounded-xl" />
  if (error && !trust)
    return (
      <Alert variant="destructive">
        <ShieldAlert className="size-4" aria-hidden />
        <AlertTitle>โหลดข้อมูลความน่าเชื่อถือไม่สำเร็จ</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  if (!trust) return null
  const f = trust.freshness
  const freshTone: Tone = f.status === "fresh" ? "green" : f.status === "lagging" ? "amber" : f.status === "empty" ? "neutral" : "rose"
  const freshText = { fresh: "สด", lagging: "ช้า 1 วัน", stale: "ค้าง", empty: "ไม่มีข้อมูล" }[f.status]
  const run = trust.pipeline.lastRun
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniStat label="รอบที่ควรมีข้อมูล" value={f.expectedSession} sub={`ปฏิทินวันหยุด ${trust.calendar.source === "file" ? "ไฟล์ผู้ใช้" : "ตั้งต้น"} (${trust.calendar.years.join(", ")})`} />
        <MiniStat label="ข้อมูลล่าสุดใน DB" value={f.dbLatest ?? "—"} sub={`${freshText}${f.lagSessions ? ` · ตามหลัง ${f.lagSessions} วัน` : ""}`} tone={freshTone} />
        <MiniStat label="อัปเดตถึงรอบล่าสุด" value={f.pctUpdated === null ? "—" : `${f.pctUpdated}%`} sub={`${f.updated}/${f.universeSize} ตัว (universe ที่ยังซื้อขาย)`} />
        <MiniStat label="ค้าง ≥ 5 วัน / ไม่มีข้อมูล" value={`${f.counts.stale} / ${f.counts.missing}`} sub="พักการซื้อขาย · เลิกเทรด · ข้อมูลหาย" tone={f.counts.stale + f.counts.missing > 0 ? "amber" : "neutral"} />
      </div>
      {f.pctUpdated !== null ? <Meter value={f.pctUpdated / 100} tone={f.pctUpdated >= 80 ? "green" : "amber"} ariaLabel="สัดส่วนหุ้นที่อัปเดตถึงรอบล่าสุด" /> : null}
      {f.laggards.length > 0 ? (
        <p className="text-[11px] text-muted-foreground">
          ตามหลัง: {f.laggards.slice(0, 12).map((l) => `${l.symbol} (${l.lastDate ?? "ไม่มี"}${l.lagSessions ? ` · ${l.lagSessions}ว.` : ""})`).join(" · ")}
          {f.laggards.length > 12 ? " …" : ""}
        </p>
      ) : null}

      <div>
        <p className="mb-1.5 text-xs font-semibold">แหล่งข้อมูลและสิทธิ์การใช้</p>
        <div className="grid gap-2 md:grid-cols-2">
          {trust.sources.map((s) => {
            const used = trust.provenance.ingestHistory.find((h) => h.source === s.id || h.source.startsWith(`${s.id}-`))
            return (
              <div key={s.id} className={cn("min-w-0 rounded-lg border px-3 py-2", used ? "border-gold/50 bg-gold-soft/40" : "border-border bg-foreground/[0.02]")}>
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <p className="truncate text-xs font-semibold">{s.label}</p>
                  <Pill cls={s.official ? "border-neon-green/40 bg-neon-green/10 text-neon-green" : "border-border bg-foreground/[0.04] text-muted-foreground"}>{s.official ? "ทางการ" : "ไม่เป็นทางการ"}</Pill>
                  <Pill cls="border-border bg-foreground/[0.04] text-muted-foreground" title={s.terms}>
                    {COMMERCIAL[s.commercialUse] ?? s.commercialUse}
                  </Pill>
                  {used ? <Pill cls="border-gold/60 bg-gold-soft text-gold-ink">ใช้ในยุคนี้ {used.ingests} ครั้ง</Pill> : null}
                </div>
                <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground" title={`${s.license} · ${s.terms}`}>
                  {s.risk}
                </p>
              </div>
            )
          })}
        </div>
        {trust.provenance.ingestHistory.some((h) => !h.known) ? (
          <p className="mt-1.5 text-[11px] text-neon-amber">
            แหล่งที่ระบบไม่รู้จักในยุคนี้: {trust.provenance.ingestHistory.filter((h) => !h.known).map((h) => h.source).join(", ")}
          </p>
        ) : null}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="min-w-0 rounded-lg border border-border px-3 py-2">
          <p className="text-xs font-semibold">Reconciliation ข้ามแหล่ง (ต่าง &gt; 0.5% = ติดธง)</p>
          {trust.reconciliation.items.length === 0 ? (
            <p className="mt-1 text-[11px] text-muted-foreground">{trust.reconciliation.note}</p>
          ) : (
            <ul className="mt-1 space-y-1 text-[11px]">
              {trust.reconciliation.items.map((r) => (
                <li key={r.pairs} className="min-w-0">
                  <span className="font-mono font-semibold">{r.pairs}</span> · เทียบ {r.compared.toLocaleString()} คู่ · ติดธง{" "}
                  <span className={r.flagged > 0 ? "font-semibold text-neon-amber" : ""}>{r.flagged}</span>
                  {r.conflicts.length > 0 ? ` · ขัดกัน: ${r.conflicts.slice(0, 6).join(", ")}` : ""}
                  {r.rebased.length > 0 ? ` · ฐานราคาเปลี่ยน: ${r.rebased.slice(0, 6).join(", ")}` : ""}
                </li>
              ))}
              <li className="text-muted-foreground">จากสายพานรายวัน {fmtDate(trust.reconciliation.lastRun?.at)}</li>
            </ul>
          )}
        </div>
        <div className="min-w-0 rounded-lg border border-border px-3 py-2">
          <p className="text-xs font-semibold">
            Corporate action (เกิน ±30% ใน {trust.corporateActions.windowSessions} วันซื้อขายล่าสุด)
          </p>
          {trust.corporateActions.recent.length === 0 ? (
            <p className="mt-1 text-[11px] text-muted-foreground">
              ไม่พบ · ทั้งประวัติ {trust.corporateActions.totalHistorical} จุด
            </p>
          ) : (
            <ul className="mt-1 space-y-1 text-[11px]">
              {trust.corporateActions.recent.slice(0, 8).map((c) => (
                <li key={`${c.symbol}-${c.date}`} title={c.note}>
                  <span className="font-mono font-semibold">{c.symbol}</span> {c.date} {fmtPct(c.changePct, 1)} · {c.kind}
                  {c.splitFactor ? ` ÷${c.splitFactor}` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <CalendarClock className="size-3.5" aria-hidden />
        {run ? (
          <span>
            สายพานรายวันล่าสุด: รอบ {run.session ?? "—"} ·{" "}
            <span className={run.status === "failed" ? "font-semibold text-neon-rose" : "font-semibold text-foreground"}>{run.status ?? "—"}</span> (exit {run.exitCode ?? "—"}) · {fmtDate(run.at)}
            {run.status === "failed" && run.exitReason ? ` — ${run.exitReason}` : ""}
          </span>
        ) : (
          <span>ยังไม่เคยรันสายพานรายวัน (bun run daily)</span>
        )}
      </div>
      {trust.notes.length > 0 ? (
        <ul className="list-disc space-y-0.5 pl-5 text-[11px] text-muted-foreground">
          {trust.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

// ---------------- view (pure — ทดสอบ/เรนเดอร์ฝั่ง server ได้) ----------------

export interface TrackRecordViewProps {
  track: TrackView | null
  trust: DataTrustResponse | null
  trackLoading?: boolean
  trackError?: string | null
  trustLoading?: boolean
  trustError?: string | null
  onRefresh?: () => void
  /** ความกว้างเริ่มต้นของกราฟก่อนวัดขนาดจริง (เรนเดอร์ฝั่ง server) */
  chartWidth?: number
}

export function TrackRecordView({ track, trust, trackLoading = false, trackError = null, trustLoading = false, trustError = null, onRefresh, chartWidth }: TrackRecordViewProps) {
  if (trackLoading && !track) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    )
  }
  if (trackError && !track) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="size-4" aria-hidden />
        <AlertTitle>โหลด track record ไม่สำเร็จ</AlertTitle>
        <AlertDescription>{trackError}</AlertDescription>
      </Alert>
    )
  }
  if (!track) return null
  const t = track
  const s = t.stats
  const ev = EVIDENCE_BADGE[t.provenance.evidenceLabel] ?? EVIDENCE_BADGE.UNKNOWN
  const mode = MODE_BADGE[t.mode.label] ?? MODE_BADGE.NONE
  const synthetic = t.provenance.evidenceLabel !== "REAL"
  const synthTag = synthetic ? " (ข้อมูลไม่จริง)" : ""
  const audit = t.tamper.audit

  return (
    <div className="space-y-4">
      {/* ---------- หัวแท็บ ---------- */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="gold-kicker">Track record · พอร์ตกระดาษ Jev</p>
          <h1 className="text-xl font-extrabold tracking-tight">ผลงานจริงนับจากรอบตัดสินใจแรก</h1>
          <p className="text-xs text-muted-foreground">
            live since {t.liveSince ?? "—"} · {t.sessions} วันซื้อขาย · ข้อมูลล่าสุด {t.latestDate ?? "—"} · สร้างเมื่อ {fmtDate(t.generatedAt)}
          </p>
          {t.provenance.epochStart ? (
            <p className="text-[11px] text-muted-foreground" title="การล้างข้อมูลตลาดทั้งชุด (seed / replaceDemo) เริ่มยุคใหม่ — track record นับใหม่จากจุดนั้น">
              ยุคข้อมูลเริ่ม {fmtDate(t.provenance.epochStart)} ({t.provenance.epochKind === "seed" ? "demo seed" : "ล้าง demo + นำเข้าข้อมูล"})
              {t.decisions.priorEpoch > 0 ? ` · ไม่นับ ${t.decisions.priorEpoch} การตัดสินใจก่อนยุคนี้` : ""}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Pill cls={ev.cls} title={`${ev.title} — ${t.provenance.label}`}>
            {ev.text}
          </Pill>
          <Pill cls={mode.cls} title={mode.title}>
            {mode.text}
          </Pill>
          <Pill
            cls={audit.ok ? "border-neon-green/40 bg-neon-green/10 text-neon-green" : "border-neon-rose/40 bg-neon-rose/10 text-neon-rose"}
            title={audit.ok ? `hash chain ของ EventLog ครบ ${audit.total} เหตุการณ์` : `hash chain พังที่ event #${audit.brokenAt}`}
          >
            {audit.ok ? "audit ✓ chain ครบ" : `audit ✗ พังที่ #${audit.brokenAt}`}
          </Pill>
          {t.freeze ? (
            <Pill
              cls={
                t.freeze.violated
                  ? "border-neon-rose/40 bg-neon-rose/10 text-neon-rose"
                  : t.freeze.frozen
                    ? "border-neon-cyan/40 bg-neon-cyan/10 text-neon-cyan"
                    : "border-border bg-foreground/[0.04] text-muted-foreground"
              }
              title={
                t.freeze.frozen
                  ? `ล็อกกติกาที่ Jev อ่าน (sha256) ตั้งแต่ ${fmtDate(t.freeze.frozenAt)} — ระหว่างล็อกไม่มีการบันทึก policy/config ใหม่`
                  : "ยังไม่ล็อกกติกา — config_th / signals_policy / stops_policy เปลี่ยนได้ระหว่าง record (ล็อกที่แท็บ Evidence)"
              }
            >
              {t.freeze.violated ? "⚠️ กติกาไม่ตรงกับที่ล็อก" : t.freeze.frozen ? `🔒 ล็อกกติกา ${t.freeze.frozenAt?.slice(0, 10) ?? ""}` : "ยังไม่ล็อกกติกา"}
            </Pill>
          ) : null}
          {onRefresh ? (
            <Button size="sm" variant="outline" onClick={onRefresh} className="min-h-9 sm:min-h-8" aria-label="รีเฟรช">
              <RefreshCw className={cn("size-3.5", (trackLoading || trustLoading) && "animate-spin")} aria-hidden />
            </Button>
          ) : null}
        </div>
      </div>

      <HonestyBanners t={t} />

      {/* ---------- TR1 NAV ---------- */}
      <FeatureModule
        code="TR1 · NAV"
        title={`NAV พอร์ตกระดาษ vs benchmark${synthTag}`}
        desc="mark-to-market รายวันจากราคาปิดใน DB · 1 slot = 1/7 ของทุน · หักต้นทุน 0.7% ต่อขา · benchmark = equal-weight หุ้นที่ผ่านเกณฑ์สภาพคล่อง ณ วันก่อนหน้า (ไม่ใช่ดัชนี SET)"
        icon={LineChartIcon}
        hue="amber"
        status={t.status === "OK" ? { kind: synthetic ? "warn" : "ready", text: synthetic ? "จำลอง" : "จริง" } : { kind: "offline", text: "ยังไม่มี" }}
      >
        {t.status !== "OK" ? (
          <EmptyNote minH={160}>
            {t.confidence.label} — ให้สายพานรายวันรันสมอง Jev หลังตลาดปิดทุกวัน (bun run daily) แล้ว track record จะเริ่มนับเอง
          </EmptyNote>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <MiniStat label={`ผลตอบแทนรวม${synthTag}`} value={fmtPct(s.totalReturnPct, 2)} tone={tonePct(s.totalReturnPct)} sub={`NAV ${fmtNum(t.nav[t.nav.length - 1]?.nav, 4)}`} />
              <MiniStat label="Benchmark" value={fmtPct(s.benchReturnPct, 2)} sub="ช่วงเดียวกัน" />
              <MiniStat label="ส่วนเกิน benchmark" value={fmtPct(s.excessReturnPct, 2)} tone={tonePct(s.excessReturnPct)} sub={s.tStatExcess === null ? "t-stat — (< 20 วัน)" : `t-stat ${fmtNum(s.tStatExcess, 2)}`} />
              <MiniStat label="Max drawdown" value={fmtPct(s.maxDrawdownPct, 2)} tone={s.maxDrawdownPct !== null && s.maxDrawdownPct < 0 ? "rose" : "neutral"} sub={`benchmark ${fmtPct(s.benchMaxDrawdownPct, 2)}`} />
              <MiniStat label="วันซื้อขายใน record" value={t.sessions} sub={`${t.decisions.runs} รอบตัดสินใจ`} />
              <MiniStat label="Live since" value={t.liveSince ?? "—"} sub={t.firstRunAt ? `รันจริงครั้งแรก ${fmtDate(t.firstRunAt)}` : undefined} />
            </div>
            <NavChart nav={t.nav} chartWidth={chartWidth} />
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">ตาราง NAV รายวัน ({t.nav.length} จุด)</summary>
              <div className="mt-2 max-h-56 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>วันที่</TableHead>
                      <TableHead className="text-right">NAV</TableHead>
                      <TableHead className="text-right">Benchmark</TableHead>
                      <TableHead className="text-right">Exposure</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...t.nav].reverse().map((p) => (
                      <TableRow key={p.date}>
                        <TableCell className="font-mono">{p.date}</TableCell>
                        <TableCell className="text-right font-mono">{fmtNum(p.nav, 4)}</TableCell>
                        <TableCell className="text-right font-mono">{fmtNum(p.bench, 4)}</TableCell>
                        <TableCell className="text-right font-mono">{(p.exposure * 100).toFixed(0)}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </details>
          </div>
        )}
      </FeatureModule>

      {/* ---------- TR2 สถิติ ---------- */}
      <FeatureModule
        code="TR2 · STATS"
        title={`สถิติเทรดและการตัดสินใจ${synthTag}`}
        desc="ค่าที่ต้องใช้ข้อมูลมากกว่านี้แสดง — (vol/Sharpe/t-stat ต้อง ≥ 20 วัน · CAGR ต้อง ≥ 60 วัน)"
        icon={ListChecks}
        hue="cyan"
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          <MiniStat label="เทรดปิด / ถืออยู่" value={`${s.closedTrades} / ${s.openTrades}`} />
          <MiniStat label="Hit rate" value={s.hitRatePct === null ? "—" : `${s.hitRatePct}%`} />
          <MiniStat label="เฉลี่ยไม้ชนะ" value={fmtPct(s.avgWinPct, 2)} tone={tonePct(s.avgWinPct)} />
          <MiniStat label="เฉลี่ยไม้แพ้" value={fmtPct(s.avgLossPct, 2)} tone={tonePct(s.avgLossPct)} />
          <MiniStat label="Payoff / Profit factor" value={`${fmtNum(s.payoff, 2)} / ${fmtNum(s.profitFactor, 2)}`} />
          <MiniStat label="ถือเฉลี่ย" value={s.avgHoldSessions === null ? "—" : `${s.avgHoldSessions} วัน`} />
          <MiniStat label="กำไรรับรู้แล้ว" value={fmtPct(s.realizedPct, 2)} tone={tonePct(s.realizedPct)} sub="% ของทุน (โดยประมาณ)" />
          <MiniStat label="กำไรยังไม่รับรู้" value={fmtPct(s.unrealizedPct, 2)} tone={tonePct(s.unrealizedPct)} sub="ไม้ที่ถืออยู่" />
          <MiniStat label="Exposure เฉลี่ย" value={s.avgExposurePct === null ? "—" : `${s.avgExposurePct}%`} />
          <MiniStat label="Turnover / ปี" value={s.turnoverAnnual === null ? "—" : `${fmtNum(s.turnoverAnnual, 1)}×`} />
          <MiniStat label="Sharpe / Vol" value={`${fmtNum(s.sharpe, 2)} / ${s.volPct === null ? "—" : `${s.volPct}%`}`} />
          <MiniStat label="CAGR" value={fmtPct(s.cagrPct, 1)} sub={s.sessionsForSignificance !== null ? `ต้องสะสม ~${s.sessionsForSignificance} วันให้ t≈2` : undefined} />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
          {[
            ["การตัดสินใจทั้งหมด", t.decisions.total],
            ["เข้าซื้อจริง", t.decisions.entries],
            ["ออกจริง", t.decisions.exits],
            ["tighten", t.decisions.tightens],
            ["รอ human gate", t.decisions.pendingBuys],
            ["สั่งซื้อ → รอเติม T+1", t.decisions.queuedOrders ?? 0],
            ["ยกเลิกตอนเติม", t.decisions.cancelledOrders ?? 0],
            ["มนุษย์อนุมัติ", t.decisions.human],
            ["reversal", t.decisions.reversal],
            ["shadow v2", t.decisions.shadow],
            ["ก่อนยุคข้อมูลนี้ (ไม่นับ)", t.decisions.priorEpoch],
          ].map(([k, v]) => (
            <span key={String(k)} className="rounded-md border border-border bg-foreground/[0.03] px-2 py-0.5">
              {k} <span className="font-mono font-semibold">{v}</span>
            </span>
          ))}
        </div>
      </FeatureModule>

      {/* ---------- TR3 ไม้รายตัว ---------- */}
      <FeatureModule
        code="TR3 · LEGS"
        title={`ไม้ของ Jev (${t.legs.length})${synthTag}`}
        desc="จาก Decision (เข้า/ออกจริง) + Trade (ราคาที่ปิดโดยระบบ) + Position (ไม้เปิด) · ขนาดที่ไม่ได้บันทึกติดป้าย 'ประมาณ'"
        icon={History}
        hue="purple"
      >
        <LegsTable legs={t.legs} />
      </FeatureModule>

      {/* ---------- TR4 หลักฐานกันแก้ย้อนหลัง ---------- */}
      <FeatureModule
        code="TR4 · AUDIT"
        title="หลักฐานกันแก้ย้อนหลัง"
        desc="EventLog ผูกด้วย sha256 chain · ledger hash = chain ของทุก Decision ของ Jev ในยุคนี้ · snapshot รายวันเก็บ hash + NAV ลง EventLog เพื่อตรวจย้อนหลัง"
        icon={Fingerprint}
        hue="green"
        status={{
          kind: audit.ok && t.tamper.snapshots.ledgerMismatches === 0 && !t.freeze?.violated ? "ready" : "offline",
          text: audit.ok && t.tamper.snapshots.ledgerMismatches === 0 && !t.freeze?.violated ? "ตรวจผ่าน" : "มีปัญหา",
        }}
      >
        <div className="grid gap-3 md:grid-cols-2">
          <div className="min-w-0 space-y-1.5 text-xs">
            <p className="flex items-center gap-1.5 font-semibold">
              {audit.ok ? <ShieldCheck className="size-4 text-neon-green" aria-hidden /> : <ShieldAlert className="size-4 text-neon-rose" aria-hidden />}
              EventLog: {audit.ok ? `chain ครบ ${audit.total} เหตุการณ์` : `พังที่ event #${audit.brokenAt}`}
            </p>
            <p className="text-muted-foreground">
              event ล่าสุด #{t.tamper.latestEvent?.id ?? "—"} ({t.tamper.latestEvent?.kind ?? "—"}) · {fmtDate(t.tamper.latestEvent?.ts)}
            </p>
            <p className="break-all font-mono text-[11px]" title="hash ของเหตุการณ์ล่าสุด — เผยแพร่คู่กับ track record เพื่อให้ตรวจได้ว่าไม่ถูกแก้">
              latest hash: {t.tamper.latestEvent?.hash ?? "—"}
            </p>
            <p className="break-all font-mono text-[11px]" title="sha256 chain ของ Decision ของ Jev ในยุคนี้">
              ledger hash ({t.tamper.ledgerDecisions} decisions): {t.tamper.ledgerHash}
            </p>
          </div>
          <div className="min-w-0 space-y-1.5 text-xs">
            <p className="font-semibold">Snapshot รายวัน ({t.tamper.snapshots.count})</p>
            <p className="text-muted-foreground">
              ล่าสุด {t.tamper.snapshots.lastDate ?? "—"} · {fmtDate(t.tamper.snapshots.lastAt)}
            </p>
            <p>
              ledger ไม่ตรง: <span className={cn("font-mono font-semibold", t.tamper.snapshots.ledgerMismatches > 0 && "text-neon-rose")}>{t.tamper.snapshots.ledgerMismatches}</span>
              {t.tamper.snapshots.firstLedgerMismatch ? ` (แรกสุด ${t.tamper.snapshots.firstLedgerMismatch})` : ""} · NAV ตรวจ {t.tamper.snapshots.navChecked} วัน ไม่ตรง{" "}
              <span className={cn("font-mono font-semibold", t.tamper.snapshots.navMismatches > 0 && "text-neon-amber")}>{t.tamper.snapshots.navMismatches}</span>
              {t.tamper.snapshots.navSuperseded > 0 ? ` · มีการตัดสินใจเพิ่มหลัง snapshot ${t.tamper.snapshots.navSuperseded} วัน` : ""}
            </p>
            {t.tamper.snapshots.count === 0 ? <p className="text-[11px] text-muted-foreground">ยังไม่มี snapshot — สายพานรายวันบันทึกให้ทุกวันที่ผลเปลี่ยน</p> : null}
            <p className="text-[11px] text-muted-foreground">ledger hash ย่อ {short(t.tamper.ledgerHash)} · ใช้อ้างอิงเมื่อเผยแพร่ผลงาน</p>
          </div>
        </div>
        {t.freeze ? <FreezeBlock f={t.freeze} /> : null}
        {t.notes.length > 0 ? (
          <ul className="mt-3 list-disc space-y-0.5 pl-5 text-[11px] text-muted-foreground">
            {t.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        ) : null}
      </FeatureModule>

      {/* ---------- TR5 ความน่าเชื่อถือของข้อมูล ---------- */}
      <FeatureModule
        code="TR5 · DATA TRUST"
        title="ความน่าเชื่อถือของข้อมูล"
        desc="ที่มา/สิทธิ์การใช้ของแต่ละแหล่ง · ความสดเทียบปฏิทิน SET · reconciliation ข้ามแหล่ง · corporate action (GET /api/data/trust)"
        icon={Database}
        hue="magenta"
      >
        <TrustPanel trust={trust} loading={trustLoading} error={trustError} />
      </FeatureModule>

      <p className="text-[11px] text-muted-foreground">
        วิธีคำนวณ: {t.method.weighting} · ต้นทุน {t.method.costPerLegPct}% ต่อขา · {t.method.prices} · benchmark: {t.method.benchmark} — PAPER MODE ไม่มีคำสั่งเข้าตลาดจริง · ไม่ใช่คำแนะนำการลงทุน
      </p>
    </div>
  )
}

// ---------------- tab ----------------

export default function TrackRecordTab() {
  const track = useApi<TrackView>("/api/track-record")
  const trust = useApi<DataTrustResponse>("/api/data/trust")
  return (
    <TrackRecordView
      track={track.data}
      trust={trust.data}
      trackLoading={track.loading}
      trackError={track.error}
      trustLoading={trust.loading}
      trustError={trust.error}
      onRefresh={() => {
        track.refetch()
        trust.refetch()
      }}
    />
  )
}
