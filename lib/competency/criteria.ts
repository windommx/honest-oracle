// ╔══════════════════════════════════════════════════════════════════╗
// ║  HD COMPETENCY — the assessment instrument, transcribed from the   ║
// ║  source workbook "แบบประเมิน Level พยาบาลไตเทียม" (sheet FORM).     ║
// ║                                                                    ║
// ║  10 criteria × 5 levels. Each level is worth `point` (1-5) and the ║
// ║  workbook's Analysis sheet scores it as point × 2 (2-10 per         ║
// ║  criterion, 100 in total). Level texts are the workbook's own words ║
// ║  (typos in the source such as "Drescription" corrected, wording     ║
// ║  otherwise kept), so an assessor sees the same rubric on screen as  ║
// ║  on the paper form. This file is DATA: no logic lives here.         ║
// ╚══════════════════════════════════════════════════════════════════╝

export interface CriterionLevel {
  /** 1-5, the value the assessor picks. */
  point: number;
  /** Short label of the level — the first line of the workbook cell. */
  title: string;
  /** The rest of the workbook cell: what this level looks like in practice. */
  description: string;
}

export interface Criterion {
  /** 1-10, the row number in the FORM sheet. Also the key of a scores map. */
  id: number;
  name: string;
  /** Short name for chart axes and narrow tables. */
  shortName: string;
  levels: [CriterionLevel, CriterionLevel, CriterionLevel, CriterionLevel, CriterionLevel];
}

/** Points per criterion level are scored ×2 in the workbook (2, 4, 6, 8, 10). */
export const POINT_MULTIPLIER = 2;
export const MAX_POINT = 5;
export const MIN_POINT = 1;
export const CRITERION_MAX_SCORE = MAX_POINT * POINT_MULTIPLIER; // 10
export const TOTAL_MAX_SCORE = 100;

