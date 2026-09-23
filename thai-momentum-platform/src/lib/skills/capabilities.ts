/**
 * Agent Skill Tree — แผนผังความสามารถจริงของเอเจนต์ในแพลตฟอร์ม
 *
 * ที่มาของกรอบ: โพสต์ "20 Skills สำหรับ AI Agent" (@beamnxw) ที่แบ่งความสามารถ
 * ออกเป็น 4 หมวดตามงานที่เอเจนต์ต้องทำ — Research / Engineering / Create / Grow+Ship
 *
 * การปรับใช้ของแพลตฟอร์มนี้ (evidence-first):
 * - เราไม่อ้างว่าติดตั้งเครื่องมือภายนอก 20 ตัว — แต่ใช้ 4 หมวดนั้นเป็น "แผนผัง" ของ
 *   ความสามารถที่โมดูลในระบบนี้ทำได้จริง (Jev + เอนจิน + ระบบช่วย)
 * - สถานะของแต่ละโหนด derive "สด" จาก API ของระบบ (ไม่ใช่ป้ายตาย) ผ่าน live() ที่
 *   ลงทะเบียนไว้ล่วงหน้าในไฟล์นี้
 * - โหนดที่ยังไม่มี = LOCKED พร้อมเงื่อนไขเปิดชัดเจน (ตามธรรมเนียม "สิ่งที่ตั้งใจไม่ทำ")
 *
 * สถานะ:
 *   unlocked — ใช้งานได้จริงวันนี้ (มีหลักฐานชี้แท็บ/API)
 *   shadow   — ทำงานจริงแต่ยังไม่มีสิทธิ์ตัดสินใจ (โหมดเฝ้าดู)
 *   down     — ควรพร้อมแต่ตอนนี้ล่ม/ข้อมูลไม่พร้อม
 *   locked   — ยังไม่มีในระบบ (รอเงื่อนไขตามที่ลงทะเบียน)
 */

import type { LucideIcon } from "lucide-react"
import { Activity, Beaker, Briefcase, ClipboardCheck, Compass, Crosshair, Database, FlaskConical, Globe2, LineChart, Search, ShieldAlert, BrainCircuit, ShieldCheck, FileDown, ListChecks, CalendarClock, BellRing, Landmark, Timer, Microscope, Network, CheckCheck } from "lucide-react"

export type SkillCat = "research" | "engineering" | "create" | "ship"
export type SkillStatus = "unlocked" | "shadow" | "locked" | "down"

/** ข้อมูลสดที่ส่งเข้ามาประกอบสถานะ (จาก API ของระบบ) */
export interface SkillLive {
  rowsRaw: number | null
  dqFlags: number | null
  gtaaReady: boolean | null
  gtaaReal: boolean | null // source ≠ synthetic
  sniperReady: boolean | null
  stopsReady: boolean | null
  auditOk: boolean | null
  decisions: number | null
  promoted: number | null
  positions: number | null
}

export interface SkillNode {
  id: string
  no: number
  cat: SkillCat
  icon: LucideIcon
  name: string
  role: string
  /** สถานะพื้นฐานแบบ static (สำหรับ locked) */
  base: "unlocked" | "shadow" | "locked"
  /** ฟังก์ชัน derive สถานะจากข้อมูลสด — ถ้าไม่กำหนดใช้ base */
  live?: (l: SkillLive) => SkillStatus
  /** แท็บหลักฐาน (สำหรับ unlocked/shadow) */
  evidenceTab?: string
  /** เงื่อนไขเปิด (สำหรับ locked) */
  unlock?: string
  /** ค่าที่ได้ / เหตุผลที่มีโหนดนี้ */
  value: string
}

export interface SkillCategory {
  id: SkillCat
  code: string
  name: string
  tagline: string
}

