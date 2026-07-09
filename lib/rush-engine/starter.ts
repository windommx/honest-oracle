// ╔══════════════════════════════════════════════════════════════════╗
// ║  STARTER SEQUENCE — the "start a novel from an idea" journey.      ║
// ║  Orders the existing core + craft prompts into a numbered path     ║
// ║  (idea → genre → premise → characters → world → outline → opening  ║
// ║  → roadmap), so writers follow one guided flow instead of picking  ║
// ║  from a flat pack. Pure data — every step points at prompt IDs the ║
// ║  engine already produces; a guard test keeps those IDs valid.      ║
// ╚══════════════════════════════════════════════════════════════════╝

export interface StarterStep {
  n: number;
  key: string;
  titleTh: string;
  titleEn: string;
  whyTh: string;
  /** Prompt/module IDs (from the generated pack) that fulfil this step. */
  promptIds: string[];
  /** Module group the writer must enable for this step's modules (null = core). */
  group: string | null;
}

export const STARTER_SEQUENCE: StarterStep[] = [
  {
    n: 1, key: "genre", titleTh: "ล็อกแนว + คำสัญญาต่อคนอ่าน", titleEn: "Genre reader-promise",
    whyTh: "รู้ว่าคนอ่านแนวนี้มาหาอะไร ก่อนตัดสินใจอย่างอื่น",
    promptIds: ["GENRE_CORE"], group: "craft",
  },
  {
    n: 2, key: "premise", titleTh: "ตกผลึก premise + แผนเล่ม", titleEn: "Premise & book plan",
    whyTh: "แก่นเรื่องหนึ่งบรรทัด + ภาพรวมทั้งเล่ม (ลองหลายมุมด้วย brainstorm)",
    promptIds: ["OVERVIEW", "BRAINSTORM"], group: null,
  },
  {
    n: 3, key: "character", titleTh: "วางตัวละครหลัก", titleEn: "Build the cast",
    whyTh: "เป้าหมาย / ปมในใจ / ปมขัดแย้ง / เส้นการเติบโต + เสียงที่ต่างกันชัด",
    promptIds: ["CHAR_ARC", "VOICE_SHEET"], group: "craft",
  },
  {
    n: 4, key: "world", titleTh: "จัดระบบโลก", titleEn: "Order the world",
    whyTh: "story bible + กฎของโลก เพื่อกันความขัดแย้งข้ามบท",
    promptIds: ["WORLD_CODEX"], group: "craft",
  },
  {
    n: 5, key: "outline", titleTh: "เขียน Outline รายบท", titleEn: "Chapter outline",
    whyTh: "แมป beat ลงแต่ละบท (Save the Cat / Hero's Journey / ฯลฯ)",
    promptIds: ["STRUCTURE"], group: "craft",
  },
  {
    n: 6, key: "opening", titleTh: "ร่างตอนเปิดเรื่อง", titleEn: "Draft the opening",
    whyTh: "เขียนบทที่ 1 + ดึงผู้อ่านเข้าไปข้างในด้วย deep-POV pass",
    promptIds: ["CH_1", "IMMERSION"], group: "craft",
  },
  {
    n: 7, key: "roadmap", titleTh: "Roadmap เขียนต่อ", titleEn: "Roadmap to keep going",
    whyTh: "สรุปกลิ้งไปข้างหน้าเพื่อรักษาความต่อเนื่องตอนเขียนบทถัดไป",
    promptIds: ["RECAP"], group: "advanced",
  },
];

/** Module groups the starter journey needs enabled (for the group toggles). */
export const STARTER_GROUPS: string[] = Array.from(
  new Set(STARTER_SEQUENCE.map((s) => s.group).filter((g): g is string => g !== null))
);
