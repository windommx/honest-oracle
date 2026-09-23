"use client"

/**
 * CommandHero — การ์ดต้อนรับด้านบน Command Center (ธีม Gold Ivory)
 *
 * ซ้าย : ป้ายหัวข้อทอง · คำทักทายตามช่วงเวลา (กรุงเทพ) · วันที่ไทย (พ.ศ.) + นาฬิกา · สรุปข้อมูลในระบบ · ปุ่มลัด
 * ขวา  : สถานะตลาด SET · นาฬิกาใหญ่ · วงแหวน breadth (% หุ้นเหนือ MA20) + MA50/MA200
 *
 * เวลา/วันที่/คำทักทาย คำนวณหลัง mount เท่านั้น (กัน hydration mismatch ระหว่าง server กับ client)
 * ค่าที่วัดไม่ได้ (null/NaN) แสดง "—" เสมอ — ไม่เติมตัวเลขเดา
 */

import { useEffect, useState } from "react"
import { Map as MapIcon, Search, ShieldCheck, Trophy } from "lucide-react"
import type { OverviewResponse, SignalMarketDay } from "@/lib/momentum/contracts"
import { readBangkokClock, type SetPhase } from "@/lib/platform/market-session"
import { cn } from "@/lib/utils"
import { Term } from "./glossary"

const PHASE_META: Record<SetPhase, { label: string; dot: string }> = {
  open: { label: "ตลาดเปิด", dot: "status-dot-live" },
  pre: { label: "พรีเปิด", dot: "status-dot-pre" },
  break: { label: "พักกลางวัน", dot: "status-dot-pre" },
  preclose: { label: "Pre-close", dot: "status-dot-pre" },
  closed: { label: "ตลาดปิด", dot: "status-dot-closed" },
}

const THAI_DATE = new Intl.DateTimeFormat("th-TH", {
  timeZone: "Asia/Bangkok",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
})

/** คำทักทายตามชั่วโมงของกรุงเทพ (0–23) */
export function greetingFor(hour: number): string {
  if (hour >= 5 && hour < 12) return "สวัสดียามเช้า"
  if (hour >= 12 && hour < 17) return "สวัสดียามบ่าย"
  if (hour >= 17 && hour < 20) return "สวัสดียามเย็น"
  return "สวัสดียามค่ำ"
}

interface Now {
  clock: string
  phase: SetPhase
  date: string
  greeting: string
}

function readNow(): Now {
  const d = new Date()
  const c = readBangkokClock(d)
  return {
    clock: c.clock,
    phase: c.phase,
    date: THAI_DATE.format(d),
    greeting: greetingFor(Math.floor(c.minuteOfDay / 60)),
  }
}

const fin = (v: number | null | undefined): v is number => v != null && Number.isFinite(v)
const pct = (v: number | null | undefined) => (fin(v) ? `${Math.round(v * 100)}%` : "—")

/** วงแหวนสัดส่วน 0..1 — null = ไม่มีข้อมูล (วงเปล่า + "—") */
function Donut({ value, caption }: { value: number | null; caption: string }) {
  const R = 42
  const C = 2 * Math.PI * R
  const v = fin(value) ? Math.min(1, Math.max(0, value)) : null
  return (
    <div className="relative size-[104px] shrink-0">
      <svg viewBox="0 0 104 104" className="size-full -rotate-90" aria-hidden>
        <circle cx="52" cy="52" r={R} fill="none" stroke="var(--hero-donut-track)" strokeWidth="11" />
        {v !== null && v > 0 ? (
          <circle
            cx="52"
            cy="52"
            r={R}
            fill="none"
            stroke="url(#hero-gold)"
            strokeWidth="11"
            strokeLinecap="round"
            strokeDasharray={`${C * v} ${C}`}
          />
        ) : null}
        <defs>
          <linearGradient id="hero-gold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ecc96b" />
            <stop offset="100%" stopColor="#b8912f" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="text-xl font-extrabold tabular-nums text-foreground">{v === null ? "—" : `${Math.round(v * 100)}%`}</span>
        <span className="mt-1 text-[10px] font-semibold text-muted-foreground">{caption}</span>
      </div>
    </div>
  )
}

