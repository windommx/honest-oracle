// ============================================================
// Provenance + licensing ของแหล่งข้อมูล — "ข้อมูลมาจากไหน ใช้ได้แค่ไหน เชื่อได้แค่ไหน"
// pure ทั้งไฟล์ (ไม่แตะ DB) — ชั้น DB (trust.ts / track) ส่ง EventLog มาให้
//
// หลักการ: ป้ายต้องบอกความจริงที่ผู้ใช้ต้องรู้ก่อนเชื่อตัวเลข
//   - ทางการหรือไม่ · สิทธิ์การใช้ (ส่วนตัว/เชิงพาณิชย์) · ราคาปรับปันผลหรือไม่ · มูลค่าซื้อขายจริงหรือประมาณ
//   - ข้อกำหนดการใช้ของผู้ให้บริการเปลี่ยนได้ — ข้อความในไฟล์นี้คือสรุปเพื่อเตือน ไม่ใช่คำแนะนำทางกฎหมาย
// ============================================================

export type CommercialUse = "no" | "check" | "licensed" | "user"
export type PriceBasis = "adjusted" | "raw" | "mixed" | "unknown"

export interface SourceProvenance {
  id: string
  label: string
  /** ข้อมูลจากผู้ให้บริการที่มีสัญญา/ทางการ (ไม่ใช่ endpoint สาธารณะหรือการ scrape) */
  official: boolean
  /** แหล่งจริงที่ระบบรู้จัก — แหล่งที่ไม่รู้จัก (เช่น fixture) ห้ามติดป้าย REAL เต็มตัวในรายงานหลักฐาน */
  known: boolean
  license: string
  terms: string
  commercialUse: CommercialUse
  attribution: string
  priceBasis: PriceBasis
  valueField: "estimated" | "actual" | "unknown"
  /** ลำดับความน่าเชื่อถือเมื่อหลายแหล่งให้ค่าวัน/หุ้นเดียวกัน (น้อย = เชื่อก่อน) */
  precedence: number
  risk: string
  termsUrl?: string
}

export const SOURCE_PROVENANCE: Record<string, SourceProvenance> = {
  settrade: {
    id: "settrade",
    label: "Settrade Open API",
    official: true,
    known: true,
    license: "ข้อมูลตลาดทางการผ่านบัญชีโบรกเกอร์ (app key ของผู้ใช้)",
    terms: "ตามสัญญา Settrade Open API และโบรกเกอร์ — ใช้ในบัญชีของผู้ใช้เอง ห้ามเผยแพร่ต่อ (redistribution) โดยไม่มีสัญญาข้อมูล",
    commercialUse: "licensed",
    attribution: "Source: SET via Settrade Open API",
    priceBasis: "raw",
    valueField: "actual",
    precedence: 1,
    risk: "ต่ำ — แหล่งทางการ · ราคาดิบ (ไม่ปรับปันผล) ต้องจัดการ corporate action เองก่อนผสมกับราคาปรับแล้ว",
    termsUrl: "https://developer.settrade.com/open-api/",
  },
  set: {
    id: "set",
    label: "SET (set.or.th) ผ่าน settfex",
    official: false,
    known: true,
    license: "ข้อมูลจากหน้าเว็บ SET ผ่านไลบรารีไม่เป็นทางการ (scrape endpoint ของเว็บ)",
    terms: "ต้องตรวจข้อกำหนดการใช้เว็บไซต์ของ SET ก่อน — การดึงอัตโนมัติ/ผ่าน bot protection อาจขัดเงื่อนไข · ใช้เพื่อวิจัยส่วนตัว ไม่เผยแพร่ต่อ",
    commercialUse: "check",
    attribution: "Source: The Stock Exchange of Thailand (set.or.th)",
    priceBasis: "raw",
    valueField: "actual",
    precedence: 2,
    risk: "กลาง — ค่าตรงจากตลาด (มูลค่าซื้อขายจริง) แต่ endpoint เปลี่ยนได้ทุกเมื่อ · ไม่มี OHLC ย้อนหลัง · ราคาดิบ",
    termsUrl: "https://www.set.or.th/en/terms-and-conditions",
  },
  csv: {
    id: "csv",
    label: "CSV ของผู้ใช้ (AmiBroker / SETSMART / อื่น ๆ)",
    official: false,
    known: true,
    license: "ข้อมูลที่ผู้ใช้นำเข้าเอง — สิทธิ์ตามแหล่งต้นทางของไฟล์",
    terms: "ผู้ใช้รับผิดชอบสิทธิ์การใช้และความถูกต้องเอง (เช่น SETSMART = ตามสัญญาสมาชิก)",
    commercialUse: "user",
    attribution: "Source: ตามแหล่งต้นทางของไฟล์",
    priceBasis: "unknown",
    valueField: "unknown",
    precedence: 3,
    risk: "ไม่ทราบ — ขึ้นกับไฟล์ ตรวจ reconciliation กับแหล่งอื่นก่อนใช้",
  },
  yahoo: {
    id: "yahoo",
    label: "Yahoo Finance (.BK)",
    official: false,
    known: true,
    license: "chart API สาธารณะ ไม่มีสัญญาบริการ",
    terms: "ข้อกำหนดของ Yahoo อนุญาตเฉพาะการใช้ส่วนตัว ไม่ใช่เชิงพาณิชย์ · ห้ามเผยแพร่ข้อมูลต่อ · มี rate limit ต่อ IP",
    commercialUse: "no",
    attribution: "Source: Yahoo Finance",
    priceBasis: "adjusted",
    valueField: "estimated",
    precedence: 4,
    risk: "กลาง — ไม่เป็นทางการ · ราคาปรับย้อนหลังเมื่อมีปันผล/สปลิต (ฐานราคาเปลี่ยนได้) · val = close×volume โดยประมาณ",
    termsUrl: "https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html",
  },
}

