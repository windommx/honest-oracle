/**
 * DashboardPrefs — ตัวเลือกการจัดวาง Command Center (บันทึกใน localStorage)
 *
 * หลักการ:
 * - เกณฑ์ทั้งหมด "ลงทะเบียนล่วงหน้า" ในไฟล์นี้ — ไม่มีพารามิเตอร์แอบแฝง
 * - load() ผสานกับค่าเริ่มต้นเสมอ (กัน key เก่าที่ขาดฟิลด์ใหม่) + ย้ายค่าจาก v1/v2 ให้อัตโนมัติ
 * - เรียกได้เฉพาะฝั่ง client — ต้อง load หลัง mount เพื่อไม่ให้ hydration mismatch
 *
 * v2: แต่ละโมดูล (FEATURE_IDS) ซ่อน/แสดงรายตัว + ตั้งเวลารีเฟรชอัตโนมัติ
 * v3: เลย์เอาต์ single/dual · ลำดับโมดูล order · โหมดอ่าน showOptions (ซ่อนแถบ .options ทุกโมดูล)
 */

export type DashboardDensity = "comfortable" | "compact"
export type AutoRefresh = "off" | "30" | "60"
export type DashboardLayout = "single" | "dual"

/** รหัสโมดูล .feature ทั้งหมดของ Command Center (เรียงตามลำดับเริ่มต้นบนลงล่าง) */
export const FEATURE_IDS = [
  "posture",
  "vitals",
  "engines",
  "regime",
  "breadth",
  "gtaa",
  "evidence",
  "lab",
  "risk",
  "ops",
  "topstocks",
  "jevfeed",
] as const

export type FeatureId = (typeof FEATURE_IDS)[number]

export const FEATURE_LABELS: Record<FeatureId, string> = {
  posture: "M0 · วินิจฉัยระบบ (Posture)",
  vitals: "M1 · ตัวเลขชี้ขาด (Vitals)",
  engines: "M2 · ทะเบียนเอนจิน (Engines)",
  regime: "M3 · Regime Composite",
  breadth: "M4 · Market Breadth",
  gtaa: "M5 · GTAA Monthly Ops",
  evidence: "M6 · Evidence Pipeline",
  lab: "M7 · Shadow Lab",
  risk: "M8 · Risk Radar",
  ops: "M9 · Ops Checklist",
  topstocks: "M10 · หุ้นคะแนนสูงสุด",
  jevfeed: "M11 · ฟีด Jev AI",
}

export interface DashboardPrefs {
  density: DashboardDensity
  autoRefresh: AutoRefresh
  /** single = คอลัมน์เดียวอ่านบนลงล่าง · dual = กริด 2 คอลัมน์บนจอกว้าง (โมดูลกว้างครอบ 2 ช่อง) */
  layout: DashboardLayout
  /** true = แสดงแถบ .options ของทุกโมดูล · false = โหมดอ่าน (ซ่อนแถบตัวเลือกทั้งหมด) */
  showOptions: boolean
  modules: Record<FeatureId, boolean>
  /** ลำดับการเรนเดอร์โมดูล — ต้องครบทุก id เป๊ะ (normalizeOrder คืนค่าให้เสมอ) */
  order: FeatureId[]
}

export const DEFAULT_PREFS: DashboardPrefs = {
  density: "comfortable",
  autoRefresh: "off",
  layout: "single",
  showOptions: true,
  modules: FEATURE_IDS.reduce(
    (acc, id) => {
      acc[id] = true
      return acc
    },
    {} as Record<FeatureId, boolean>,
  ),
  order: [...FEATURE_IDS],
}

/** key v3 — เมื่อสคีมาเปลี่ยนให้ bump (v1/v2 จะถูกย้ายค่าให้อัตโนมัติ) */
const KEY = "tpx.dashboard-prefs.v3"
const KEY_V2 = "tpx.dashboard-prefs.v2"
const KEY_V1 = "tpx.dashboard-prefs.v1"

