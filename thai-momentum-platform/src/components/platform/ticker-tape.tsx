"use client"

import { useMemo, useState } from "react"
import { Pause, Play, TrendingDown, TrendingUp } from "lucide-react"
import { useApi } from "@/hooks/use-api"
import type { SignalsResponse } from "@/lib/momentum/contracts"

/**
 * TickerTape — แถบเลื่อนหุ้นโมเมนตัมสูงสุดของวัน (สไตล์ trading terminal)
 * - เรียงตาม score แล้วเลือก 16 ตัวแรก · วนลูป 2 ชุดเพื่อเลื่อนต่อเนื่องไม่มีรอยต่อ
 * - mom / score ของสัญญาณ v2 เป็นคะแนน 0..1 (mom = 0.7·จำนวน TF ที่ติดโผ/7 + 0.3·streak/10) ไม่ใช่ % ผลตอบแทน
 *   → แสดงเป็นคะแนน 0–100 (m.. / s..) ห้ามต่อท้าย %
 * - หยุดได้ 3 ทาง: hover · ปุ่มหยุด/เล่น (คีย์บอร์ดใช้ได้ — WCAG 2.2.2) · prefers-reduced-motion = หยุดนิ่งถาวร
 * - อยู่ใน <aside> ที่มีชื่อ → เป็น landmark (เนื้อหานอก main ยังนำทางด้วย screen reader ได้)
 * - ข้อมูลยังไม่มา = skeleton แถบเรียบ ๆ
 */
export default function TickerTape() {
  const { data } = useApi<SignalsResponse>("/api/signals")
  const [paused, setPaused] = useState(false)

  const stocks = useMemo(
    () =>
      [...(data?.stockToday ?? [])]
        .sort((a, b) => b.score - a.score)
        .slice(0, 16),
    [data],
  )

  if (!stocks.length) {
    return (
      <div className="flex h-9 items-center gap-3 border-b border-sidebar-border bg-chip/55 px-4" aria-hidden>
        {[64, 88, 72, 96, 60, 80, 76].map((w, i) => (
          <div key={i} className="h-2.5 rounded-full bg-foreground/[0.06]" style={{ width: w }} />
        ))}
      </div>
    )
  }

  const loop = [...stocks, ...stocks]

  return (
    <aside
      aria-label="แถบหุ้นโมเมนตัมสูงสุดของวัน"
      className="flex min-w-0 items-stretch border-b border-sidebar-border bg-chip/55"
    >
      <div className="ticker-viewport relative min-w-0 flex-1 overflow-hidden" data-paused={paused}>
        <div role="marquee" aria-label="เลื่อนอัตโนมัติ — m = คะแนนโมเมนตัม · s = คะแนนรวม (0–100)" className="ticker-track flex w-max items-center gap-7 px-7 py-1.5">
          {loop.map((s, i) => {
            const up = s.mom >= 0
            const first = i < stocks.length
            return (
              <span
                key={`${s.symbol}-${i}`}
                aria-hidden={!first}
                className="flex shrink-0 items-center gap-1.5 font-mono text-xs"
              >
                <span className="font-bold tracking-wide text-foreground">{s.symbol}</span>
                {up ? (
                  <TrendingUp className="size-3 text-neon-green" aria-hidden />
                ) : (
                  <TrendingDown className="size-3 text-neon-rose" aria-hidden />
                )}
                <span className={up ? "text-neon-green" : "text-neon-rose"}>
                  m{Number.isFinite(s.mom) ? (s.mom * 100).toFixed(0) : "—"}
                </span>
                <span className="text-[11px] text-muted-foreground">s{(s.score * 100).toFixed(0)}</span>
                <span className="ml-3.5 text-foreground/20" aria-hidden>
                  ·
                </span>
              </span>
            )
          })}
        </div>
      </div>
      <button
        type="button"
        onClick={() => setPaused((p) => !p)}
        aria-pressed={paused}
        aria-label={paused ? "เล่นแถบหุ้นเลื่อนต่อ" : "หยุดแถบหุ้นเลื่อน"}
        title={paused ? "เล่นต่อ" : "หยุดชั่วคราว"}
        className="flex w-9 shrink-0 items-center justify-center border-l border-sidebar-border text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground motion-reduce:hidden"
      >
        {paused ? <Play className="size-3.5" aria-hidden /> : <Pause className="size-3.5" aria-hidden />}
      </button>
    </aside>
  )
}