const UNKNOWN_SOURCE = (id: string): SourceProvenance => ({
  id,
  label: id ? `แหล่งไม่รู้จัก (${id})` : "แหล่งไม่รู้จัก",
  official: false,
  known: false,
  license: "ไม่ทราบ",
  terms: "ไม่ทราบที่มาและสิทธิ์การใช้ — ห้ามนับเป็นหลักฐานจากข้อมูลจริงจนกว่าจะยืนยันแหล่ง",
  commercialUse: "check",
  attribution: "—",
  priceBasis: "unknown",
  valueField: "unknown",
  precedence: 9,
  risk: "สูง — ไม่รู้ว่าเป็นข้อมูลจริง/จำลอง/ทดสอบ",
})

/** หา metadata ของแหล่งจากชื่อที่ ingest บันทึก (รับรูปแบบ "yahoo", "set-20260923", "settrade", "csv:amibroker") */
export function provenanceFor(source: string | null | undefined): SourceProvenance {
  const s = (source ?? "").trim().toLowerCase()
  if (!s) return UNKNOWN_SOURCE("")
  if (SOURCE_PROVENANCE[s]) return SOURCE_PROVENANCE[s]
  const head = s.split(/[^a-z]+/)[0]
  if (head && SOURCE_PROVENANCE[head]) return SOURCE_PROVENANCE[head]
  if (s.includes("settrade")) return SOURCE_PROVENANCE.settrade
  if (s.includes("settfex")) return SOURCE_PROVENANCE.set
  return UNKNOWN_SOURCE(s)
}

export interface ProvenanceEvent {
  id: number
  kind: string
  payload: string
  ts?: Date | string
}

export interface IngestSourceSummary {
  source: string
  label: string
  known: boolean
  official: boolean
  commercialUse: CommercialUse
  ingests: number
  firstAt: string | null
  lastAt: string | null
  lastLatestDate: string | null
  rows: number
}

export interface DataEpoch {
  /** id ของเหตุการณ์ที่เริ่มยุคข้อมูลปัจจุบัน (seed ล่าสุด หรือ ingest ที่ replaceDemo) — null = ไม่มี */
  startEventId: number | null
  startKind: "seed" | "replace-demo" | null
  startTs: string | null
  /** แหล่งของ ingest ล่าสุดในยุคนี้ */
  latestSource: string | null
  sources: IngestSourceSummary[]
}