export const CRITERIA: readonly Criterion[] = [
  {
    id: 1,
    name: "วุฒิบัตร",
    shortName: "วุฒิบัตร",
    levels: [
      { point: 1, title: "รออบรม", description: "ทำงานไตเทียม (ยังไม่ได้เข้ารับการอบรม)" },
      { point: 2, title: "อยู่ระหว่างการอบรม", description: "ไปอบรมแต่กลับมาทำงาน" },
      {
        point: 3,
        title: "ไม่มีประสบการณ์มาก่อน + ผ่านการอบรม",
        description: "จบหลักสูตรพร้อมใบวุฒิบัตร",
      },
      {
        point: 4,
        title: "มีประสบการณ์มาก่อน + ผ่านการอบรม",
        description: "จบหลักสูตรพร้อมใบวุฒิบัตร",
      },
      { point: 5, title: "เป็นผู้เชี่ยวชาญไตเทียม", description: "สอบผ่านมีใบผู้เชี่ยวชาญ" },
    ],
  },
  {
    id: 2,
    name: "ประสบการณ์การทำงาน",
    shortName: "ประสบการณ์",
    levels: [
      { point: 1, title: "ทำงานพยาบาล 0-3 ปี", description: "พยาบาล RN (รออบรม)" },
      { point: 2, title: "ทำงานพยาบาล 3-6 ปี", description: "พยาบาล RN (รออบรม)" },
      { point: 3, title: "พยาบาลไตเทียม 0-2 ปี", description: "ทำงานหน่วยไตเทียม (ผ่านทดลองงาน)" },
      { point: 4, title: "พยาบาลไตเทียม 2-4 ปี", description: "พยาบาลไตเทียม" },
      { point: 5, title: "พยาบาลไตเทียม 4 ปีขึ้นไป", description: "พยาบาลไตเทียม" },
    ],
  },
  {
    id: 3,
    name: "Skill การแทงเส้น",
    shortName: "แทงเส้น",
    levels: [
      { point: 1, title: "ยังแทงเส้นไม่ได้", description: "0-10% ของยอดคนไข้ (1 ใน 10)" },
      { point: 2, title: "แทงเส้นได้บ้าง (มีคนช่วย)", description: "10-30% ของยอดคนไข้ (3 ใน 10)" },
      {
        point: 3,
        title: "แทงเส้นได้ปานกลาง (มีคนช่วยบางครั้ง)",
        description: "30-60% ของยอดคนไข้ (6 ใน 10)",
      },
      { point: 4, title: "แทงเส้นได้ดี (ไม่ต้องใช้คนช่วย)", description: "60-90% ของยอดคนไข้ (9 ใน 10)" },
      { point: 5, title: "แทงเส้นได้ดีมาก", description: "100% ของยอดคนไข้ (แทงได้ทุกเคส)" },
    ],
  },
  {
    id: 4,
    name: "Skill การใช้เครื่องไตเทียม",
    shortName: "ใช้เครื่อง",
    levels: [
      { point: 1, title: "ยังใช้เครื่องไม่ได้", description: "กำลังฝึกใช้เครื่องไตเทียม" },
      {
        point: 2,
        title: "ใช้เครื่องเป็น (ตั้งแต่เริ่มจนจบการทำงาน)",
        description: "ใช้เครื่องสำหรับเข้าและออก (ทำคนเดียว)",
      },
      {
        point: 3,
        title: "ใช้เครื่องเป็นพร้อมแก้ปัญหาได้ (ยังใช้เครื่องไม่คล่องทุกรุ่น)",
        description: "แก้ปัญหาเครื่องได้เบื้องต้น เช่น แก้ air, blood leak",
      },
      {
        point: 4,
        title: "ใช้เครื่องได้ทุก option (ทุกรุ่น)",
        description: "Na profile, UF profile, online Kt/V · โทรหาช่างบอกปัญหาได้ (แก้ code error ต่างๆ)",
      },
      {
        point: 5,
        title: "เมื่อเครื่องไตเทียมเกิดปัญหา บอกปัญหาช่างได้ตรงจุด",
        description: "พร้อมแก้ปัญหาเบื้องต้นตามช่างแนะนำได้ (ถอดเครื่อง ซ่อมเบื้องต้น)",
      },
    ],
  },
  {
    id: 5,
    name: "Skill การดูแลระบบน้ำ RO",
    shortName: "ระบบน้ำ RO",
    levels: [
      { point: 1, title: "ยังไม่เข้าใจหลักการเครื่อง RO", description: "กำลังฝึกใช้การดูแลเครื่อง RO" },
      {
        point: 2,
        title: "เข้าใจหลักการทำงานเครื่อง RO",
        description: "สามารถเก็บน้ำส่งตรวจ, ตรวจคลอรีน, Hardness",
      },
      {
        point: 3,
        title: "ดูแลเครื่อง RO ประจำวันได้",
        description: "ลงบันทึกประจำวัน, เติมเกลือ, รู้ความผิดปกติได้, ประสานงานส่งน้ำ",
      },
      {
        point: 4,
        title: "เมื่อเครื่อง RO มีปัญหาช่วยแก้ได้",
        description: "น้ำหมด, air เข้าระบบ RO (แก้ไขเฉพาะหน้าเพื่อให้คนไข้ฟอกได้)",
      },
      {
        point: 5,
        title: "จัดการได้ทั้งหมดเมื่อเครื่องเสีย",
        description: "แก้ไขเฉพาะหน้าได้ (ผสานงานช่างมาซ่อม, จัดการคิวคนไข้ใหม่)",
      },
    ],
  },
  {
    id: 6,
    name: "การทำงานตามหน้าที่ (Job Description)",
    shortName: "หน้าที่งาน",
    levels: [
      { point: 1, title: "อยู่ในช่วงเรียนรู้งาน (3-6 เดือน)", description: "ทำ treatment" },
      { point: 2, title: "เป็นทีม member", description: "ทำ treatment, งานธุรการ · Hosxp, DMIS, HD2.4" },
      {
        point: 3,
        title: "เป็น INCHARGE ได้",
        description: "รายงานแพทย์, จัดคิวคนไข้, ผสานงานต่างๆ · ประสานงานทำเส้นคนไข้, รู้สิทธิต่างๆ",
      },
      {
        point: 4,
        title: "บริหารหน่วยไตเทียมได้",
        description: "จัดการ stock, สั่งเบิกของ · ผ่านอบรม TRT, จัดการยา EPO",
      },
      {
        point: 5,
        title: "หัวหน้าหน่วยไตเทียม",
        description: "ผสานงานผู้บริหาร, บริหารจัดการโดยรวม, วางบิล, ต่อ ตรต., ทำมาตรฐาน HA",
      },
    ],
  },
  {
    id: 7,
    name: "ความมั่นใจและเชื่อมั่นในตนเอง",
    shortName: "ความมั่นใจ",
    levels: [
      { point: 1, title: "อยู่ในช่วงเรียนรู้งาน", description: "ต้องมีพี่เลี้ยงคอยดูแล" },
      {
        point: 2,
        title: "มีความมั่นใจน้อย (อยู่เวรคนเดียวไม่ได้)",
        description: "ยังแก้ไขปัญหา complication ต่างๆ ไม่คล่อง",
      },
      {
        point: 3,
        title: "มีความมั่นใจปานกลาง (ไม่กล้าตัดสินใจ ต้องมีคนคอยช่วยเหลือ)",
        description: "แก้ไขปัญหาเครื่องได้คล่อง แต่แก้ไขปัญหาคนไข้ไม่คล่อง",
      },
      {
        point: 4,
        title: "มีความมั่นใจ (กล้าตัดสินใจ แต่ยังต้องมีคนคอยช่วยบ้าง)",
        description: "แก้ปัญหาเครื่องและคนไข้ได้อย่างปลอดภัย",
      },
      {
        point: 5,
        title: "มีความมั่นใจมาก (ทำงานได้ทั้งหมด อยู่คนเดียวได้)",
        description: "แก้ปัญหาเครื่องและคนไข้ได้ รวดเร็ว ปลอดภัย",
      },
    ],
  },
  {
    id: 8,
    name: "มีความเป็นผู้นำและเป็น coaching ได้",
    shortName: "ผู้นำ/coaching",
    levels: [
      { point: 1, title: "อยู่ในช่วงเรียนรู้งาน", description: "ยังไม่สามารถตัดสินใจเองได้" },
      {
        point: 2,
        title: "สามารถคอยดูแลการทำงานของผู้ช่วย",
        description: "ให้เป็นไปตามขบวนการการทำงานได้ (ระบบ)",
      },
      {
        point: 3,
        title: "สามารถถ่ายทอดความรู้เรื่องเครื่องและการดูแลคนไข้ได้",
        description: "ฝึกพยาบาลและผู้ช่วยให้ทำงานด้านหัตถการต่างๆ ได้",
      },
      {
        point: 4,
        title: "สามารถถ่ายทอดความรู้เกี่ยวกับโรคไตให้กับพยาบาลใหม่",
        description: "การใช้งานเครื่องขั้นสูงแบบต่างๆ เช่น Na profile, UF profile",
      },
      {
        point: 5,
        title: "สามารถถ่ายทอดความรู้เพื่อการเตรียมสอบ เรียนต่อเวชปฏิบัติ หรือติวสอบผู้เชี่ยวชาญ",
        description: "สอนขบวนการทำงานทั้งหมดในแผนกไตเทียมได้",
      },
    ],
  },
  {
    id: 9,
    name: "การดูแลแนะนำคนไข้ในการปฏิบัติตัวเองได้",
    shortName: "แนะนำคนไข้",
    levels: [
      { point: 1, title: "อยู่ในช่วงเรียนรู้งาน", description: "ยังไม่กล้าแนะนำ ความรู้ยังไม่เพียงพอ" },
      {
        point: 2,
        title: "มีความรู้และหลักการในการแนะนำเรื่องอาหารได้",
        description: "เช่น การดื่มน้ำ, อาหาร low salt, K สูง, ฟอสเฟตสูง",
      },
      {
        point: 3,
        title: "มีความรู้และหลักการในการปรับเปลี่ยน Prescription ได้",
        description: "ดูแลการฟอกเลือดคนไข้ให้ได้ Kt/V ตามมาตรฐาน",
      },
      {
        point: 4,
        title: "แนะนำคนไข้ที่มีปัญหาให้สามารถปรับเปลี่ยนพฤติกรรมได้",
        description: "เช่น น้ำหนักเกินตลอด, ความดันสูงตลอด, ไม่มาฟอกตามนัด",
      },
      {
        point: 5,
        title: "สามารถให้คำปรึกษา (Counseling) แบบองค์รวมได้",
        description: "ผสานงานเพื่อให้ได้รับการช่วยเหลือจากหน่วยงานต่างๆ ได้",
      },
    ],
  },
  {
    id: 10,
    name: "การดูแลจัดการแฟ้มคนไข้",
    shortName: "แฟ้มคนไข้",
    levels: [
      { point: 1, title: "อยู่ในช่วงเรียนรู้งาน", description: "ยังไม่เข้าใจเอกสารต่างๆ ในแฟ้มคนไข้" },
      {
        point: 2,
        title: "ศึกษาเข้าใจเอกสารต่างๆ และสามารถลงได้ถูกต้อง",
        description: "ทราบค่าผิดปกติต่างๆ (LAB), จัดทำแฟ้มเป็นระเบียบเรียบร้อย",
      },
      {
        point: 3,
        title: "เข้าใจปัญหาคนไข้ เช่น ค่า LAB ต่างๆ ติดตามการรักษา",
        description: "ติดตามการรักษา พร้อมรายงานแพทย์ เช่น การปรับเปลี่ยนยาต่างๆ",
      },
      {
        point: 4,
        title: "ติดตามปัญหาคนไข้รายคนได้ (ROUND แฟ้มเป็นประจำ)",
        description: "สามารถเก็บข้อมูล ดัชนีชี้วัดต่างๆ ให้กับแผนกได้",
      },
      {
        point: 5,
        title: "เก็บข้อมูลต่างๆ เพื่อนำไปคำนวณหา KPI ต่างๆ ได้",
        description: "ทำฐานข้อมูลคนไข้เพื่อใช้พัฒนาการให้บริการคนไข้ให้ดียิ่งขึ้นไป",
      },
    ],
  },
];

