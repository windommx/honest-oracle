// value.ts — Value Formation แบบ Volume Profile รายวัน (DAILY PROXY)
// ข้อมูลเราไม่มี volume-at-price จาก tick — ใช้ "มูลค่าซื้อขายรายวันถ่วงที่ราคาแท่งนั้น"
// สร้าง histogram 60 แท่งล่าสุด: POC = ราคาที่เงินไหลผ่านมากสุด, Value Area = 70% รอบ POC
// HVN = แม่เหล็ก · LVN = สุญญากาศที่ราคาพุ่งผ่านเร็ว (ตามเอกสาร — แต่ระดับรายวัน)

import type { OhlcBar, ValueProfile } from "./types"
import { hasHighLow } from "./structure"

const BINS = 24
const WINDOW = 60

export function buildValueProfile(bars: OhlcBar[]): ValueProfile | null {
  if (bars.length < 30) return null
  // ราคาจริงของแต่ละแท่ง: แถวที่ไม่มี open/high/low ถูกเติม 0 ตอนโหลด — ใช้ close (ราคาจริงราคาเดียวที่มี)
  // แทนการใช้ 0 เป็นราคา (0 ทำให้ช่วงโปรไฟล์ยืดลงถึง 0 → POC/VA เพี้ยนทั้งชุด)
  const win = bars
    .slice(-WINDOW)
    .filter((b) => b.close > 0)
    .map((b) => {
      const hl = hasHighLow(b)
      return {
        low: hl ? b.low : b.close,
        high: hl ? b.high : b.close,
        mid: hl && b.open > 0 ? (b.close + b.open) / 2 : b.close,
        val: b.val,
      }
    })
  if (win.length === 0) return null
  const min = Math.min(...win.map((b) => b.low))
  const max = Math.max(...win.map((b) => b.high))
  if (!(max > min) || !Number.isFinite(min)) return null
  const binW = (max - min) / BINS

  // น้ำหนักของแท่งกระจายลง 3 ถัง (low/mid/high ของแท่ง) ตามสัดส่วน — คร่าวกว่า tick จริง แต่มีทิศทาง
  const w = new Array<number>(BINS).fill(0)
  for (const b of win) {
    const v = b.val > 0 ? b.val : 1
    const lo = clampBin((b.low - min) / binW)
    const hi = clampBin((b.high - min) / binW)
    const mid = clampBin((b.mid - min) / binW)
    w[mid] += v * 0.5
    w[lo] += v * 0.25
    w[hi] += v * 0.25
  }

  const total = w.reduce((s, v) => s + v, 0)
  if (total <= 0) return null
  const centerOf = (k: number) => min + (k + 0.5) * binW

  // POC
  let pocBin = 0
  for (let k = 1; k < BINS; k++) if (w[k] > w[pocBin]) pocBin = k
  const poc = centerOf(pocBin)

  // Value Area 70% — ขยายจาก POC ไปข้างที่หนักกว่า
  let acc = w[pocBin]
  let lo = pocBin
  let hi = pocBin
  while (acc < total * 0.7 && (lo > 0 || hi < BINS - 1)) {
    const down = lo > 0 ? w[lo - 1] : -1
    const up = hi < BINS - 1 ? w[hi + 1] : -1
    if (up >= down) {
      hi++
      acc += Math.max(0, up)
    } else {
      lo--
      acc += Math.max(0, down)
    }
  }
  // ขอบ Value Area = ขอบล่างของถังล่างสุด / ขอบบนของถังบนสุดที่อยู่ใน VA
  // (เดิมใช้ "กึ่งกลาง" ถัง → ราคาในครึ่งนอกของถังขอบ VA หรือในถัง POC เอง (VA ถังเดียว) ถูกตีว่าอยู่นอก VA)
  const valLow = min + lo * binW
  const valHigh = min + (hi + 1) * binW

  // HVN / LVN — เทียบกับ max bin
  const wMax = Math.max(...w)
  const hvn: number[] = []
  const lvn: number[] = []
  for (let k = 0; k < BINS; k++) {
    if (w[k] <= 0) continue
    if (w[k] >= wMax * 0.6) hvn.push(centerOf(k))
    else if (w[k] <= wMax * 0.12 && k > 0 && k < BINS - 1) lvn.push(centerOf(k))
  }

  // จัดราคาปิดเข้าถังด้วยสูตรเดียวกับตอนกระจายน้ำหนัก แล้วเทียบกับช่วงถังของ VA (ไม่พลาดเพราะทศนิยมที่ขอบถัง)
  const closeBin = clampBin((bars[bars.length - 1].close - min) / binW)
  const closePos = closeBin > hi ? "above_va" : closeBin < lo ? "below_va" : "inside_va"

  return {
    poc,
    valLow,
    valHigh,
    closePos,
    hvn: hvn.slice(0, 4),
    lvn: lvn.slice(0, 4),
  }
}

function clampBin(x: number): number {
  if (!Number.isFinite(x)) return 0
  return Math.min(BINS - 1, Math.max(0, Math.floor(x)))
}
