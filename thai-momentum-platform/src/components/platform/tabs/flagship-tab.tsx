"use client"

// แท็บ FLAGSHIP — สัญญาณเรือธง (Task 19)
// อ่านรายงานจาก GET /api/flagship — สายพานคัดกรอง 6 ด่านจากทุกเอนจินของแพลตฟอร์ม
// แล้วจัดอันดับ 1–10 ด้วย ReliabilityScore น้ำหนักลงทะเบียนล่วงหน้า
//
// กติกาความจริงใจของแท็บนี้:
//  - แสดงป้าย "ไม่การันตีกำไร" เสมอ — อันดับ 1–10 คือความน่าเชื่อถือ ไม่ใช่คำสั่งซื้อ
//  - ถ้าผ่านไม่ครบ 10 ตัว แสดงเท่าที่ผ่านจริง พร้อมเหตุผลการคัดออก (veto log)
//  - ทุกคะแนนขยายดูที่มาได้ (weights breakdown) — ไม่มีกล่องดำ

import { Fragment, useMemo, useState, type ReactNode } from "react"
import {
  BookOpenCheck,
  ChevronDown,
  ChevronRight,
  Filter,
  Medal,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Trophy,
  XCircle,
} from "lucide-react"
import { useApi } from "@/hooks/use-api"
import type { FlagshipResponse, RankedSignal, SignalTier } from "@/lib/flagship/types"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  EmptyNote,
  FeatureModule,
  Meter,
  OptionsBar,
  Segmented,
  ToggleChip,
} from "@/components/platform/feature-module"
import { cn } from "@/lib/utils"

// ---------- helpers ----------

function tierBadge(t: SignalTier): ReactNode {
  if (t === "A")
    return (
      <Badge className="border-neon-green/40 bg-neon-green/10 text-neon-green" title="ผ่านทุกด่าน + คะแนนรวม ≥ 70">
        Tier A
      </Badge>
    )
  if (t === "B")
    return (
      <Badge className="border-neon-cyan/40 bg-neon-cyan/10 text-neon-cyan" title="ผ่านเกณฑ์กลาง (คะแนน 55–69)">
        Tier B
      </Badge>
    )
  return (
    <Badge variant="secondary" className="text-muted-foreground" title="เฝ้าดู — คะแนนยังไม่ถึงเกณฑ์">
      Tier C
    </Badge>
  )
}

function modeBadge(mode: FlagshipResponse["meta"]["mode"], why: string): ReactNode {
  if (mode === "attack")
    return (
      <Badge className="border-neon-green/40 bg-neon-green/10 text-neon-green" title={why}>
        🟢 โหมดบุก
      </Badge>
    )
  if (mode === "selective")
    return (
      <Badge className="border-neon-amber/40 bg-neon-amber/10 text-neon-amber" title={why}>
        🟡 โหมดคัดเลือก
      </Badge>
    )
  return (
    <Badge className="border-neon-rose/40 bg-neon-rose/10 text-neon-rose" title={why}>
      🔴 โหมดป้องกัน
    </Badge>
  )
}

function rankBadge(rank: number): ReactNode {
  const cls =
    rank === 1
      ? "border-neon-amber/50 bg-neon-amber/15 text-neon-amber"
      : rank <= 3
        ? "border-foreground/25 bg-foreground/[0.07] text-foreground"
        : "border-border bg-foreground/[0.03] text-muted-foreground"
  return (
    <span
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border font-mono text-sm font-bold tabular-nums",
        cls,
      )}
      aria-label={`อันดับ ${rank}`}
    >
      {rank}
    </span>
  )
}

function gateStatusBadge(status: "open" | "caution" | "closed"): ReactNode {
  if (status === "open")
    return <Badge className="border-neon-green/35 bg-neon-green/10 text-neon-green">เปิดทาง</Badge>
  if (status === "caution")
    return <Badge className="border-neon-amber/35 bg-neon-amber/10 text-neon-amber">เตือน</Badge>
  return <Badge className="border-neon-rose/35 bg-neon-rose/10 text-neon-rose">ปิด</Badge>
}

