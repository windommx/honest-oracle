"use client"

import { useEffect, useState } from "react"

/**
 * MarketClock — นาฬิกาเรียลไทม์เขตเวลา Asia/Bangkok + สถานะตลาดหลักทรัพย์ฯ (SET)
 * เวลาทำการ SET (สินทรัพย์หลัก): จันทร์–ศุกร์ 10:00–16:30 ICT (continuous)
 * ก่อนเปิด 09:00–09:59 = พรีเปิด · นอกช่วงนี้ = ปิดตลาด
 * แสดงผลเฉพาะหลัง mount เพื่อเลี่ยง hydration mismatch ระหว่าง server/client
 */

type MarketState = "open" | "pre" | "closed"

interface IctNow {
  clock: string
  state: MarketState
}

function readIct(): IctNow {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    hour12: false,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date())
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ""
  const wd = get("weekday")
  const h = Number(get("hour") === "24" ? "00" : get("hour"))
  const m = Number(get("minute"))
  const minuteOfDay = h * 60 + m

  let state: MarketState = "closed"
  const isWeekend = wd === "Sat" || wd === "Sun"
  if (!isWeekend) {
    if (minuteOfDay >= 540 && minuteOfDay < 600) state = "pre" // 09:00–09:59
    else if (minuteOfDay >= 600 && minuteOfDay <= 990) state = "open" // 10:00–16:30
  }

  return { clock: `${get("hour")}:${get("minute")}:${get("second")}`, state }
}

const STATE_META: Record<MarketState, { label: string; dot: string; text: string; title: string }> = {
  open: {
    label: "SET เปิด",
    dot: "status-dot-live",
    text: "text-neon-green",
    title: "ตลาดหลักทรัพย์ไทยเปิดทำการ (10:00–16:30 น. จ.–ศ.)",
  },
  pre: {
    label: "พรีเปิด",
    dot: "status-dot-pre",
    text: "text-neon-amber",
    title: "ช่วงพรีเปิดตลาด (09:00–10:00 น.)",
  },
  closed: {
    label: "ปิดตลาด",
    dot: "status-dot-closed",
    text: "text-neon-rose",
    title: "ตลาดปิดทำการ",
  },
}

export default function MarketClock({ className = "" }: { className?: string }) {
  const [ict, setIct] = useState<IctNow | null>(null)

  useEffect(() => {
    let alive = true
    // เลื่อน set ครั้งแรกไป microtask กัน cascading render ใน effect body
    Promise.resolve().then(() => {
      if (alive) setIct(readIct())
    })
    const id = setInterval(() => {
      if (alive) setIct(readIct())
    }, 1000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  const meta = STATE_META[ict?.state ?? "closed"]

  return (
    <div
      title={meta.title}
      aria-label={`เวลาประเทศไทย ${ict?.clock ?? "--:--:--"} · ${meta.label}`}
      className={`hidden h-9 items-center gap-2 rounded-md border border-border bg-foreground/[0.04] px-2.5 transition-colors hover:border-neon-cyan/40 sm:flex ${className}`}
    >
      <span className={`status-dot ${ict ? meta.dot : "status-dot-off"}`} aria-hidden />
      <span
        className={`font-mono text-xs font-semibold tabular-nums ${ict ? meta.text : "text-muted-foreground"}`}
      >
        {ict?.clock ?? "--:--:--"}
      </span>
      <span className="hidden text-[10px] font-medium text-muted-foreground lg:inline">{meta.label}</span>
      <span className="hidden font-mono text-[10px] text-muted-foreground/70 lg:inline">ICT</span>
    </div>
  )
}
