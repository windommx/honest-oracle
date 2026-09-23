"use client"

import { useMemo } from "react"
import { TrendingDown, TrendingUp } from "lucide-react"
import { useApi } from "@/hooks/use-api"
import type { SignalsResponse } from "@/lib/momentum/contracts"

/**
 * TickerTape — แถบเลื่อนหุ้นโมเมนตัมสูงสุดของวัน (สไตล์ trading terminal)
 * - เรียงตาม score แล้วเลือก 16 ตัวแรก · วนลูป 2 ชุดเพื่อเลื่อนต่อเนื่องไม่มีรอยต่อ
 * - mom / score ของสัญญาณ v2 เป็นคะแนน 0..1 (mom = 0.7·จำนวน TF ที่ติดโผ/7 + 0.3·streak/10) ไม่ใช่ % ผลตอบแทน
 *   → แสดงเป็นคะแนน 0–100 (m.. / s..) ห้ามต่อท้าย %
 * - hover/focus เพื่อหยุดดู · ผู้ใช้ที่ตั้ง prefers-reduced-motion จะเห็นแบบหยุดนิ่ง
 * - ข้อมูลยังไม่มา = skeleton แถบเรียบ ๆ
 */
export default function TickerTape() {
  const { data } = useApi<SignalsResponse>("/api/signals")

  const stocks = useMemo(
    () =>
      [...(data?.stockToday ?? [])]
        .sort((a, b) => b.score - a.score)
        .slice(0, 16),
    [data],
  )

  if (!stocks.length) {
    return (
      <div className="flex h-9 items-center gap-3 border-b border-neon-cyan/10 bg-background/70 px-4" aria-hidden>
        {[64, 88, 72, 96, 60, 80, 76].map((w, i) => (
          <div key={i} className="h-2.5 rounded-full bg-foreground/[0.05]" style={{ width: w }} />
        ))}
      </div>
    )
  }

  const loop = [...stocks, ...stocks]

  return (
    <div
      className="ticker-viewport relative overflow-hidden border-b border-neon-cyan/10 bg-background/70"
      role="marquee"
      aria-label="แถบหุ้นโมเมนตัมสูงสุดของวัน (เลื่อนอัตโนมัติ)"
    >
      <div className="ticker-track flex w-max items-center gap-7 px-7 py-1.5">
        {loop.map((s, i) => {
          const up = s.mom >= 0
          const first = i < stocks.length
          return (
            <span
              key={`${s.symbol}-${i}`}
              aria-hidden={!first}
              className="flex shrink-0 items-center gap-1.5 font-mono text-xs"
            >
              <span className="font-semibold tracking-wide text-foreground">{s.symbol}</span>
              {up ? (
                <TrendingUp className="size-3 text-neon-green" aria-hidden />
              ) : (
                <TrendingDown className="size-3 text-neon-rose" aria-hidden />
              )}
              <span className={up ? "text-neon-green" : "text-neon-rose"}>
                m{Number.isFinite(s.mom) ? (s.mom * 100).toFixed(0) : "—"}
              </span>
              <span className="text-[10px] text-muted-foreground/60">s{(s.score * 100).toFixed(0)}</span>
              <span className="ml-3.5 text-foreground/15" aria-hidden>
                ·
              </span>
            </span>
          )
        })}
      </div>
    </div>
  )
}
