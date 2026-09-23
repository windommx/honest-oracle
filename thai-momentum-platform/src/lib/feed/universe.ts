// ============================================================
// Feed universe — รายชื่อหุ้นตั้งต้น + แผนที่ sector ของ SET → 13 กลุ่มของแพลตฟอร์ม
//
// หลักการ: รายชื่อในไฟล์นี้เป็น "ค่าตั้งต้นที่ปรับได้" ไม่ใช่ความจริงถาวร — องค์ประกอบดัชนี
// เปลี่ยนทุกครึ่งปี ผู้ใช้แก้รายชื่อในการ์ดได้ทันที และสคริปต์ Python (lab/fetch_set_feed.py)
// ดึงองค์ประกอบดัชนีสดจาก SET ได้เมื่อรันบนเครื่องที่เข้าเน็ตปกติ
// ============================================================

import { TH_SECTORS } from "@/lib/config/thai"
import type { FeedPreset } from "@/lib/momentum/contracts"

export type ThSector = (typeof TH_SECTORS)[number] | "Unknown"

/** แผนที่รหัส/ชื่อ sector ของ SET → กลุ่มที่ชั้นความเสี่ยงของแพลตฟอร์มรู้จัก (config/thai TH_SECTORS) */
const SET_CODE_TO_TH: Record<string, ThSector> = {
  BANK: "Banking",
  FIN: "Finance",
  INSUR: "Finance",
  ENERG: "Energy",
  MINE: "Energy",
  PROP: "Property",
  CONS: "Construction",
  CONMAT: "Construction",
  COMM: "Commerce",
  TOURISM: "Commerce",
  FASHION: "Commerce",
  HOME: "Commerce",
  PROF: "Commerce",
  ICT: "ICT",
  ETRON: "Electronic",
  TRANS: "Transport",
  FOOD: "Food",
  AGRI: "Food",
  HELTH: "Health",
  PERSON: "Health",
  MEDIA: "Media",
  PETRO: "Material",
  PKG: "Material",
  STEEL: "Material",
  PAPER: "Material",
  IMM: "Material",
  AUTO: "Material",
}

/** แปลงชื่อ/รหัส sector ของ SET (อังกฤษ) → กลุ่มของแพลตฟอร์ม — ไม่รู้จัก = "Unknown" (ไม่เดาแทน) */
export function toThSector(setSector: string | null | undefined): ThSector {
  if (!setSector) return "Unknown"
  const raw = setSector.trim()
  const code = SET_CODE_TO_TH[raw.toUpperCase()]
  if (code) return code
  const s = raw.toLowerCase()
  if (s.includes("bank")) return "Banking"
  if (s.includes("insur") || s.includes("financ") || s.includes("securities")) return "Finance"
  if (s.includes("energy") || s.includes("mining") || s.includes("utilit")) return "Energy"
  if (s.includes("property")) return "Property"
  if (s.includes("construction")) return "Construction"
  if (s.includes("information") || s.includes("communication") || s === "ict") return "ICT"
  if (s.includes("electronic")) return "Electronic"
  if (s.includes("transport") || s.includes("logistic")) return "Transport"
  if (s.includes("food") || s.includes("beverage") || s.includes("agri")) return "Food"
  if (s.includes("health") || s.includes("personal") || s.includes("pharma")) return "Health"
  if (s.includes("media") || s.includes("publish")) return "Media"
  if (
    s.includes("petrochem") ||
    s.includes("chemical") ||
    s.includes("packag") ||
    s.includes("steel") ||
    s.includes("metal") ||
    s.includes("paper") ||
    s.includes("industrial") ||
    s.includes("machinery") ||
    s.includes("automotive")
  )
    return "Material"
  if (
    s.includes("commerce") ||
    s.includes("tourism") ||
    s.includes("leisure") ||
    s.includes("fashion") ||
    s.includes("home") ||
    s.includes("professional")
  )
    return "Commerce"
  return "Unknown"
}

/**
 * Universe ตั้งต้น — หุ้นสภาพคล่องสูงบน SET พร้อมรหัส sector ของ SET
 * (รายชื่อ ณ ครึ่งแรกปี 2026 — ตรวจสอบกับองค์ประกอบดัชนีล่าสุดก่อนใช้จริง)
 */