function agreeChip(s: string): ReactNode {
  const green = /Top \d+%|ผู้นำกลุ่ม|เงินไหลเข้า|ครบ 3 ชั้น|ผ่านทุกด่าน|Bullish sweep/.test(s)
  const cls = green
    ? "border-neon-green/30 bg-neon-green/[0.07] text-neon-green"
    : "border-border bg-foreground/[0.03] text-muted-foreground"
  return (
    <span className={cn("inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium", cls)}>
      {s}
    </span>
  )
}

const TONE_METER = { A: "green", B: "cyan", C: "neutral" } as const

// ---------- แถวสัญญาณอันดับ 1–10 ----------

function BreakdownBar({ label, got, max, tone }: { label: string; got: number; max: number; tone: "green" | "cyan" | "purple" | "amber" | "neutral" }) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[11px] text-muted-foreground">{label}</span>
        <span className="font-mono text-[11px] font-semibold tabular-nums">
          {got.toFixed(1)}
          <span className="text-muted-foreground"> / {max}</span>
        </span>
      </div>
      <Meter value={max > 0 ? got / max : 0} tone={tone} ariaLabel={`${label} ${got}/${max}`} />
    </div>
  )
}

function CheckChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[10px]",
        ok
          ? "border-neon-green/30 bg-neon-green/[0.07] text-neon-green"
          : "border-border bg-foreground/[0.03] text-muted-foreground",
      )}
    >
      {ok ? "✓" : "✗"} {label}
    </span>
  )
}