export const SKILL_CATEGORIES: SkillCategory[] = [
  {
    id: "research",
    code: "01–05",
    name: "Research · หาข้อมูล",
    tagline: "ตาและหู — เห็นตลาดก่อนคนอื่นจากหลายแหล่ง",
  },
  {
    id: "engineering",
    code: "06–12",
    name: "Engineering · เข้าใจระบบ",
    tagline: "สมองส่วนความน่าเชื่อถือ — พิสูจน์ว่าเอนจินไม่โกหก",
  },
  {
    id: "create",
    code: "13–17",
    name: "Create · สร้างงาน",
    tagline: "มือ — เปลี่ยนสัญญาณเป็นของที่อ่านออกและตรวจได้",
  },
  {
    id: "ship",
    code: "18–24",
    name: "Grow + Ship · ส่งมอบ",
    tagline: "ขา — พาสัญญาณไปถึงมือคนตัดสินใจอย่างมีวินัย",
  },
]

export const SKILL_NODES: SkillNode[] = [
  // ---------------- RESEARCH (01–05) ----------------
  {
    id: "ingest-csv",
    no: 1,
    cat: "research",
    icon: Database,
    name: "Ingest CSV (AmiBroker)",
    role: "นำเข้าราคาหุ้นไทยรายวัน + OHLC",
    base: "unlocked",
    live: (l) => (l.rowsRaw !== null && l.rowsRaw > 0 ? "unlocked" : "down"),
    evidenceTab: "data",
    value: "ฐานข้อมูล Raw/Snapshot ครบก่อนคำนวณอะไรทั้งสิ้น",
  },
  {
    id: "global-monthly",
    no: 2,
    cat: "research",
    icon: Globe2,
    name: "ข้อมูลตลาดโลกรายเดือน",
    role: "Yahoo adjclose 15 สินทรัพย์ × 30 ปี",
    base: "unlocked",
    live: (l) => (l.gtaaReady ? (l.gtaaReal ? "unlocked" : "shadow") : "down"),
    evidenceTab: "gtaa",
    value: "Regime ระดับโลก — ประตูที่สองของ posture (shadow ยังไม่เขียนทับระบบไทย)",
  },
  {
    id: "daily-proxy-ohlc",
    no: 3,
    cat: "research",
    icon: Crosshair,
    name: "โครงสร้างรายวัน (OHLC proxy)",
    role: "Sweep / FVG / Volume Profile จากแท่งรายวัน",
    base: "shadow",
    live: (l) => (l.sniperReady ? "shadow" : "down"),
    evidenceTab: "sniper",
    value: "เห็นร่องรอย ICT ระดับวัน — ป้าย DAILY PROXY ประกาศชัดว่ายังไม่ใช่ชั้น tick",
  },
  {
    id: "web-search",
    no: 4,
    cat: "research",
    icon: Search,
    name: "ค้นเว็บ / อ่านหน้าเว็บ",
    role: "หาข่าวและเอกสารอ้างอิงเข้าห้องวิจัย",
    base: "locked",
    unlock: "ผูก SDK ค้นเว็บเป็น /api/search + กรองแหล่งที่เชื่อถือได้ก่อนเข้า Evidence Board",
    value: "หลักฐานเชิงเรื่องเล่า (ข่าว/งบ/ประกาศ) มาต่อกับหลักฐานเชิงตัวเลขได้",
  },
  {
    id: "tick-l2",
    no: 5,
    cat: "research",
    icon: Activity,
    name: "ชั้น tick / Order Book",
    role: "Absorption จริง, footprint, block trade",
    base: "locked",
    unlock: "มี source ข้อมูล tick จริง + ตารางเก็บ order-book snapshot ใน DB",
    value: "ยกระดับ SET Sniper จาก proxy เป็นของจริง — เปิดตามเงื่อนไขใน docs §4",
  },

  // ---------------- ENGINEERING (06–12) ----------------
  {
    id: "selftest",
    no: 6,
    cat: "engineering",
    icon: CheckCheck,
    name: "Self-test Invariant",
    role: "14 ข้อฝังในเอนจิน GTAA — คณิตต้องตรงเสมอ",
    base: "unlocked",
    live: (l) => (l.gtaaReady ? "unlocked" : "down"),
    evidenceTab: "gtaa",
    value: "จับบั๊ก look-ahead/เลขเพี้ยนก่อนไปถึงมือผู้ใช้",
  },
  {
    id: "walkforward",
    no: 7,
    cat: "engineering",
    icon: Timer,
    name: "Walk-forward Harness",
    role: "IS 5 ปี → OOS 1 ปี — วัด degradation",
    base: "unlocked",
    live: (l) => (l.gtaaReady ? "unlocked" : "down"),
    evidenceTab: "gtaa",
    value: "กัน overfit: ผลหลัง OOS ตก >50% = หยุดจูน ใช้ค่าเปเปอร์",
  },
  {
    id: "montecarlo",
    no: 8,
    cat: "engineering",
    icon: FlaskConical,
    name: "Monte Carlo (block bootstrap)",
    role: "p5/p50/p95 ด้วย seed ที่รันซ้ำได้",
    base: "unlocked",
    live: (l) => (l.gtaaReady ? "unlocked" : "down"),
    evidenceTab: "gtaa",
    value: "ช่วงความไม่แน่นอนของผล — ไม่ขายตัวเลขจุดเดียว",
  },
  {
    id: "dq-gate",
    no: 9,
    cat: "engineering",
    icon: ShieldCheck,
    name: "Quality Gate (DQ)",
    role: "บล็อกข้อมูลเสียก่อนเข้าเอนจิน",
    base: "unlocked",
    live: (l) => (l.dqFlags === null ? "down" : l.dqFlags === 0 ? "unlocked" : "down"),
    evidenceTab: "data",
    value: "hole=0 / ราคาสมเหตุสมผล — คุณภาพข้อมูลคือเพดานของทุกอย่าง",
  },
  {
    id: "audit-chain",
    no: 10,
    cat: "engineering",
    icon: ClipboardCheck,
    name: "Audit Hash Chain",
    role: "เหตุการณ์ทุกอย่างเข้าห่วงโซ่ hash แก้ย้อนหลังไม่ได้",
    base: "unlocked",
    live: (l) => (l.auditOk === null ? "down" : l.auditOk ? "unlocked" : "down"),
    value: "track record ที่พิสูจน์ย้อนหลังได้ — รากของความน่าเชื่อถือ",
  },
  {
    id: "tech-debt",
    no: 11,
    cat: "engineering",
    icon: Microscope,
    name: "Tech-debt Audit",
    role: "สแกนหนี้ทางเทคนิคเป็นรอบ",
    base: "locked",
    unlock: "กำหนด rubric + รอบตรวจ (เช่น ทุกไตรมาส) แล้วบันทึกผลลง Evidence Board",
    value: "โค้ดโตต่อได้โดยไม่ทิ้งระเบิดไว้ใต้พรม",
  },
  {
    id: "code-map",
    no: 12,
    cat: "engineering",
    icon: Network,
    name: "Dependency Map",
    role: "แผนที่โค้ด/โมดูลว่าแตะตรงไหนกระทบอะไร",
    base: "locked",
    unlock: "สร้างแผนผังโมดูลอัตโนมัติจาก import graph ของ src/",
    value: "แก้/ต่อยอดได้เร็วขึ้นโดยไม่ต้องเดา",
  },

  // ---------------- CREATE (13–17) ----------------
  {
    id: "command-center",
    no: 13,
    cat: "create",
    icon: Compass,
    name: "Command Center",
    role: "Posture รวม 3 ประตู + คิวงาน — อ่านจบในพริบตา",
    base: "unlocked",
    live: (l) => (l.rowsRaw !== null && l.rowsRaw > 0 ? "unlocked" : "down"),
    evidenceTab: "overview",
    value: "จุดเริ่มทุกเช้า — ลำดับความสำคัญจากบนลงล่าง",
  },
  {
    id: "momentum-map",
    no: 14,
    cat: "create",
    icon: LineChart,
    name: "Momentum Map",
    role: "แผนที่โมเมนตัมรายหุ้น + เทียบเพื่อนบ้าน",
    base: "unlocked",
    live: (l) => (l.rowsRaw !== null && l.rowsRaw > 0 ? "unlocked" : "down"),
    evidenceTab: "map",
    value: "เห็นภาพตลาดทั้งใบในหน้าจอเดียว",
  },
  {
    id: "evidence-board",
    no: 15,
    cat: "create",
    icon: Beaker,
    name: "Evidence Board",
    role: "กติกาลงทะเบียนก่อนเห็นผล + ตัดสินจากหลักฐาน",
    base: "unlocked",
    live: (l) => (l.promoted !== null ? (l.promoted > 0 ? "unlocked" : "shadow") : "down"),
    evidenceTab: "evidence",
    value: "สัญญาณไหนขึ้นจริงต้องมีหลักฐาน — PROMOTE ผ่านเกณฑ์ IC เท่านั้น",
  },
  {
    id: "backtest-engine",
    no: 16,
    cat: "create",
    icon: FlaskConical,
    name: "Backtest Engine",
    role: "ทดสอบกฎบนข้อมูลจริง มีต้นทุน/ไม่มี look-ahead",
    base: "unlocked",
    live: (l) => (l.rowsRaw !== null && l.rowsRaw > 0 ? "unlocked" : "down"),
    evidenceTab: "backtest",
    value: "ทดลองกฎใหม่ได้โดยไม่เสี่ยงเงินจริง",
  },
  {
    id: "visual-explainer",
    no: 17,
    cat: "create",
    icon: Network,
    name: "Visual Explainer",
    role: "กราฟ/แผนผังอธิบายสัญญาณอัตโนมัติ",
    base: "locked",
    unlock: "เลือกสัญญาณที่ถามบ่อยที่สุดก่อน แล้วทำแผนผังเหตุผลรายไม้ให้ครบ",
    value: "อธิบาย 'ทำไมเข้าไม้นี้' ได้โดยไม่ต้องอ่านโค้ด",
  },

  // ---------------- SHIP (18–24) ----------------
  {
    id: "export-csv",
    no: 18,
    cat: "ship",
    icon: FileDown,
    name: "Export CSV",
    role: "สัญญาณ/equity ส่งออกไปตรวจนอกระบบได้",
    base: "unlocked",
    live: (l) => (l.gtaaReady ? "unlocked" : "down"),
    evidenceTab: "gtaa",
    value: "ตรวจซ้ำด้วย Excel ได้ — เปิดกล่องให้เห็นของจริง",
  },
  {
    id: "tracking-log",
    no: 19,
    cat: "ship",
    icon: CheckCheck,
    name: "Tracking Log",
    role: "บันทึกสัญญาณก่อนรู้ผล + ประเมินย้อนหลังอัตโนมัติ",
    base: "unlocked",
    live: (l) => (l.gtaaReady ? "unlocked" : "down"),
    evidenceTab: "gtaa",
    value: "กัน look-ahead bias ใน track record — แก้ประวัติไม่ได้เพราะอยู่ใน DB",
  },
  {
    id: "monthly-checklist",
    no: 20,
    cat: "ship",
    icon: ListChecks,
    name: "Checklist รายเดือน (auto)",
    role: "ตรวจเอง 4 ข้อ + เก็บค้างมือไว้ให้ครบ",
    base: "unlocked",
    live: (l) => (l.gtaaReady ? "unlocked" : "down"),
    evidenceTab: "gtaa",
    value: "พิธีสิ้นเดือนไม่หลุด — ระบบเช็คตัวเองก่อนให้คนเช็ค",
  },
  {
    id: "human-gate",
    no: 21,
    cat: "ship",
    icon: Briefcase,
    name: "Human Gate",
    role: "คำสั่งจริงต้องผ่านคนอนุมัติเสมอ (default-deny)",
    base: "unlocked",
    live: (l) => (l.positions !== null ? "unlocked" : "down"),
    evidenceTab: "portfolio",
    value: "AI เสนอ คนตัดสิน — ความรับผิดชอบไม่เลื่อนไปให้เครื่อง",
  },
  {
    id: "cron-monthend",
    no: 22,
    cat: "ship",
    icon: CalendarClock,
    name: "Cron ท้ายเดือน (server)",
    role: "ดึงข้อมูล + บันทึก snapshot อัตโนมัติสิ้นเดือน",
    base: "locked",
    unlock: "ตั้ง cron ฝั่ง server เรียก `gtaa macro` + POST /api/gtaa/snapshot",
    value: "ปิดจุดที่ต้องจำเอง — รอบตัดสินใจไม่มีวันลืม",
  },
  {
    id: "alerts",
    no: 23,
    cat: "ship",
    icon: BellRing,
    name: "แจ้งเตือน (Line/Email)",
    role: "ส่ง posture/breaker เปลี่ยนเหตุการณ์ถึงมือ",
    base: "locked",
    unlock: "มี channel + กติกา double-key กันสแปม และทดสอบโหนดยิงจริงผ่าน audit",
    value: "เห็นเหตุการณ์สำคัญโดยไม่ต้องเปิดหน้าเว็บ",
  },
  {
    id: "paper-mode",
    no: 24,
    cat: "ship",
    icon: ShieldAlert,
    name: "Paper Mode 100%",
    role: "โครงสร้างทั้งระบบไม่ยิงคำสั่งจริงโดยไม่ผ่านเกต",
    base: "unlocked",
    value: "ข้อจำกัดที่ตั้งใจ — เรียนรู้/พิสูจน์ก่อน แล้วค่อยคุยเรื่องเงินจริง",
  },
]