export const DEFAULT_UNIVERSE: { symbol: string; setSector: string; core: boolean }[] = [
  { symbol: "ADVANC", setSector: "ICT", core: true },
  { symbol: "AOT", setSector: "TRANS", core: true },
  { symbol: "AWC", setSector: "PROP", core: true },
  { symbol: "BANPU", setSector: "ENERG", core: true },
  { symbol: "BBL", setSector: "BANK", core: true },
  { symbol: "BCP", setSector: "ENERG", core: false },
  { symbol: "BDMS", setSector: "HELTH", core: true },
  { symbol: "BEM", setSector: "TRANS", core: true },
  { symbol: "BGRIM", setSector: "ENERG", core: true },
  { symbol: "BH", setSector: "HELTH", core: true },
  { symbol: "BJC", setSector: "COMM", core: true },
  { symbol: "BTS", setSector: "TRANS", core: true },
  { symbol: "CBG", setSector: "FOOD", core: true },
  { symbol: "CENTEL", setSector: "TOURISM", core: true },
  { symbol: "COM7", setSector: "COMM", core: true },
  { symbol: "CPALL", setSector: "COMM", core: true },
  { symbol: "CPF", setSector: "FOOD", core: true },
  { symbol: "CPN", setSector: "PROP", core: true },
  { symbol: "CRC", setSector: "COMM", core: true },
  { symbol: "DELTA", setSector: "ETRON", core: true },
  { symbol: "EA", setSector: "ENERG", core: true },
  { symbol: "EGCO", setSector: "ENERG", core: true },
  { symbol: "GLOBAL", setSector: "COMM", core: true },
  { symbol: "GPSC", setSector: "ENERG", core: true },
  { symbol: "GULF", setSector: "ENERG", core: true },
  { symbol: "HANA", setSector: "ETRON", core: false },
  { symbol: "HMPRO", setSector: "COMM", core: true },
  { symbol: "IVL", setSector: "PETRO", core: true },
  { symbol: "KBANK", setSector: "BANK", core: true },
  { symbol: "KCE", setSector: "ETRON", core: false },
  { symbol: "KKP", setSector: "BANK", core: false },
  { symbol: "KTB", setSector: "BANK", core: true },
  { symbol: "KTC", setSector: "FIN", core: true },
  { symbol: "LH", setSector: "PROP", core: true },
  { symbol: "MINT", setSector: "FOOD", core: true },
  { symbol: "MTC", setSector: "FIN", core: true },
  { symbol: "OR", setSector: "ENERG", core: true },
  { symbol: "OSP", setSector: "FOOD", core: true },
  { symbol: "PTT", setSector: "ENERG", core: true },
  { symbol: "PTTEP", setSector: "ENERG", core: true },
  { symbol: "PTTGC", setSector: "PETRO", core: true },
  { symbol: "RATCH", setSector: "ENERG", core: true },
  { symbol: "SAWAD", setSector: "FIN", core: true },
  { symbol: "SCB", setSector: "BANK", core: true },
  { symbol: "SCC", setSector: "CONMAT", core: true },
  { symbol: "SCGP", setSector: "PKG", core: true },
  { symbol: "TISCO", setSector: "BANK", core: true },
  { symbol: "TLI", setSector: "INSUR", core: true },
  { symbol: "TOP", setSector: "ENERG", core: true },
  { symbol: "TRUE", setSector: "ICT", core: true },
  { symbol: "TTB", setSector: "BANK", core: true },
  { symbol: "TU", setSector: "FOOD", core: true },
  { symbol: "WHA", setSector: "PROP", core: true },
  // กลุ่มขนาดกลางที่สภาพคล่องผ่านเกณฑ์ 3 ล้านบาท/วัน (นอก SET50)
  { symbol: "AMATA", setSector: "PROP", core: false },
  { symbol: "AP", setSector: "PROP", core: false },
  { symbol: "BA", setSector: "TRANS", core: false },
  { symbol: "BAM", setSector: "FIN", core: false },
  { symbol: "BCPG", setSector: "ENERG", core: false },
  { symbol: "BLA", setSector: "INSUR", core: false },
  { symbol: "CCET", setSector: "ETRON", core: false },
  { symbol: "ERW", setSector: "TOURISM", core: false },
  { symbol: "GFPT", setSector: "FOOD", core: false },
  { symbol: "ICHI", setSector: "FOOD", core: false },
  { symbol: "IRPC", setSector: "ENERG", core: false },
  { symbol: "ITC", setSector: "FOOD", core: false },
  { symbol: "JMT", setSector: "FIN", core: false },
  { symbol: "MAJOR", setSector: "MEDIA", core: false },
  { symbol: "PLANB", setSector: "MEDIA", core: false },
  { symbol: "PRM", setSector: "TRANS", core: false },
  { symbol: "SIRI", setSector: "PROP", core: false },
  { symbol: "SJWD", setSector: "TRANS", core: false },
  { symbol: "SPALI", setSector: "PROP", core: false },
  { symbol: "SPRC", setSector: "ENERG", core: false },
  { symbol: "STA", setSector: "AGRI", core: false },
  { symbol: "STGT", setSector: "PERSON", core: false },
  { symbol: "TASCO", setSector: "CONMAT", core: false },
  { symbol: "TIDLOR", setSector: "FIN", core: false },
  { symbol: "VGI", setSector: "MEDIA", core: false },
]