function RankedRow({
  r,
  open,
  onToggle,
}: {
  r: RankedSignal
  open: boolean
  onToggle: () => void
}) {
  const maxMap = { engine: 35, confluence: 25, trend: 15, evidence: 15, risk: 10 }
  return (
    <div className="min-w-0 rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full min-w-0 items-center gap-3 p-3 text-left transition-colors hover:bg-foreground/[0.02] sm:p-3.5"
      >
        {rankBadge(r.rank)}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono text-sm font-bold">{r.symbol}</span>
            <span className="truncate text-[11px] text-muted-foreground">{r.sector}</span>
            {tierBadge(r.tier)}
            <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
              @ {r.close.toFixed(2)} ฿
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {r.agrees.slice(0, 3).map((a, i) => (
              <Fragment key={i}>{agreeChip(a)}</Fragment>
            ))}
            {r.agrees.length > 3 ? (
              <span className="inline-flex items-center px-1 text-[10px] text-muted-foreground">
                +{r.agrees.length - 3} เหตุผล
              </span>
            ) : null}
          </div>
          {!r.passedAllGates && r.gateNote ? (
            <p className="mt-1 truncate text-[10px] font-medium text-neon-amber" title={r.gateNote}>
              ⚠ เฝ้าดู — {r.gateNote}
            </p>
          ) : null}
        </div>
        <div className="w-24 shrink-0 sm:w-28">
          <div className="flex items-baseline justify-between gap-1">
            <span className="text-[10px] text-muted-foreground">คะแนน</span>
            <span
              className={cn(
                "font-mono text-sm font-bold tabular-nums",
                r.tier === "A" ? "text-neon-green" : r.tier === "B" ? "text-neon-cyan" : "text-foreground",
              )}
            >
              {r.score.toFixed(1)}
            </span>
          </div>
          <Meter value={r.score / 100} tone={TONE_METER[r.tier]} ariaLabel={`คะแนนรวม ${r.score}`} />
          <div className="mt-0.5 text-right font-mono text-[10px] text-muted-foreground tabular-nums">
            confl {r.confluence.total} · mkt {(r.enginePct * 100).toFixed(0)}%
          </div>
        </div>
        {open ? (
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        ) : (
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        )}
      </button>

      {open ? (
        <div className="border-t border-border px-3 py-3 sm:px-3.5">
          <div className="grid gap-4 md:grid-cols-2">
            {/* ซ้าย — คะแนนแยกบล็อก */}
            <div className="min-w-0 space-y-2.5">
              <p className="text-[11px] font-semibold text-muted-foreground">คะแนนรวมแยกบล็อก (น้ำหนักลงทะเบียน)</p>
              <BreakdownBar label="เอนจินโมเมนตัม (percentile)" got={r.breakdown.engine} max={maxMap.engine} tone="cyan" />
              <BreakdownBar label="Confluence 3 ชั้น (Sniper)" got={r.breakdown.confluence} max={maxMap.confluence} tone="green" />
              <BreakdownBar label="คุณภาพเทรนด์ (MA20/50/60 + ret20)" got={r.breakdown.trend} max={maxMap.trend} tone="purple" />
              <BreakdownBar label="หลักฐานเงินไหล/กลุ่ม/ร่องรอย" got={r.breakdown.evidence} max={maxMap.evidence} tone="amber" />
              <BreakdownBar label="ความเสี่ยง (วอลุ่มยิ่งต่ำยิ่งดี)" got={r.breakdown.risk} max={maxMap.risk} tone="neutral" />
              <div className="flex flex-wrap gap-1 pt-1">
                <CheckChip ok={r.trend.above20} label=">MA20" />
                <CheckChip ok={r.trend.above50} label=">MA50" />
                <CheckChip ok={r.trend.above60} label=">MA60" />
                <CheckChip ok={(r.trend.ret20 ?? -1) > 0} label={`ret20 ${r.trend.ret20 !== null ? `${r.trend.ret20 >= 0 ? "+" : ""}${(r.trend.ret20 * 100).toFixed(1)}%` : "—"}`} />
                <CheckChip ok={r.mfd <= 0} label={`MFD ${r.mfd.toFixed(2)}`} />
                <CheckChip ok={r.symVolPct <= 0.8} label={`วอลุ่ม p${(r.symVolPct * 100).toFixed(0)}`} />
              </div>
            </div>

            {/* ขวา — เหตุผล 3 ชั้นของ Confluence + หลักฐาน */}
            <div className="min-w-0 space-y-2">
              <p className="text-[11px] font-semibold text-muted-foreground">
                Confluence Checklist — Location {r.confluence.location ?? "—"} · Value {r.confluence.value ?? "—"} · Behavior {r.confluence.behavior} (รวม {r.confluence.total}/100)
              </p>
              <div className="space-y-1.5">
                {[
                  { title: "Location (โครงสร้าง)", reasons: r.confluence.locationReasons },
                  { title: "Value (Volume Profile)", reasons: r.confluence.valueReasons },
                  { title: "Behavior (Order Flow proxy)", reasons: r.confluence.behaviorReasons },
                ].map((g) => (
                  <div key={g.title} className="min-w-0 rounded-lg border border-border/60 bg-foreground/[0.02] px-2.5 py-1.5">
                    <p className="text-[10px] font-medium text-muted-foreground">{g.title}</p>
                    <ul className="mt-0.5 grid gap-0.5 text-[11px] leading-4">
                      {g.reasons.length ? (
                        g.reasons.map((s, i) => (
                          <li key={i} className="text-muted-foreground">· {s}</li>
                        ))
                      ) : (
                        <li className="text-muted-foreground">— ไม่มีเหตุผล (ชั้นนี้ปิด)</li>
                      )}
                    </ul>
                  </div>
                ))}
              </div>
              <div className="rounded-lg border border-border/60 bg-foreground/[0.02] px-2.5 py-1.5">
                <p className="text-[10px] font-medium text-muted-foreground">หลักฐานที่นับคะแนน (evidence 15)</p>
                <ul className="mt-0.5 grid gap-0.5 text-[11px] leading-4">
                  {r.evidenceDetail.map((s, i) => (
                    <li key={i} className="text-muted-foreground">· {s}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

// ---------- skeleton / error ----------

function FlagshipSkeleton() {
  return (
    <div className="grid gap-4" aria-busy="true">
      <Card>
        <CardContent className="grid gap-3 pt-6">
          <Skeleton className="h-6 w-72 max-w-full" />
          <Skeleton className="h-4 w-full max-w-xl" />
          <div className="grid gap-2 sm:grid-cols-4">
            <Skeleton className="h-6" />
            <Skeleton className="h-6" />
            <Skeleton className="h-6" />
            <Skeleton className="h-6" />
          </div>
        </CardContent>
      </Card>
      <Skeleton className="h-44" />
      <div className="grid gap-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
    </div>
  )
}

// ---------- แท็บหลัก ----------

type TierFilter = "all" | "ab" | "a"

export default function FlagshipTab() {
  const { data, error, loading, refetch } = useApi<FlagshipResponse>("/api/flagship")
  const [tierFilter, setTierFilter] = useState<TierFilter>("all")
  const [expandAll, setExpandAll] = useState(false)
  const [openRows, setOpenRows] = useState<Set<string>>(new Set())

  const filtered = useMemo(() => {
    if (!data) return []
    if (tierFilter === "a") return data.ranked.filter((r) => r.tier === "A")
    if (tierFilter === "ab") return data.ranked.filter((r) => r.tier === "A" || r.tier === "B")
    return data.ranked
  }, [data, tierFilter])

  const toggleRow = (symbol: string) =>
    setOpenRows((prev) => {
      const next = new Set(prev)
      if (next.has(symbol)) next.delete(symbol)
      else next.add(symbol)
      return next
    })

  const isOpen = (symbol: string) => (expandAll ? true : openRows.has(symbol))

  if (loading && !data) return <FlagshipSkeleton />
  if (error || !data) {
    return (
      <div className="grid gap-4">
        <Alert variant="destructive">
          <ShieldAlert className="size-4" aria-hidden />
          <AlertTitle>โหลดสัญญาณเรือธงไม่สำเร็จ</AlertTitle>
          <AlertDescription>
            {error ?? "ไม่พบข้อมูล"}
            <div className="mt-3">
              <Button size="sm" variant="outline" onClick={refetch} className="min-h-9">
                <RefreshCw className="size-3.5" aria-hidden /> ลองใหม่
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  const totalVeto = data.vetoStages.reduce((s, v) => s + v.count, 0)

  return (
    <div className="grid gap-4">
      {/* ---------- หัวแท็บ ---------- */}
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-neon-amber/25 bg-neon-amber/10 text-neon-amber">
          <Trophy className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-bold">FLAGSHIP — สัญญาณเรือธง อันดับ 1–10</h1>
          <p className="truncate text-[11px] text-muted-foreground">
            คัดกรองจากทุกกระบวนการของแพลตฟอร์ม 6 ด่าน · วันล่าสุด {data.meta.latestDate || "—"} ·{" "}
            คำนวณ {(data.meta.runtimeMs / 1000).toFixed(1)} วินาที
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {modeBadge(data.meta.mode, data.meta.modeWhy)}
          <Badge
            className={
              data.meta.isSynthetic
                ? "border-neon-amber/40 bg-neon-amber/10 text-neon-amber"
                : "border-neon-green/40 bg-neon-green/10 text-neon-green"
            }
            title="ที่มาข้อมูล — ตรวจจาก EventLog (seed vs ingest)"
          >
            {data.meta.dataLabel}
          </Badge>
          <Button size="sm" variant="outline" onClick={refetch} className="min-h-9 sm:min-h-8" aria-label="รีเฟรช">
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} aria-hidden />
          </Button>
        </div>
      </div>

      {/* ---------- ป้ายความจริงใจ (แสดงเสมอ) ---------- */}
      <Alert className="border-neon-amber/30 bg-neon-amber/[0.06]">
        <ShieldAlert className="size-4 text-neon-amber" aria-hidden />
        <AlertTitle className="text-neon-amber">กติกาความจริงใจ — อ่านก่อนใช้สัญญาณ</AlertTitle>
        <AlertDescription className="text-foreground/80">
          {data.meta.honestyNotice}
        </AlertDescription>
      </Alert>

      {/* ---------- F1 สายพานคัดกรอง ---------- */}
      <FeatureModule
        code="F1 · FUNNEL"
        title="สายพานคัดกรอง 6 ด่าน — จากทุกเอนจินของแพลตฟอร์ม"
        desc="G1 ข้อมูล+สภาพคล่อง → G2 โมเมนตัม → G3 กลุ่มอุตสาหกรรม → G4 Confluence 3 ชั้น → จัดอันดับด้วย ReliabilityScore"
        icon={Filter}
        hue="cyan"
        status={{ kind: data.ranked.length ? "ready" : "warn", text: data.ranked.length ? "ผ่านแล้ว" : "ไม่มีผ่าน" }}
      >
        {/* แถบด่านคัดกรอง */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          {data.gates.map((g) => (
            <div key={g.id} className="min-w-0 rounded-lg border border-border bg-foreground/[0.02] px-2.5 py-2" title={g.desc}>
              <p className="truncate text-[10px] font-medium text-muted-foreground">
                {g.id} · {g.name}
              </p>
              <p className="font-mono text-sm font-bold tabular-nums">
                {g.inCount} <span className="text-muted-foreground">→</span>{" "}
                <span className={g.outCount > 0 ? "text-neon-green" : "text-neon-rose"}>{g.outCount}</span>
              </p>
              <p className="truncate text-[10px] text-muted-foreground">
                {g.vetoed > 0 ? `คัดออก ${g.vetoed}` : "ผ่านทั้งหมด"}
              </p>
            </div>
          ))}
        </div>

        {/* ประตูใหญ่ 3 ประตูระดับระบบ */}
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          {data.system.systemGates.map((g) => (
            <div key={g.id} className="flex min-w-0 items-center gap-2.5 rounded-lg border border-border bg-foreground/[0.02] px-3 py-2.5">
              {g.status === "closed" ? (
                <ShieldAlert className="size-4 shrink-0 text-neon-rose" aria-hidden />
              ) : (
                <ShieldCheck
                  className={cn("size-4 shrink-0", g.status === "open" ? "text-neon-green" : "text-neon-amber")}
                  aria-hidden
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <p className="truncate text-xs font-semibold">{g.name}</p>
                  {gateStatusBadge(g.status)}
                </div>
                <p className="truncate text-[10px] text-muted-foreground" title={g.detail}>
                  {g.detail}
                </p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground" title={data.meta.modeWhy}>
          {data.meta.modeWhy}
          {data.system.dqFlags > 0 ? ` · Data Quality เตือน ${data.system.dqFlags} ข้อ` : ""}
        </p>
      </FeatureModule>

      {/* ---------- F2 โผสัญญาณ 1–10 ---------- */}
      <FeatureModule
        code="F2 · RANKED"
        title={
          data.ranked.length > 0
            ? `โผสัญญาณวันนี้ — อันดับ 1–${data.ranked.length} จาก ${data.gates[4]?.outCount ?? 0} ตัวที่ผ่านครบ + กองเฝ้าดู`
            : "โผสัญญาณวันนี้ — ยังไม่มีอันดับ"
        }
        desc="เรียงด้วย ReliabilityScore (สูงสุด 100) — Tier A/B = ผ่านครบทุกด่าน · Tier C = เฝ้าดู (ยังไม่ผ่าน Confluence ติดป้ายชัด) · คลิกแถวขยายดูที่มาคะแนนได้"
        icon={Medal}
        hue="green"
        status={{
          kind: "ready",
          text: `A ${data.ranked.filter((r) => r.tier === "A").length} · B ${data.ranked.filter((r) => r.tier === "B").length} · C ${data.ranked.filter((r) => r.tier === "C").length}`,
        }}
        options={
          <OptionsBar>
            <Segmented<TierFilter>
              ariaLabel="กรองตาม Tier"
              value={tierFilter}
              onChange={setTierFilter}
              dense
              items={[
                { value: "all", label: "ทั้งหมด" },
                { value: "ab", label: "A+B" },
                { value: "a", label: "A เท่านั้น" },
              ]}
            />
            <ToggleChip active={expandAll} onClick={() => setExpandAll((v) => !v)} ariaLabel="ขยายรายละเอียดทั้งหมด">
              ขยายทั้งหมด
            </ToggleChip>
          </OptionsBar>
        }
      >
            {data.ranked.length === 0 ? (
          <EmptyNote minH={120}>
            วันนี้ไม่มีสัญญาณที่ผ่านครบทุกด่าน และไม่มีแม้แต่กองเฝ้าดู — ระบบ <span className="font-semibold">ไม่บังคับให้ครบ 10 ตัว</span>
            <br />
            ดูเหตุผลการคัดออกในโมดูล F3 ด้านล่างเพื่อดูว่าสายพานตัดตัวไหนและเพราะอะไร
          </EmptyNote>
        ) : (
          <div className="grid gap-2.5">
            {filtered.map((r) => (
              <RankedRow key={r.symbol} r={r} open={isOpen(r.symbol)} onToggle={() => toggleRow(r.symbol)} />
            ))}
            {filtered.length === 0 ? (
              <EmptyNote>ไม่มีสัญญาณใน Tier ที่เลือก — เปลี่ยนตัวกรองกลับเป็น &ldquo;ทั้งหมด&rdquo;</EmptyNote>
            ) : null}
          </div>
        )}

        {/* ใกล้เข้าโผ */}
        {data.nearMiss.length > 0 ? (
          <div className="mt-4">
            <p className="text-[11px] font-semibold text-muted-foreground">
              ใกล้เข้าโผ — อยู่นอก 10 อันดับ (ผ่านครบแต่คะแนนไม่ถึง หรือ Confluence ยังไม่ถึง 45 — ดูเหตุผลรายตัว)
            </p>
            <div className="mt-2 grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
              {data.nearMiss.map((n) => (
                <div key={n.symbol} className="min-w-0 rounded-lg border border-border/60 bg-foreground/[0.02] px-2.5 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="font-mono text-xs font-bold">{n.symbol}</span>
                    <span className="truncate text-[10px] text-muted-foreground">{n.sector}</span>
                    <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">
                      confl {n.confluenceTotal} · mkt {(n.enginePct * 100).toFixed(0)}%
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[10px] text-muted-foreground" title={n.reason}>
                    {n.reason}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </FeatureModule>

      {/* ---------- F3 บันทึกการคัดออก ---------- */}
      <FeatureModule
        code="F3 · VETO LOG"
        title={`บันทึกการคัดออก — ${totalVeto} รายการ ทุกการตัดมีเหตุผล`}
        desc="หลักเดียวกับทั้งระบบ: การคัดออกต้องบันทึกเหตุผลเสมอ ห้ามหายไปเงียบ ๆ"
        icon={XCircle}
        hue="amber"
        status={{ kind: totalVeto > 0 ? "ready" : "warn", text: totalVeto > 0 ? `${totalVeto} รายการ` : "ไม่มี" }}
        dense
      >
        <div className="grid max-h-96 gap-2 overflow-y-auto pr-1 md:grid-cols-2">
          {data.vetoStages.map((v) => (
            <div key={v.stage} className="min-w-0 rounded-lg border border-border/60 bg-foreground/[0.02] p-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {v.stage}
                </span>
                <p className="min-w-0 truncate text-xs font-semibold">{v.name}</p>
                <Badge variant="secondary" className="ml-auto shrink-0 font-mono text-[10px]">
                  คัดออก {v.count}
                </Badge>
              </div>
              {v.examples.length ? (
                <ul className="mt-1.5 grid gap-1">
                  {v.examples.map((ex, i) => (
                    <li key={i} className="flex min-w-0 items-start gap-2 text-[11px] leading-4">
                      <span className="shrink-0 font-mono font-semibold">{ex.symbol}</span>
                      <span className="min-w-0 text-muted-foreground">{ex.reason}</span>
                    </li>
                  ))}
                  {v.count > v.examples.length ? (
                    <li className="text-[10px] text-muted-foreground">… และอีก {v.count - v.examples.length} รายการ</li>
                  ) : null}
                </ul>
              ) : (
                <p className="mt-1.5 text-[11px] text-muted-foreground">— ไม่มีการคัดออกในด่านนี้</p>
              )}
            </div>
          ))}
        </div>
      </FeatureModule>

      {/* ---------- F4 เกณฑ์ลงทะเบียน ---------- */}
      <FeatureModule
        code="F4 · METHOD"
        title="เกณฑ์ที่ลงทะเบียนไว้ล่วงหน้า — ตรวจสอบได้ทุกบรรทัด"
        desc="น้ำหนักและเกณฑ์ตัดสินถูกเขียนไว้ก่อนดูผล ไม่มีพารามิเตอร์แอบแฝง ไม่มีการจับเข้ากับข้อมูลย้อนหลัง"
        icon={BookOpenCheck}
        hue="purple"
        dense
      >
        <div className="grid gap-3 md:grid-cols-2">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-muted-foreground">น้ำหนักคะแนน ReliabilityScore (รวม 100)</p>
            <div className="mt-1.5 grid gap-1 text-[11px]">
              {[
                ["เอนจินโมเมนตัม (Signals Panel)", "35", "percentile คะแนนรวมของวัน (mom+MFD+กลุ่ม+วอลุ่ม)"],
                ["Confluence 3 ชั้น (SET Sniper)", "25", "Location 0.40 × Value 0.30 × Behavior 0.30 ต่อ 100"],
                ["คุณภาพเทรนด์", "15", "อยู่เหนือ MA20/MA50/MA60 + ret20 > 0 (ข้อละ 3.75)"],
                ["หลักฐานเงินไหล/กลุ่ม/ร่องรอย", "15", "สะสม 5 + ผู้นำกลุ่ม 5 + sweep/FVG 5"],
                ["ความเสี่ยงวอลุ่ม", "10", "(1 − percentile วอลุ่ม) — ต่ำได้เปรียบ"],
              ].map(([a, b, c]) => (
                <div key={a} className="flex min-w-0 items-baseline gap-2 rounded-md bg-foreground/[0.02] px-2 py-1">
                  <span className="min-w-0 flex-1 truncate" title={c}>{a}</span>
                  <span className="shrink-0 font-mono font-bold tabular-nums">{b}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Tier A ≥ 70 และ Confluence ไม่ใช่ low · Tier B ≥ 55 · โหมดป้องกันตัด Tier A ทั้งหมด · กองเฝ้าดู (Tier C ที่ยังไม่ผ่าน G4) คะแนนถูกจำกัดเพดาน 54.9 เพราะ Tier B ขึ้นไปสงวนสำหรับผู้ผ่านครบทุกด่าน
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-muted-foreground">เกณฑ์ด่านคัดกรอง</p>
            <ul className="mt-1.5 grid gap-1 text-[11px] text-muted-foreground">
              <li>· <span className="font-medium text-foreground">G1</span> ราคา ≥ 1.00 ฿ · มูลค่าเฉลี่ย 20 วัน ≥ 1 ล้าน · ประวัติ ≥ 60 วัน</li>
              <li>· <span className="font-medium text-foreground">G2</span> โมเมนตัมครึ่งบน (percentile ≥ 50%) · MFD &lt; 0.45 (เกณฑ์เดียวกับ Signals Engine)</li>
              <li>· <span className="font-medium text-foreground">G3</span> กลุ่มไม่อยู่ 2 อันดับท้ายของตลาด (เกณฑ์เดียวกับ GATES.blockSectorBottom)</li>
              <li>· <span className="font-medium text-foreground">G4</span> Confluence ≥ 45 (verdict กลางขึ้นไป) — ตรวจทุกตัวที่ผ่าน G3 จากข้อมูล OHLC ในฐานข้อมูล (ไม่จำกัด watchlist)</li>
            </ul>
            <p className="mt-2 text-[11px] font-semibold text-muted-foreground">หมายเหตุของรอบนี้</p>
            <ul className="mt-1 grid gap-1 text-[11px] text-muted-foreground">
              {data.meta.notes.map((n, i) => (
                <li key={i}>· {n}</li>
              ))}
            </ul>
          </div>
        </div>
        <p className="mt-3 border-t border-border pt-2 text-[10px] leading-4 text-muted-foreground">
          {data.meta.proxyNotice}
        </p>
      </FeatureModule>
    </div>
  )
}
