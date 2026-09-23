/**
 * Workspace Presets — พรีเซ็ตการจัดวาง Command Center (Super Options)
 *
 * หลักการ:
 * - พรีเซ็ตในตัว 4 แบบ "ลงทะเบียนล่วงหน้า" ในไฟล์นี้ — ลบ/แก้ให้ผู้ใช้ไม่ได้ (เกณฑ์ชัดเจน ไม่ลอย)
 * - พรีเซ็ตผู้ใช้บันทึก localStorage (key v1) — snapshot ของ prefs การจัดวางเท่านั้น ไม่เก็บข้อมูลตลาด
 * - snapshot เป็น object ปลอดฟังก์ชัน — JSON-safe ตลอด
 */

import {
  FEATURE_IDS,
  normalizeOrder,
  type AutoRefresh,
  type DashboardDensity,
  type DashboardLayout,
  type DashboardPrefs,
  type FeatureId,
} from "./dashboard-prefs"

/** ส่วนของ prefs ที่พรีเซ็ตครอบ — การรีเฟรช/ลำดับ/เลย์เอาต์/โหมดอ่าน/โมดูลที่มองเห็น */
export interface PresetSnapshot {
  density: DashboardDensity
  autoRefresh: AutoRefresh
  layout: DashboardLayout
  showOptions: boolean
  modules: Record<FeatureId, boolean>
  order: FeatureId[]
}

export interface DashboardPreset {
  id: string
  name: string
  desc: string
  builtin: boolean
  createdAt: number
  snapshot: PresetSnapshot
}

function snap(
  density: DashboardDensity,
  autoRefresh: AutoRefresh,
  layout: DashboardLayout,
  showOptions: boolean,
  on: FeatureId[],
): PresetSnapshot {
  const modules = FEATURE_IDS.reduce(
    (acc, id) => {
      acc[id] = on.includes(id)
      return acc
    },
    {} as Record<FeatureId, boolean>,
  )
  // ลำดับ = ตัวที่เปิดตามลำดับที่ส่งมา แล้วต่อด้วยตัวที่ปิด (ให้กดเปิดแล้วขึ้นบนตามที่เห็น)
  const order = normalizeOrder([...on, ...FEATURE_IDS.filter((id) => !on.includes(id))])
  return { density, autoRefresh, layout, showOptions, modules, order }
}

const ALL: FeatureId[] = [...FEATURE_IDS]

/** พรีเซ็ตในตัว — เกณฑ์ลงทะเบียนล่วงหน้า: แต่ละแบบตอบพิธีการใช้งานจริงชัดเจน */
export const BUILTIN_PRESETS: DashboardPreset[] = [
  {
    id: "builtin-full",
    name: "Full Board",
    desc: "ทุกโมดูล · จัดเต็มแบบเห็นภาพครบ",
    builtin: true,
    createdAt: 0,
    snapshot: snap("comfortable", "off", "single", true, ALL),
  },
  {
    id: "builtin-morning",
    name: "Morning Brief",
    desc: "Posture + Vitals + GTAA + พิธีเดือนนี้ — เช็กสายเช้าจบในหน้าเดียว",
    builtin: true,
    createdAt: 0,
    snapshot: snap("compact", "off", "single", true, ["posture", "vitals", "gtaa", "ops"]),
  },
  {
    id: "builtin-risk",
    name: "Risk Watch",
    desc: "Regime + Breadth + Risk Radar + Evidence — เวอร์ชันเฝ้าความเสี่ยง รีเฟรชทุก 60 วิ",
    builtin: true,
    createdAt: 0,
    snapshot: snap("compact", "60", "dual", true, ["regime", "breadth", "risk", "evidence", "ops"]),
  },
  {
    id: "builtin-focus",
    name: "Deep Focus",
    desc: "ทุกโมดูลแบบกระชับ + ซ่อนแถบ options (โหมดอ่าน) — อ่านของจริงไม่เสียสมาธิ",
    builtin: true,
    createdAt: 0,
    snapshot: snap("compact", "off", "single", false, ALL),
  },
]

// ---------------------------------------------------------------------
// พรีเซ็ตผู้ใช้ — localStorage key v1 (สูงสุด 8 พรีเซ็ต กันเปียกโชก)
// ---------------------------------------------------------------------

const PRESET_KEY = "tpx.dashboard-presets.v1"
const MAX_USER_PRESETS = 8

export function snapshotOf(prefs: DashboardPrefs): PresetSnapshot {
  return {
    density: prefs.density,
    autoRefresh: prefs.autoRefresh,
    layout: prefs.layout,
    showOptions: prefs.showOptions,
    modules: { ...prefs.modules },
    order: normalizeOrder(prefs.order),
  }
}

export function loadUserPresets(): DashboardPreset[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(PRESET_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return []
    const out: DashboardPreset[] = []
    for (const p of arr.slice(0, MAX_USER_PRESETS)) {
      // แถวเสีย (null/ไม่ใช่ object) = ข้ามแถวนั้น — ห้าม throw จน catch ด้านล่างทิ้งพรีเซ็ตดีทั้งหมด
      // (แล้ว saveUserPreset ครั้งถัดไปจะเขียนทับจนหายถาวร)
      if (p === null || typeof p !== "object") continue
      const j = p as Partial<DashboardPreset>
      if (typeof j.id !== "string" || typeof j.name !== "string" || !j.snapshot) continue
      const s = j.snapshot as Partial<PresetSnapshot>
      if (s.density !== "comfortable" && s.density !== "compact") continue
      out.push({
        id: j.id,
        name: j.name.slice(0, 40),
        desc: typeof j.desc === "string" ? j.desc.slice(0, 120) : "",
        builtin: false,
        createdAt: typeof j.createdAt === "number" ? j.createdAt : 0,
        snapshot: {
          density: s.density,
          autoRefresh: s.autoRefresh === "30" || s.autoRefresh === "60" ? s.autoRefresh : "off",
          layout: s.layout === "dual" ? "dual" : "single",
          showOptions: s.showOptions !== false,
          modules: FEATURE_IDS.reduce(
            (acc, id) => {
              acc[id] = (s.modules as Partial<Record<FeatureId, boolean>> | undefined)?.[id] !== false
              return acc
            },
            {} as Record<FeatureId, boolean>,
          ),
          order: normalizeOrder(Array.isArray(s.order) ? (s.order as FeatureId[]) : []),
        },
      })
    }
    return out
  } catch {
    return []
  }
}

export function saveUserPreset(name: string, prefs: DashboardPrefs): DashboardPreset[] {
  if (typeof window === "undefined") return []
  const clean = name.trim().slice(0, 40)
  if (!clean) return loadUserPresets()
  try {
    const existing = loadUserPresets()
    // ชื่อซ้ำ = ทับตัวเดิม (กติกาลงทะเบียนล่วงหน้า)
    const next = existing.filter((p) => p.name !== clean)
    next.unshift({
      id: `user-${Date.now().toString(36)}`,
      name: clean,
      desc: "",
      builtin: false,
      createdAt: Date.now(),
      snapshot: snapshotOf(prefs),
    })
    const trimmed = next.slice(0, MAX_USER_PRESETS)
    window.localStorage.setItem(PRESET_KEY, JSON.stringify(trimmed))
    return trimmed
  } catch {
    return loadUserPresets()
  }
}

export function deleteUserPreset(id: string): DashboardPreset[] {
  if (typeof window === "undefined") return []
  try {
    const next = loadUserPresets().filter((p) => p.id !== id)
    window.localStorage.setItem(PRESET_KEY, JSON.stringify(next))
    return next
  } catch {
    return loadUserPresets()
  }
}
