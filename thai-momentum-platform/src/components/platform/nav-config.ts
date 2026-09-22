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
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

// ค่า tab ต้องตรงกับเงื่อนไข render ใน main — ห้ามเปลี่ยนชื่อ
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "ภาพรวม",
    items: [
      { value: "overview", label: "ภาพรวม (Command Center)", short: "ภาพรวม", icon: LayoutDashboard },
      { value: "map", label: "Momentum Map", short: "แผนที่", icon: LineChart },
      { value: "analytics", label: "สถิติ", short: "สถิติ", icon: BarChart3 },
    ],
  },
  {
    label: "สัญญาณ & วิจัย",
    items: [
      { value: "flagship", label: "สัญญาณเรือธง (Flagship 1–10)", short: "เรือธง", icon: Trophy },
      { value: "signals", label: "สัญญาณ", short: "สัญญาณ", icon: Activity },
      { value: "backtest", label: "Backtest", short: "Backtest", icon: FlaskConical },
      { value: "research", label: "ห้องวิจัย", short: "วิจัย", icon: Microscope },
      { value: "evidence", label: "Evidence Board", short: "หลักฐาน", icon: ClipboardCheck },
    ],
  },
  {
    label: "Alpha & ความเสี่ยง",
    items: [
      { value: "alpha", label: "Alpha Stack", short: "Alpha", icon: Layers },
      { value: "sniper", label: "SET Sniper (ICT × Flow)", short: "Sniper", icon: Crosshair },
      { value: "stops", label: "Bayes Stop", short: "Stop", icon: ShieldAlert },
    ],
  },
  {
    label: "Global Engines",
    items: [
      { value: "gtaa", label: "GTAA Rotation (Faber)", short: "GTAA", icon: Globe2 },
    ],
  },
  {
    label: "Shadow Lab",
    items: [{ value: "lab", label: "Shadow Lab", short: "แล็บ", icon: Beaker }],
  },
  {
    label: "ระบบเทรด",
    items: [
      { value: "jev", label: "Jev AI", short: "Jev AI", icon: BrainCircuit },
      { value: "portfolio", label: "พอร์ต", short: "พอร์ต", icon: Briefcase },
    ],
  },
  {
    label: "Agent",
    items: [{ value: "skills", label: "Agent Skill Tree", short: "Skills", icon: Network }],
  },
  {
    label: "ระบบ",
    items: [{ value: "data", label: "ข้อมูล", short: "ข้อมูล", icon: Database }],
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