function parsePayload(p: string): Record<string, unknown> {
  try {
    const v = JSON.parse(p) as unknown
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

const tsIso = (t: Date | string | undefined): string | null => {
  if (t === undefined) return null
  const d = t instanceof Date ? t : new Date(t)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/**
 * ยุคข้อมูลปัจจุบัน + ประวัติ ingest ต่อแหล่ง จาก EventLog (seed/ingest)
 * ยุคเริ่มที่ seed ล่าสุด หรือ ingest ที่ replacedDemo=true ล่าสุด (ล้างข้อมูลตลาดเดิมทั้งหมด) — แล้วแต่อันไหนหลังกว่า
 * การตัดสินใจ/ผลงานก่อนจุดนี้อ้างหุ้นของ "โลกเก่า" (เช่นหุ้นจำลอง) ห้ามนับรวมกับยุคปัจจุบัน
 */
export function dataEpoch(events: ProvenanceEvent[]): DataEpoch {
  const sorted = [...events].sort((a, b) => a.id - b.id)
  let start: ProvenanceEvent | null = null
  let startKind: DataEpoch["startKind"] = null
  for (const e of sorted) {
    if (e.kind === "seed") {
      start = e
      startKind = "seed"
    } else if (e.kind === "ingest" && parsePayload(e.payload).replacedDemo === true) {
      start = e
      startKind = "replace-demo"
    }
  }
  const bySource = new Map<string, IngestSourceSummary>()
  let latestSource: string | null = null
  for (const e of sorted) {
    if (e.kind !== "ingest") continue
    if (start && e.id < start.id) continue
    const p = parsePayload(e.payload)
    const source =
      p.kind === "feed" ? (typeof p.source === "string" && p.source ? p.source : "external") : p.kind === "snapshot" || p.kind === "history" ? "csv" : "external"
    latestSource = source
    const meta = provenanceFor(source)
    const cur = bySource.get(source) ?? {
      source,
      label: meta.label,
      known: meta.known,
      official: meta.official,
      commercialUse: meta.commercialUse,
      ingests: 0,
      firstAt: tsIso(e.ts),
      lastAt: null,
      lastLatestDate: null,
      rows: 0,
    }
    cur.ingests++
    cur.lastAt = tsIso(e.ts) ?? cur.lastAt
    if (typeof p.latestDate === "string") cur.lastLatestDate = p.latestDate
    const rows = Number(p.insertedRaw ?? p.rows ?? 0)
    if (Number.isFinite(rows)) cur.rows += rows
    bySource.set(source, cur)
  }
  return {
    startEventId: start?.id ?? null,
    startKind,
    startTs: start ? tsIso(start.ts) : null,
    latestSource,
    sources: [...bySource.values()].sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? "")),
  }
}

export type EvidenceDataLabel = "REAL" | "SYNTHETIC" | "MIXED" | "UNVERIFIED_SOURCE" | "NO_DATA" | "UNKNOWN"

/**
 * ป้ายข้อมูลสำหรับ "หลักฐาน" (เข้มกว่าป้ายของ Flagship): REAL ต้องเป็นข้อมูลจริงล้วนตาม EventLog
 * และ "ทุก" แหล่งที่ ingest ในยุคข้อมูลนี้ต้องเป็นแหล่งจริงที่ระบบรู้จัก — ประวัติจาก fixture/แหล่งไม่รู้จัก
 * แล้วต่อด้วย Yahoo วันเดียว ยังเป็น UNVERIFIED_SOURCE (ส่วนใหญ่ของประวัติยังไม่รู้ที่มา)
 */
export function evidenceDataLabel(prov: { isSynthetic: boolean; dataLabel: string }, epochSources: (string | null)[]): EvidenceDataLabel {
  if (prov.dataLabel.startsWith("NO DATA")) return "NO_DATA"
  if (prov.dataLabel.startsWith("MIXED")) return "MIXED"
  if (prov.dataLabel.startsWith("UNKNOWN")) return "UNKNOWN"
  if (prov.isSynthetic) return "SYNTHETIC"
  return epochSources.length > 0 && epochSources.every((s) => provenanceFor(s).known) ? "REAL" : "UNVERIFIED_SOURCE"
}

/** แหล่งทั้งหมดที่ ingest ในยุคข้อมูลปัจจุบัน (ใช้กับ evidenceDataLabel) */
export function epochSourceIds(epoch: DataEpoch): string[] {
  return epoch.sources.map((s) => s.source)
}