export default function CommandHero({
  ov,
  market,
  pendingCount,
  onGoTo,
  onOpenPalette,
}: {
  ov: OverviewResponse
  /** แถวล่าสุดของ /api/signals market (breadth) — null = ยังไม่มา/ไม่มีข้อมูล */
  market: SignalMarketDay | null
  pendingCount: number | null
  onGoTo: (tab: string) => void
  onOpenPalette?: () => void
}) {
  const [now, setNow] = useState<Now | null>(null)

  useEffect(() => {
    let alive = true
    // set ครั้งแรกผ่าน microtask (กัน cascading render ใน effect body) แล้วเดินทุกวินาที
    Promise.resolve().then(() => {
      if (alive) setNow(readNow())
    })
    const id = setInterval(() => {
      if (alive) setNow(readNow())
    }, 1000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  const phase = PHASE_META[now?.phase ?? "closed"]

  return (
    <section className="hero-card p-5 sm:p-7" aria-label="ภาพรวมวันนี้">
      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        {/* ---------- ซ้าย: ทักทาย + สรุป + ปุ่มลัด ---------- */}
        <div className="min-w-0">
          <p className="gold-kicker">Thai Momentum Platform · Command Center 4.0</p>
          {/* h1 ของหน้าอยู่บน header (ชื่อแท็บ) — คำทักทายเป็นหัวข้อระดับ 2 */}
          <h2 className="mt-2 text-[28px] leading-tight font-extrabold tracking-tight text-foreground sm:text-4xl">
            {now?.greeting ?? "สวัสดี"} <span aria-hidden>👋</span>
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {now?.date ?? "—"} · <span className="font-semibold tabular-nums text-gold-ink">{now?.clock ?? "--:--:--"}</span>
          </p>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-foreground/85">
            ข้อมูลในระบบ <b className="tabular-nums">{ov.totalDates.toLocaleString("th-TH")}</b> วัน ·{" "}
            <b className="tabular-nums">{ov.totalSymbols.toLocaleString("th-TH")}</b> หุ้น · ถึง{" "}
            <b className="tabular-nums">{ov.latestDate ?? "—"}</b> — ทุกการตัดสินใจเป็น PAPER MODE 100% ไม่ใช้เงินจริง
            <span className="hidden md:inline">
              {" "}
              · กด <kbd className="rounded-md border border-chip-border bg-chip px-1 font-mono text-[11px]">⌘K</kbd>{" "}
              ค้นหาแท็บได้ทุกหน้า
            </span>
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2.5 sm:flex sm:flex-wrap [&>button]:justify-center">
            <button type="button" className="pill-action" onClick={() => onGoTo("flagship")}>
              <Trophy className="size-4 text-gold-ink" aria-hidden />
              สัญญาณเรือธง
            </button>
            <button type="button" className="pill-action" onClick={() => onGoTo("map")}>
              <MapIcon className="size-4 text-neon-cyan" aria-hidden />
              Momentum Map
            </button>
            <button type="button" className="pill-action" onClick={() => onGoTo("jev")}>
              <ShieldCheck className="size-4 text-neon-green" aria-hidden />
              รออนุมัติ
              <span
                className={cn(
                  "inline-flex min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-bold tabular-nums",
                  pendingCount ? "bg-gold text-[#3b2a06]" : "bg-muted text-muted-foreground",
                )}
              >
                {pendingCount ?? "—"}
              </span>
            </button>
            {onOpenPalette ? (
              <button type="button" className="pill-action" onClick={onOpenPalette}>
                <Search className="size-4 text-muted-foreground" aria-hidden />
                ค้นหา
              </button>
            ) : null}
          </div>
        </div>

        {/* ---------- ขวา: ตลาด + นาฬิกา + breadth ---------- */}
        <div className="hero-panel min-w-0 rounded-3xl p-4 backdrop-blur-sm sm:p-5 lg:w-[360px]">
          <div className="flex justify-center lg:justify-end">
            <span className="inline-flex items-center gap-2 rounded-full border border-chip-border bg-chip px-3 py-1 text-xs font-semibold text-foreground shadow-[0_1px_2px_rgba(120,90,20,0.06)]">
              <span className={cn("status-dot", now ? phase.dot : "status-dot-off")} aria-hidden />
              {phase.label} · เปิด จ.–ศ. 10:00–16:30
            </span>
          </div>
          <p
            className="mt-2 text-center font-extrabold tabular-nums tracking-tight text-foreground lg:text-right"
            style={{ fontSize: "clamp(2.25rem, 5vw, 2.9rem)", lineHeight: 1.05 }}
            aria-label={`เวลาประเทศไทย ${now?.clock ?? "--:--:--"}`}
          >
            {now?.clock ?? "--:--:--"}
          </p>
          <div className="mt-3 flex items-center gap-4">
            <Donut value={market?.b20 ?? null} caption="เหนือ MA20" />
            <div className="min-w-0 text-sm">
              <p className="font-bold text-foreground">
                <Term id="breadth">Breadth</Term> ตลาด
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                MA50 <b className="tabular-nums text-foreground/85">{pct(market?.b50)}</b> · MA200{" "}
                <b className="tabular-nums text-foreground/85">{pct(market?.b200)}</b>
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                ข้อมูล <span className="tabular-nums">{market?.date ?? "—"}</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