/** คิวปลดล็อกถัดไป — เรียงตามลำดับที่ลงทะเบียนไว้ (อิง worklog และเงื่อนไขใน docs) */
export interface UnlockQueueItem {
  title: string
  condition: string
  value: string
  skillId: string
}

export const UNLOCK_QUEUE: UnlockQueueItem[] = [
  {
    title: "Cron ท้ายเดือนฝั่ง server",
    condition: "ตั้ง scheduler เรียก `bun run gtaa -- macro` + POST snapshot สิ้นเดือน",
    value: "ปิดงานมือข้อเดียวที่เหลือของพิธีรายเดือน",
    skillId: "cron-monthend",
  },
  {
    title: "GTAA stance → input ของ regime gate ไทย (มีน้ำหนัก)",
    condition: "tracking log ต้องมีหลักฐานว่า stance ช่วยตัดสินใจได้จริงก่อน (ผ่านรอบประเมิน)",
    value: "ประตูโลกหยุดเป็นแค่ป้ายเฝ้าดู — เริ่มมีสิทธิ์ออกเสียง",
    skillId: "global-monthly",
  },
  {
    title: "แจ้งเตือนเหตุการณ์สำคัญ",
    condition: "channel พร้อม + double-key + ทดสอบยิงจริงผ่าน hash chain",
    value: "posture/breaker เปลี่ยน = รู้ทันที",
    skillId: "alerts",
  },
  {
    title: "ข้อมูลชั้น tick จริง",
    condition: "หา source ขาย/ดึงได้ + เก็บ order-book snapshot ตามแผน docs §4",
    value: "SET Sniper เปิดเต็มรูป — absorption จาก proxy เป็นของจริง",
    skillId: "tick-l2",
  },
]

