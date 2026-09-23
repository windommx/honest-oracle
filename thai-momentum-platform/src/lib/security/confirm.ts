// ============================================================
// ยืนยันก่อนลบข้อมูลทั้งชุด (pure) — POST /api/seed · replaceDemo ของ /api/feed/ingest (และ /api/feed/fetch)
// DB ว่าง = ไม่มีอะไรให้เสีย → ไม่ต้องยืนยัน · มีข้อมูล = ต้องส่ง {confirm:"RESET"} / {confirm:"REPLACE"}
// (UI มี AlertDialog ยืนยันอยู่แล้ว → ส่ง confirm ตามที่ผู้ใช้กดยืนยัน · สคริปต์ส่งเมื่อใส่ --replace-demo เอง)
// ============================================================

export type DestructiveOp = "seed" | "replaceDemo"

export const CONFIRM_TOKEN: Record<DestructiveOp, "RESET" | "REPLACE"> = {
  seed: "RESET",
  replaceDemo: "REPLACE",
}

/** จำนวนแถวที่การกระทำนั้นจะลบ (นับเฉพาะตารางที่ลบจริงของแต่ละ op) */
export interface ExistingData {
  rawDaily: number
  decisions: number
  positions: number
  trades: number
  pendingGates: number
  backtests: number
  crossAsset: number
}

export const EMPTY_EXISTING: ExistingData = {
  rawDaily: 0,
  decisions: 0,
  positions: 0,
  trades: 0,
  pendingGates: 0,
  backtests: 0,
  crossAsset: 0,
}

export function hasConfirmation(body: unknown, op: DestructiveOp): boolean {
  if (!body || typeof body !== "object") return false
  return (body as { confirm?: unknown }).confirm === CONFIRM_TOKEN[op]
}

export function wouldDelete(existing: ExistingData): boolean {
  return Object.values(existing).some((n) => n > 0)
}

const LABELS: [keyof ExistingData, string, string][] = [
  ["rawDaily", "ราคารายวัน", "แถว"],
  ["decisions", "การตัดสินใจ (audit)", "รายการ"],
  ["positions", "สถานะพอร์ตกระดาษ", "ตัว"],
  ["trades", "ประวัติเทรด", "รายการ"],
  ["pendingGates", "คำสั่งรออนุมัติ", "รายการ"],
  ["backtests", "ผล backtest", "รอบ"],
  ["crossAsset", "ข้อมูลข้ามตลาด (SPX/USDTHB/GOLD)", "แถว"],
]

export function describeExisting(existing: ExistingData): string {
  return LABELS.filter(([k]) => existing[k] > 0)
    .map(([k, label, unit]) => `${label} ${existing[k].toLocaleString("en-US")} ${unit}`)
    .join(" · ")
}

/** body ของคำตอบ 409 — error ภาษาไทยบอกสิ่งที่จะหาย + วิธียืนยัน */
export function confirmationRequired(op: DestructiveOp, existing: ExistingData) {
  const token = CONFIRM_TOKEN[op]
  const what =
    op === "seed"
      ? "การสร้างข้อมูลตัวอย่างจะลบข้อมูลเดิมทั้งหมด"
      : "replaceDemo จะลบข้อมูลตลาดเดิมทั้งหมด (ไม่ใช่เฉพาะข้อมูลตัวอย่าง)"
  return {
    error: `${what}: ${describeExisting(existing)} — ยืนยันโดยส่ง {"confirm":"${token}"} มาด้วย (ระบบจะสำรองฐานข้อมูลให้อัตโนมัติก่อนลบ)`,
    code: "confirm_required",
    confirmRequired: token,
    existing,
  }
}
