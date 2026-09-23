// ============================================================
// Thai-market configuration — ค่าที่ปรับจากเอกสาร "เน้นการนำระบบไปใช้
// ลงทุนหุ้นไทยจริง" เป็น single source of truth สำหรับทุกชั้นของระบบ
//
// แนวคิด: ตลาด SET เป็น momentum + liquidity-driven แต่มี slippage สูง
// นอก SET100, หุ้นวิ่งเป็นกลุ่มอุตสาหกรรม, และ retail สร้าง overreact
// จึงต้องเข้มงวดกว่าค่าเริ่มต้นสากลในทุกมิติ
// ============================================================

/** ตัวกรองขั้นต่ำ (เดิม 1.0 / 1M → ปรับขึ้นสำหรับตลาดไทย) */
export const TH_MIN_PRICE = 1.5 // เลี่ยงหุ้นราคาต่ำมาก
export const TH_MIN_VALUE_5D = 3_000_000 // มูลค่าซื้อขาย ≥ 3 ล้านบาท/วัน ติดกัน 5 วัน
export const TH_TOP_N = 25 // จำนวนอันดับต่อ timeframe (เดิม 30)

/** กติกากลยุทธ์ที่สมดุลสำหรับ SET */
export const TH_STRATEGY = {
  k: 3, // ติดอย่างน้อย 3 โผพร้อมกัน
  hold: 8, // ถือ 8-12 วัน เหมาะกับ momentum ไทย
  stopPct: 0.09, // stop -9% (ตลาดไทยแกว่งแรง)
  maxPos: 7, // ไม่เกิน 7-8 ตัว (correlation ระหว่างหุ้นสูง)
  costBps: 30, // commission ต่อขา
  slipBpsBase: 40, // slippage ฐานต่อขา (สูงกว่าตลาดใหญ่)
} as const

/** เพดานความเสี่ยงระดับพอร์ต */
export const TH_RISK = {
  maxWeeklyDD: -0.05, // kill-switch รายสัปดาห์ (เข้มขึ้นจาก -6%)
  volTarget: 0.13, // เป้าความผันผวนรายปี 13%
  tradeBaht: 40_000, // ขนาดไม้ต่อครั้ง (ปรับตามเงินทุน)
  maxParticipation: 0.04, // ไม่เกิน 4% ของ ADV ต่อไม้
} as const

/** Sector limits — บังคับไม่ให้พอร์ตกระจุกอุตสาหกรรมเดียว */
export const TH_MAX_SECTOR_WEIGHT = 0.3 // น้ำหนักสูงสุดต่อ industry = 30%
export const TH_MAX_NAMES_PER_SECTOR = 3 // จำนวนหุ้นสูงสุดต่อ industry = 3 ตัว
export const TH_HARD_REJECT_UNKNOWN = false // ตัดหุ้นที่ยังไม่รู้ sector (เปิดได้ตามสไตล์)

/** Sector groups — กลุ่มอุตสาหกรรมที่มักวิ่งด้วยกันในตลาดไทย (ห้ามรวมกันเกินเพดาน) */
export const TH_SECTOR_GROUPS: Record<string, string[]> = {
  Financials: ["Banking", "Finance"],
  EnergyComplex: ["Energy", "Material"],
  PropertyChain: ["Property", "Construction"],
  Consumer: ["Commerce", "Food"],
  Tech: ["ICT", "Electronic"],
}
export const TH_GROUP_MAX_WEIGHT: Record<string, number> = {
  Financials: 0.35,
  EnergyComplex: 0.4,
  PropertyChain: 0.35,
  Consumer: 0.4,
  Tech: 0.4,
}

/** กลุ่มอุตสาหกรรมมาตรฐาน SET ที่ระบบรองรับ */
export const TH_SECTORS = [
  "Banking",
  "Energy",
  "Property",
  "Commerce",
  "ICT",
  "Electronic",
  "Transport",
  "Food",
  "Health",
  "Finance",
  "Material",
  "Construction",
  "Media",
] as const

/** แผนการนำไปใช้จริง 3 เฟส (จากเอกสาร — แสดงใน UI เป็น checklist) */
export const TH_ROADMAP = [
  {
    phase: 1,
    title: "วิจัยและพิสูจน์ (2-4 สัปดาห์)",
    items: [
      "Backfill ข้อมูลจาก Amibroker ย้อนหลังอย่างน้อย 3 ปี",
      "รัน Profit Engine → ดู verdict + CAGR/MaxDD/Sharpe หลังต้นทุน",
      "รัน CPCV → ดู Long-Short gap และความเสถียรข้าม paths",
    ],
  },
  {
    phase: 2,
    title: "Paper Trading (อย่างน้อย 8-12 สัปดาห์)",
    items: [
      "รัน Jev ทุกวันหลังตลาดปิด (PAPER mode เสมอ)",
      "บันทึกทั้งสัญญาณที่ระบบเลือก + สิ่งที่จะทำจริง",
      "เทียบผลกับ SET Index / SET100 และดู calibration ของ conf",
    ],
  },
  {
    phase: 3,
    title: "เงินจริงขนาดเล็ก",
    items: [
      "เริ่มด้วยเงินไม่เกิน 10-15% ของพอร์ตรวม",
      "ใช้ maxPos 5-6 ตัวก่อน แล้วค่อยขยาย",
      "บังคับใช้ stop และ kill-switch รายสัปดาห์ทุกสัปดาห์",
    ],
  },
] as const
