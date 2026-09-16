import type { StageFeature } from "@/lib/stagelab/plans";

export type ViewKey =
  | "dashboard"
  | "alerts"
  | "weekly"
  | "screener"
  | "watchlist"
  | "portfolio"
  | "thesis"
  | "backtest"
  | "pro"
  | "quant"
  | "tools"
  | "journal"
  | "learn";

export interface NavItem {
  key: ViewKey;
  label: string;
  /** The plan feature this view needs. A locked item still renders — greyed,
   *  with the upgrade panel behind it — because hiding a feature entirely is
   *  how a customer never learns the paid tier exists. */
  feature: StageFeature;
  group: "routine" | "research" | "reference";
  hint: string;
}

export const NAV: NavItem[] = [
  { key: "dashboard", label: "ภาพรวม", feature: "dashboard", group: "routine", hint: "สถานะตลาด พอร์ต และงานค้างของสัปดาห์" },
  { key: "weekly", label: "รอบทบทวน 5 ขั้น", feature: "weekly", group: "routine", hint: "ตลาด → กลุ่ม → หุ้น → พอร์ต → แผน" },
  { key: "screener", label: "Screener", feature: "screener", group: "routine", hint: "กรองจักรวาลหุ้นด้วย Funnel 6 ชั้น" },
  { key: "watchlist", label: "Watchlist", feature: "watchlist", group: "routine", hint: "รายการเฝ้าดูพร้อมแผนเข้า-ออก" },
  { key: "portfolio", label: "พอร์ต", feature: "portfolio", group: "routine", hint: "สถานะที่เปิดอยู่ กำไร/ขาดทุน และคำแนะนำ" },
  { key: "journal", label: "Journal", feature: "journal", group: "routine", hint: "บันทึกเทรดและอคติที่เจอ" },

  { key: "alerts", label: "Risk Radar", feature: "alerts", group: "research", hint: "สแกนความเสี่ยงจากพอร์ตและ Watchlist" },
  { key: "thesis", label: "Stock Thesis", feature: "thesis", group: "research", hint: "หน้าเดียวจบ: เทคนิค + พื้นฐาน + แผนเทรด" },
  { key: "backtest", label: "Backtest", feature: "backtest", group: "research", hint: "ทดสอบกลยุทธ์ Stage 2 ย้อนหลัง 6 ปี" },
  { key: "pro", label: "Pro Desk", feature: "pro", group: "research", hint: "Short, Sector Rotation, Multi-Timeframe" },
  { key: "quant", label: "Quant Lab", feature: "quant", group: "research", hint: "มอนติคาร์โล กับดักปันผล คะแนน 360°" },

  { key: "tools", label: "เครื่องมือ", feature: "tools", group: "reference", hint: "ขนาดไม้ Kelly Chandelier และเช็คลิสต์" },
  { key: "learn", label: "คู่มือ", feature: "learn", group: "reference", hint: "ระบบ Stage Analysis ฉบับย่อ" },
];

export const GROUP_LABELS: Record<NavItem["group"], string> = {
  routine: "รอบการทำงาน",
  research: "โต๊ะวิจัย",
  reference: "อ้างอิง",
};

export function navItem(key: ViewKey): NavItem {
  const found = NAV.find((n) => n.key === key);
  if (!found) throw new Error(`unknown view: ${key}`);
  return found;
}