/** symbol → sector ของแพลตฟอร์ม (สำหรับ SymbolMeta) */
export const DEFAULT_SECTOR_MAP: Record<string, string> = Object.fromEntries(
  DEFAULT_UNIVERSE.map((u) => [u.symbol, toThSector(u.setSector)]),
)

const CORE_SYMBOLS = DEFAULT_UNIVERSE.filter((u) => u.core).map((u) => u.symbol)

export const FEED_PRESETS: FeedPreset[] = [
  {
    id: "SET50",
    label: "SET50 (ตั้งต้น)",
    description: `หุ้นขนาดใหญ่สภาพคล่องสูง ${CORE_SYMBOLS.length} ตัว — รายชื่อตั้งต้น ปรับได้ตามองค์ประกอบดัชนีล่าสุด`,
    symbols: CORE_SYMBOLS,
  },
  {
    id: "CORE",
    label: "SET50 + ขนาดกลาง",
    description: `ตั้งต้น ${DEFAULT_UNIVERSE.length} ตัว รวมหุ้นขนาดกลางที่มูลค่าซื้อขายผ่านเกณฑ์ 3 ล้านบาท/วัน`,
    symbols: DEFAULT_UNIVERSE.map((u) => u.symbol),
  },
]

const SYMBOL_RE = /^[A-Z0-9][A-Z0-9&.-]{0,11}$/

/**
 * แปลงข้อความรายชื่อ (คั่นด้วย , ช่องว่าง หรือขึ้นบรรทัดใหม่) → symbol ตัวพิมพ์ใหญ่ ไม่ซ้ำ
 * ตัด suffix ".BK" ของ Yahoo ออกให้ และคืน invalid แยกไว้ (ไม่ทิ้งเงียบ ๆ)
 */
export function parseSymbolList(text: string): { symbols: string[]; invalid: string[] } {
  const symbols: string[] = []
  const invalid: string[] = []
  const seen = new Set<string>()
  for (const tokRaw of text.split(/[\s,;]+/)) {
    const tok = tokRaw.trim()
    if (!tok) continue
    // อนุญาต preset id ให้ขยายเป็นรายชื่อ
    const preset = FEED_PRESETS.find((p) => p.id.toLowerCase() === tok.toLowerCase())
    if (preset) {
      for (const s of preset.symbols) {
        if (!seen.has(s)) {
          seen.add(s)
          symbols.push(s)
        }
      }
      continue
    }
    const sym = tok.toUpperCase().replace(/\.BK$/, "")
    if (!SYMBOL_RE.test(sym)) {
      invalid.push(tok)
      continue
    }
    if (!seen.has(sym)) {
      seen.add(sym)
      symbols.push(sym)
    }
  }
  return { symbols, invalid }
}

/** sector ของ symbol: ค่าที่ผู้ใช้ส่งมา → universe ตั้งต้น → Unknown (ไม่เดาแทน) */
export function sectorForSymbol(symbol: string, overrides?: Record<string, string>): string {
  const s = symbol.toUpperCase()
  // overrides มาจาก JSON ของผู้ใช้ — ค่าที่ไม่ใช่ข้อความ (เช่น {"PTT": 1}) ต้องไม่ทำให้ ingest ล้มกลางทาง
  const raw: unknown = overrides?.[s] ?? overrides?.[symbol]
  const o = typeof raw === "string" ? raw.trim().slice(0, 40) : ""
  if (o) {
    if ((TH_SECTORS as readonly string[]).includes(o)) return o
    const mapped = toThSector(o)
    return mapped === "Unknown" ? o : mapped // ชื่อกลุ่มที่ผู้ใช้ตั้งเองคงไว้ตามที่ส่งมา
  }
  return DEFAULT_SECTOR_MAP[s] ?? "Unknown"
}