export const CRITERION_COUNT = CRITERIA.length; // 10

// ── Competency levels (sheet OUTCOME) ──────────────────────────────────────────
// Levels 1-5 are SCORED bands. The workbook prints them as "น้อยกว่า 50" / "51-60" /
// "61-70" / "71-80" / "81-100", which leaves exactly 50 unassigned; every total is
// even (points × 2), so 50 is reachable. We put it in LEVEL 1 — a nurse who has not
// reached 51 has not reached the LEVEL 2 band. `band` states that reading plainly.
//
// Levels 6-7 are MANAGEMENT tiers ("ระดับบริหาร": หัวหน้าแผนก / ผู้จัดการศูนย์). The
// sheet assigns them by role, not by score, so they live in MANAGEMENT_LEVELS and on
// the nurse record, never in bandOf().

export interface CompetencyLevel {
  level: number;
  enName: string;
  thName: string;
  /** Inclusive score range [min, max]. */
  min: number;
  max: number;
  /** Human band text, as printed on the summary sheet (with the 50 case made explicit). */
  band: string;
  /** Staff group the OUTCOME sheet draws under the level columns. */
  group: "Novice" | "Operational Staff" | "Senior Staff";
  /** Chart colour (hex). The UI's Tailwind badge classes are derived from `level`. */
  color: string;
}