/** คืนลำดับที่ครบทุก FeatureId เป๊ะหนึ่งครั้ง — ตัวขาดต่อท้ายตาม FEATURE_IDS, ตัวปลอมทิ้ง */
export function normalizeOrder(order: readonly FeatureId[]): FeatureId[] {
  const seen = new Set<FeatureId>()
  const out: FeatureId[] = []
  for (const id of order) {
    if ((FEATURE_IDS as readonly string[]).includes(id) && !seen.has(id)) {
      seen.add(id)
      out.push(id)
    }
  }
  for (const id of FEATURE_IDS) {
    if (!seen.has(id)) out.push(id)
  }
  return out
}

function sanitize(raw: unknown): DashboardPrefs {
  const j = (raw ?? {}) as Partial<DashboardPrefs> & { sections?: Record<string, boolean> }
  const density: DashboardDensity = j.density === "compact" ? "compact" : "comfortable"
  const autoRefresh: AutoRefresh = j.autoRefresh === "30" || j.autoRefresh === "60" ? j.autoRefresh : "off"
  const layout: DashboardLayout = j.layout === "dual" ? "dual" : "single"
  const showOptions = j.showOptions !== false
  const mods = (j.modules ?? {}) as Partial<Record<FeatureId, boolean>>
  const modules = FEATURE_IDS.reduce(
    (acc, id) => {
      acc[id] = mods[id] !== false
      return acc
    },
    {} as Record<FeatureId, boolean>,
  )
  const order = normalizeOrder(Array.isArray(j.order) ? (j.order as FeatureId[]) : [])
  return { density, autoRefresh, layout, showOptions, modules, order }
}

/** โหลด prefs จาก localStorage — เสียหาย/ขาดฟิลด์ = คืนค่าเริ่มต้นเสมอ + ย้ายค่า v1/v2 ครั้งเดียว */
export function loadPrefs(): DashboardPrefs {
  if (typeof window === "undefined") return structuredDefaults()
  try {
    const raw = window.localStorage.getItem(KEY)
    if (raw) return sanitize(JSON.parse(raw))

    // ---- migration จาก v2 (density/autoRefresh/modules) ----
    const rawV2 = window.localStorage.getItem(KEY_V2)
    if (rawV2) {
      try {
        const v2 = JSON.parse(rawV2) as Partial<DashboardPrefs>
        const prefs = sanitize({
          density: v2.density,
          autoRefresh: v2.autoRefresh,
          modules: v2.modules,
        })
        savePrefs(prefs)
        return prefs
      } catch {
        /* v2 เสีย — ลอง v1 ต่อ */
      }
    }

    // ---- migration จาก v1: sections (hero/kpi/modules/analytics/feeds) → modules ----
    const rawV1 = window.localStorage.getItem(KEY_V1)
    if (rawV1) {
      try {
        const v1 = JSON.parse(rawV1) as {
          density?: DashboardDensity
          sections?: Partial<{ hero: boolean; kpi: boolean; modules: boolean; analytics: boolean; feeds: boolean }>
        }
        const s = v1.sections ?? {}
        const prefs = sanitize({
          density: v1.density,
          modules: {
            posture: s.hero,
            vitals: s.kpi,
            engines: s.modules,
            regime: s.analytics,
            breadth: s.analytics,
            gtaa: s.analytics,
            evidence: s.feeds,
            lab: s.feeds,
            risk: s.kpi,
            ops: true,
            topstocks: s.feeds,
            jevfeed: s.feeds,
          },
        })
        savePrefs(prefs)
        return prefs
      } catch {
        /* v1 เสีย — ใช้ค่าเริ่มต้น */
      }
    }
    return structuredDefaults()
  } catch {
    return structuredDefaults()
  }
}

function structuredDefaults(): DashboardPrefs {
  return {
    ...DEFAULT_PREFS,
    modules: { ...DEFAULT_PREFS.modules },
    order: [...DEFAULT_PREFS.order],
  }
}

/** บันทึก prefs — ล้มเหลว (โหมดส่วนตัว/พื้นที่เต็ม) = เงียบได้ เพราะเป็นแค่ตัวเลือกการแสดงผล */
export function savePrefs(prefs: DashboardPrefs): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch {
    /* ไม่บล็อก UI */
  }
}
