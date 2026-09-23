"use client"

import { useEffect, useState } from "react"
import { readBangkokClock, type SetPhase } from "@/lib/platform/market-session"

/**
 * MarketClock — นาฬิกาเรียลไทม์เขตเวลา Asia/Bangkok + สถานะตลาดหลักทรัพย์ฯ (SET)
 * เวลาทำการ SET (จ.–ศ.): พรีเปิด 09:30–10:00 · เช้า 10:00–12:30 · พักกลางวัน 12:30–13:30
 * · พรีเปิดบ่าย 13:30–14:00 · บ่าย 14:00–16:30 · Pre-close (ATC) 16:30–16:40 · นอกนั้น = ปิดตลาด
 * (ตารางเวลาอยู่ที่ lib/platform/market-session.ts ที่เดียว — วันหยุดตลาดไม่ได้นับรวม)
 * แสดงผลเฉพาะหลัง mount เพื่อเลี่ยง hydration mismatch ระหว่าง server/client
 */

interface IctNow {
  clock: string
  state: SetPhase
}

function readIct(): IctNow {
  const now = readBangkokClock()
  return { clock: now.clock, state: now.phase }
}

const STATE_META: Record<SetPhase, { label: string; dot: string; text: string; title: string }> = {
  open: {
    label: "SET เปิด",
    dot: "status-dot-live",
    text: "text-neon-green",
    title: "ตลาดหลักทรัพย์ไทยเปิดทำการ (10:00–12:30 · 14:00–16:30 น. จ.–ศ.)",
  },
  pre: {
    label: "พรีเปิด",
    dot: "status-dot-pre",
    text: "text-neon-amber",
    title: "ช่วงพรีเปิดตลาด (09:30–10:00 · 13:30–14:00 น.)",
  },
  break: {
    label: "พักกลางวัน",
    dot: "status-dot-pre",
    text: "text-neon-amber",
    title: "พักการซื้อขายช่วงกลางวัน (12:30–13:30 น.) — ช่วงบ่ายเริ่มพรีเปิด 13:30 น.",
  },
  preclose: {
    label: "Pre-close",
    dot: "status-dot-pre",
    text: "text-neon-amber",
    title: "ช่วง Pre-close — จับคู่ราคาปิด ATC (16:30–16:40 น.)",
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
      className={`hidden h-9 items-center gap-2 rounded-full border border-[#ece3cf] bg-white/90 px-3 shadow-[0_1px_2px_rgba(120,90,20,0.06)] transition-colors hover:border-gold/60 sm:flex ${className}`}
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