export const COMPETENCY_LEVELS: readonly CompetencyLevel[] = [
  { level: 1, enName: "Novice", thName: "ผู้เริ่มต้น", min: 0, max: 50, band: "ไม่เกิน 50 คะแนน", group: "Novice", color: "#dc2626" },
  { level: 2, enName: "Advance Beginner", thName: "ผู้เรียนรู้", min: 51, max: 60, band: "51 - 60 คะแนน", group: "Operational Staff", color: "#ea580c" },
  { level: 3, enName: "Competent", thName: "ผู้ปฏิบัติ", min: 61, max: 70, band: "61 - 70 คะแนน", group: "Operational Staff", color: "#0d9488" },
  { level: 4, enName: "Proficient", thName: "ผู้ชำนาญ", min: 71, max: 80, band: "71 - 80 คะแนน", group: "Senior Staff", color: "#059669" },
  { level: 5, enName: "Expert", thName: "ผู้เชี่ยวชาญ", min: 81, max: 100, band: "81 - 100 คะแนน", group: "Senior Staff", color: "#7c3aed" },
];

export interface ManagementLevel {
  level: 6 | 7;
  enName: string;
  thName: string;
}

/** ระดับบริหาร — assigned by role on the nurse record, not computed from a score. */
export const MANAGEMENT_LEVELS: readonly ManagementLevel[] = [
  { level: 6, enName: "Top Manager", thName: "หัวหน้าแผนก" },
  { level: 7, enName: "Director", thName: "ผู้จัดการศูนย์" },
];

/** Suggested positions for the nurse form (free text is still allowed). */
export const POSITION_SUGGESTIONS: readonly string[] = [
  "พยาบาลวิชาชีพ",
  "พยาบาลวิชาชีพชำนาญการ",
  "พยาบาลไตเทียม",
  "หัวหน้าหน่วยไตเทียม",
  "หัวหน้าแผนก",
  "ผู้จัดการศูนย์",
];

export const DEFAULT_POSITION = "พยาบาลวิชาชีพ";
