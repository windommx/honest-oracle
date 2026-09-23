// สีสำหรับ Momentum Map — หุ้นที่ซ้ำข้าม timeframe ใช้สีเดียวกัน
// โทน DAYLIGHT TERMINAL: สีเข้ม saturated อ่านชัดบนพื้นสว่าง (กระดาษขาว)
// หุ้นที่ไม่ซ้ำ = สีเทากลาง (slate) ตามธีมใหม่

export const MAP_PALETTE = [
  "#0891b2", // cyan-600
  "#db2777", // pink-600
  "#059669", // emerald-600
  "#7c3aed", // violet-600
  "#d97706", // amber-600
  "#e11d48", // rose-600
  "#0e7490", // cyan-700
  "#be185d", // pink-700
  "#10b981", // emerald-500
  "#8b5cf6", // violet-500
  "#f59e0b", // amber-500
  "#0d9488", // teal-600
  "#ec4899", // pink-500
  "#65a30d", // lime-600
  "#64748b", // slate-500
  "#c026d3", // fuchsia-600
  "#16a34a", // green-600
  "#ea580c", // orange-600
  "#9333ea", // purple-600
  "#ca8a04", // yellow-600
]

export function colorForIndex(i: number): string {
  return MAP_PALETTE[i % MAP_PALETTE.length]
}

// สีของหุ้นที่ปรากฏครั้งเดียว (ไม่ซ้ำ) = เทากลาง
export const SINGLETON_COLOR = "#94a3b8"