/** 3 คำถามก่อนเลือกพัฒนา (ปรับจากกรอบเลือก skill ในโพสต์ต้นทาง) */
export const THREE_QUESTIONS = [
  {
    q: "ปัญหาจริงคืออะไร?",
    hint: "ไม่ใช่ \u201cอยากมีฟีเจอร์ใหม่\u201d — แต่งานไหนติดจริงในพิธีรายวัน/รายเดือน",
  },
  {
    q: "ความถี่ของปัญหานี้?",
    hint: "เกิดทุกวัน → คุ้มลงทุนสร้างระบบ · ปีละครั้ง → ทำมืออาจถูกกว่า",
  },
  {
    q: "ค่าใช้จ่าย vs ผลได้?",
    hint: "เวลาสร้าง + ความเสี่ยงบั๊กใหม่ เทียบกับเวลา/ความผิดพลาดที่ประหยัดได้",
  },
]

/** สถานะเมทริกซ์ 2×2: ความถี่ × ความยาก (คงที่ — ป้ายลงทะเบียน) */
export const MATRIX_CELLS = {
  freqEasy: "ใช้ทันที — สร้างเลย",
  freqHard: "ลงทุนเรียนรู้ — ทำเป็นโหนดล็อกพร้อมเงื่อนไข",
  rareEasy: "ทำมือเอา — ไม่สร้างระบบ",
  rareHard: "จดไว้เท่านั้น — อย่าเพิ่งลงมือ",
} as const
