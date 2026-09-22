// ============================================================
// GLOBAL ENGINES — นำเข้า logic/algorithms ที่พิสูจน์แล้วทั่วโลก
// แล้ว "ทดสอบบนข้อมูล SET ของเราก่อนเสมอ" ด้วยเกณฑ์ preregistered
// (หลักการเดียวกับ Evidence Night: ไม่มีอะไรเข้า config โดยไม่มีหลักฐาน)
// ============================================================

export type EngineVerdict = "PASS" | "WEAK" | "FAIL" | "INFO"

export interface EngineSource {
  authors: string
  year: number
  title: string
  venue: string // วารสาร/แหล่งอ้างอิง
}

export interface EngineIntegration {
  target: string // จุดพ่วงในระบบ เช่น "signals/thai.ts"
  how: string // วิธีใช้ถ้า verdict ผ่าน
}

/** สถิติรูปเบ็ดเตล็ดของแต่ละ engine — เก็บเป็น record กัน schema แข็ง */
export type EngineStats = Record<string, number | string>

export interface EngineEval {
  id: string
  name: string
  source: EngineSource
  thesis: string // แนวคิด 1–2 ประโยค (ไทย)
  verdict: EngineVerdict
  verdictWhy: string // เหตุผลตัดสินอ้างเกณฑ์ที่ลงทะเบียนไว้
  stats: EngineStats
  integration: EngineIntegration
  /** ตัวเลขสำหรับกราฟเล็ก ๆ ในหน้า Evidence (optional) */
  spark?: { label: string; values: number[] }
}

export interface GlobalEnginesReport {
  generatedAt: string
  dates: number // จำนวนวันในตัวอย่าง
  symbols: number
  latestDate: string
  engines: EngineEval[]
  runtimeMs: number
}

/** เกณฑ์ preregistered ของ alpha engines (เดียวกับธรรมเนียม H1 ของ thai-fit) */
export const ALPHA_PASS = { icir: 0.25, meanIC: 0.02, t: 2.0 } as const
export const ALPHA_WEAK = { icir: 0.15, t: 1.5 } as const

/** ตัดสิน alpha engine จาก IC summary — ใช้ร่วมกันทุก engine สาย cross-section */
export function alphaVerdict(meanIC: number, icir: number, t: number): {
  verdict: EngineVerdict
  why: string
} {
  if (icir >= ALPHA_PASS.icir && meanIC >= ALPHA_PASS.meanIC && t >= ALPHA_PASS.t) {
    return {
      verdict: "PASS",
      why: `ICIR ${icir} ≥ ${ALPHA_PASS.icir} · meanIC ${meanIC} ≥ ${ALPHA_PASS.meanIC} · t ${t} ≥ ${ALPHA_PASS.t} (เกณฑ์ลงทะเบียนล่วงหน้า)`,
    }
  }
  if (icir >= ALPHA_WEAK.icir && t >= ALPHA_WEAK.t) {
    return {
      verdict: "WEAK",
      why: `ICIR ${icir} ≥ ${ALPHA_WEAK.icir} และ t ${t} ≥ ${ALPHA_WEAK.t} แต่ไม่ครบเกณฑ์ PASS — เก็บไว้เป็น feature เสริม ไม่ตั้ง engine เอง`,
    }
  }
  return {
    verdict: "FAIL",
    why: `ICIR ${icir} < ${ALPHA_WEAK.icir} หรือ t ${t} < ${ALPHA_WEAK.t} — ไม่นำเข้า (honest verdict)`,
  }
}
