// ============================================================
// Sector mapping สำหรับ Signals Engine v2 (Sector Rotation)
//
// แพลตฟอร์มนี้เก็บแผนที่หุ้น → sector จริงในตาราง SymbolMeta
// (โหลดผ่าน io.ts → loadSectorOf) — static map ด้านล่างเป็น fallback
// สำหรับหุ้นที่ยังไม่มีใน SymbolMeta เท่านั้น
// ============================================================

/** fallback map (ชื่อพอร์ตเดิม) — ตัวจริงใช้ SymbolMeta จาก DB ก่อนเสมอ */
export const SECTOR_MAP: Record<string, string> = {
  PTT: "Energy", PTTEP: "Energy", OR: "Energy", GULF: "Energy", TOP: "Energy",
  KBANK: "Banking", SCB: "Banking", BBL: "Banking", KTB: "Banking",
  CPALL: "Commerce", CRC: "Commerce", AOT: "Transport", MINT: "Commerce",
  DELTA: "Electronic", HANA: "Electronic", KCE: "Electronic", SVI: "Electronic",
  SCC: "Material", IVL: "Material", STA: "Food", TU: "Food", GFPT: "Food",
  BCH: "Health", BDMS: "Health", ADVANC: "ICT", TRUE: "ICT", INTUCH: "ICT",
  AWC: "Property",
}

export const fallbackSectorOf = (s: string): string => SECTOR_MAP[s.toUpperCase()] ?? "OTHER"
