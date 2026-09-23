import {
  Activity,
  BarChart3,
  Beaker,
  BrainCircuit,
  Briefcase,
  ClipboardCheck,
  Crosshair,
  Database,
  FlaskConical,
  Globe2,
  History,
  LayoutDashboard,
  Layers,
  LineChart,
  Microscope,
  Network,
  ShieldAlert,
  Trophy,
  type LucideIcon,
} from "lucide-react"

export interface NavItem {
  value: string
  label: string
  short: string // ป้ายสั้นสำหรับ bottom dock มือถือ
  icon: LucideIcon
  /** คำอธิบายสั้นภาษาไทย — ใช้ใน tooltip เมนู และเป็นคำค้นของ Command Palette */
  desc?: string
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

// ค่า tab ต้องตรงกับเงื่อนไข render ใน main — ห้ามเปลี่ยนชื่อ (ป้าย label ใช้ใน test/sweep — ห้ามเปลี่ยนเช่นกัน)
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "ภาพรวม",
    items: [
      { value: "overview", label: "ภาพรวม (Command Center)", short: "ภาพรวม", icon: LayoutDashboard, desc: "สรุปทั้งระบบในจอเดียว" },
      { value: "map", label: "Momentum Map", short: "แผนที่", icon: LineChart, desc: "หุ้นติดโผข้าม 7 กรอบเวลา" },
      { value: "analytics", label: "สถิติ", short: "สถิติ", icon: BarChart3, desc: "สถิติภาพรวมตลาดและระบบ" },
    ],
  },
  {
    label: "สัญญาณ & วิจัย",
    items: [
      { value: "flagship", label: "สัญญาณเรือธง (Flagship 1–10)", short: "เรือธง", icon: Trophy, desc: "หุ้น 10 อันดับที่ผ่านทุกด่าน" },
      { value: "signals", label: "สัญญาณ", short: "สัญญาณ", icon: Activity, desc: "Regime · เงินไหล · IC Report" },
      { value: "backtest", label: "Backtest", short: "Backtest", icon: FlaskConical, desc: "ทดสอบกลยุทธ์ย้อนหลัง" },
      { value: "research", label: "ห้องวิจัย", short: "วิจัย", icon: Microscope, desc: "CPCV · meta-labeling · ลงทะเบียนล่วงหน้า" },
      { value: "evidence", label: "Evidence Board", short: "หลักฐาน", icon: ClipboardCheck, desc: "หลักฐานก่อนอนุมัติสัญญาณ" },
    ],
  },
  {
    label: "Alpha & ความเสี่ยง",
    items: [
      { value: "alpha", label: "Alpha Stack", short: "Alpha", icon: Layers, desc: "เอนจิน alpha เสริม" },
      { value: "sniper", label: "SET Sniper (ICT × Flow)", short: "Sniper", icon: Crosshair, desc: "จุดเข้าจากโครงสร้างราคา × เงินไหล" },
      { value: "stops", label: "Bayes Stop", short: "Stop", icon: ShieldAlert, desc: "จุดตัดขาดทุนแบบ Bayesian" },
    ],
  },
  {
    label: "Global Engines",
    items: [
      { value: "gtaa", label: "GTAA Rotation (Faber)", short: "GTAA", icon: Globe2, desc: "หมุนสินทรัพย์ทั่วโลกรายเดือน" },
    ],
  },
  {
    label: "Shadow Lab",
    items: [{ value: "lab", label: "Shadow Lab", short: "แล็บ", icon: Beaker, desc: "ทดลองกฎแบบเงาก่อนใช้จริง" }],
  },
  {
    label: "ระบบเทรด",
    items: [
      { value: "jev", label: "Jev AI", short: "Jev AI", icon: BrainCircuit, desc: "ผู้ช่วยตัดสินใจ + Human Gate" },
      { value: "portfolio", label: "พอร์ต", short: "พอร์ต", icon: Briefcase, desc: "พอร์ตจำลอง (paper)" },
      {
        value: "track",
        label: "Track Record",
        short: "ผลงาน",
        icon: History,
        desc: "ผลงานพอร์ตกระดาษแบบตรวจย้อนได้ (NAV · audit · ที่มาข้อมูล)",
      },
    ],
  },
  {
    label: "Agent",
    items: [{ value: "skills", label: "Agent Skill Tree", short: "Skills", icon: Network, desc: "ความสามารถของ agent" }],
  },
  {
    label: "ระบบ",
    items: [{ value: "data", label: "ข้อมูล", short: "ข้อมูล", icon: Database, desc: "นำเข้าข้อมูล + ตรวจคุณภาพ" }],
  },
]

export const ALL_TABS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items)

export function findTab(tab: string): { item: NavItem; groupLabel: string } {
  for (const g of NAV_GROUPS) {
    const item = g.items.find((i) => i.value === tab)
    if (item) return { item, groupLabel: g.label }
  }
  return { item: ALL_TABS[0], groupLabel: NAV_GROUPS[0].label }
}

// =====================================================================
// โหมดการใช้งาน — Simple (ผู้ใช้ทั่วไป) / Pro (นักวิจัย quant)
// Simple แสดงเฉพาะแท็บหลัก · แท็บวิจัยขั้นสูงยังเปิดได้เมื่อสลับเป็น Pro (หรือลิงก์จากโมดูลในหน้าภาพรวม)
// ค่าเริ่มต้น = Pro — ผู้ใช้เดิมไม่เห็นเมนูหายหลังอัปเดต
// =====================================================================

export type UiMode = "simple" | "pro"
export const UI_MODES: readonly UiMode[] = ["simple", "pro"]

/** แท็บหลักของโหมดง่าย (เรียงตาม NAV_GROUPS) */
export const SIMPLE_TAB_VALUES: readonly string[] = ["overview", "map", "flagship", "signals", "jev", "portfolio", "track", "data"]

export function isTabVisible(tab: string, mode: UiMode): boolean {
  return mode === "pro" || SIMPLE_TAB_VALUES.includes(tab)
}

/** กลุ่มเมนูตามโหมด — กลุ่มที่ไม่เหลือแท็บถูกตัดทิ้ง */
export function navGroupsFor(mode: UiMode): NavGroup[] {
  if (mode === "pro") return NAV_GROUPS
  return NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => isTabVisible(i.value, mode)) })).filter(
    (g) => g.items.length > 0,
  )
}

/** จำนวนแท็บที่ถูกซ่อนในโหมดนี้ */
export function hiddenTabCount(mode: UiMode): number {
  return ALL_TABS.length - ALL_TABS.filter((t) => isTabVisible(t.value, mode)).length
}
