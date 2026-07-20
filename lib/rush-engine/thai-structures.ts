// ╔══════════════════════════════════════════════════════════════════╗
// ║  THAI & ASIAN NARRATIVE STRUCTURES — the cultural moat, encoded.   ║
// ║  Western three-act is conflict→climax→resolution. These are the    ║
// ║  indigenous/Asian alternatives: contrast-driven (kishōtenketsu),   ║
// ║  karma/restoration-driven (จักร ๆ วงศ์ ๆ, นิทานพื้นบ้าน), and the   ║
// ║  nested-frame didactic form (ชาดก). Given a chapter count, each     ║
// ║  maps a chapter to its beat — real guidance, not a label.          ║
// ║                                                                    ║
// ║  Sourced from Thai folklore scholarship (ศิราพร ณ ถลาง; Propp-      ║
// ║  based Chula analyses) + kishōtenketsu / Jātaka references. Where   ║
// ║  a beat list is a scholarly SYNTHESIS rather than one fixed         ║
// ║  template, `note` says so — honesty over false authority.          ║
// ╚══════════════════════════════════════════════════════════════════╝

export interface StructureBeat {
  thai: string;   // Thai name of the beat (glosses where flagged)
  en: string;
  desc: string;   // what this beat does — becomes chapter guidance
}
export interface NarrativeStructure {
  id: string;
  thai: string;
  en: string;
  origin: string;
  conflictDriven: boolean; // false = builds on contrast/karma, not antagonist-conflict
  note?: string;           // confidence / provenance caveat, surfaced honestly
  beats: StructureBeat[];
}

export const NARRATIVE_STRUCTURES: NarrativeStructure[] = [
  {
    id: "kishotenketsu",
    thai: "คิโชเท็งเค็ตสึ (起承転結)",
    en: "Kishōtenketsu — 4-part",
    origin: "บทกวีจีน (qǐ-chéng-zhuǎn-hé) → ญี่ปุ่น/เกาหลี · โครงที่ไม่ต้องมีความขัดแย้งเป็นแกน",
    conflictDriven: false,
    note: "คำอ่านไทยและคำแปลรายช่วง (ปูเรื่อง/ขยาย/หักมุม/สรุป) เป็นคำกลอส ไม่ใช่ศัพท์ทางการ",
    beats: [
      { thai: "起 คิ — ปูเรื่อง", en: "Ki (introduction)", desc: "แนะนำตัวละคร ฉาก สถานการณ์ — ยังไม่ต้องมีความขัดแย้ง แค่วางว่า 'อะไรเป็นอะไร'" },
      { thai: "承 โช — ขยายความ", en: "Shō (development)", desc: "ต่อยอดสิ่งที่ปูไว้ให้ลึกขึ้น เดินเรื่องไปข้างหน้า — ยังไม่ต้องมีปม" },
      { thai: "転 เท็ง — หักมุม (พลิกมุมมอง)", en: "Ten (the turn)", desc: "แกนของโครงนี้: เพิ่มองค์ประกอบใหม่ที่ดูไม่เกี่ยว หรือพลิกมุมมอง — 'หัก' ไม่ใช่ 'ปมความขัดแย้ง'" },
      { thai: "結 เค็ตสึ — สรุป", en: "Ketsu (conclusion)", desc: "ประสาน คิ+โช เข้ากับ เท็ง ให้ผู้อ่านเห็นว่าส่วนที่ดูไม่เกี่ยวนั้นเชื่อมกันอย่างไร เกิดความหมาย/ความกลมกลืน" },
    ],
  },
  {
    id: "thai-plot",
    thai: "โครงเรื่อง 5 ขั้น (ไทย)",
    en: "Thai 5-stage plot (Freytag, Thai terms)",
    origin: "คำศัพท์ในวิชาวรรณกรรมไทย — โมเดลตะวันตกที่แปลเป็นไทย (ฐานเทียบ conflict-driven)",
    conflictDriven: true,
    beats: [
      { thai: "การเปิดเรื่อง", en: "Exposition", desc: "เปิดเรื่อง: ดึงความสนใจ แนะนำตัวละครและสถานการณ์" },
      { thai: "การสร้างปมปัญหา", en: "Complication", desc: "ก่อปม: นำความขัดแย้ง/ปัญหาเข้ามา สร้างแรงตึง" },
      { thai: "จุดวิกฤต / จุดสูงสุด", en: "Crisis & climax", desc: "จุดไคลแมกซ์: ความตึงเครียดถึงขีดสุด เผชิญหน้า" },
      { thai: "การคลายปม", en: "Falling action", desc: "คลายปม: ผลของจุดสูงสุดคลี่ตัว" },
      { thai: "การคลี่คลายเรื่อง", en: "Denouement", desc: "ปิดเรื่อง: สภาวะใหม่ ข้อสรุปแก่นเรื่อง" },
    ],
  },
  {
    id: "chak-wong",
    thai: "จักร ๆ วงศ์ ๆ",
    en: "Chak-chak Wong-wong (heroic-romance)",
    origin: "นิทาน/ละครวีรบุรุษ-โรแมนซ์ไทย — วิเคราะห์แนวพรอพพ์ (ศิราพร ณ ถลาง)",
    conflictDriven: true,
    note: "ลำดับช่วงเป็นการสังเคราะห์จากงานวิชาการ (โครงพรอพพ์) ไม่มีเทมเพลตตายตัวหนึ่งเดียว",
    beats: [
      { thai: "กำเนิดวิเศษ", en: "Divine/royal birth", desc: "วีรบุรุษเชื้อกษัตริย์/เทวะ เกิดพร้อมของวิเศษหรือสัตว์คู่บารมี" },
      { thai: "ริษยาในวัง", en: "Court intrigue", desc: "มเหสีรอง/แม่เลี้ยงริษยา ใส่ร้ายว่าเป็นกาลกิณี" },
      { thai: "พลัดพราก", en: "Exile & separation", desc: "ถูกขับจากเมือง พรากจากคนรัก — โทรปเด่นของแนวนี้" },
      { thai: "เรียนวิชา + ของวิเศษ", en: "Training & magic", desc: "ฝึกวิชากับฤๅษี ได้อาวุธวิเศษและผู้ช่วย" },
      { thai: "ผจญภัย + รบยักษ์", en: "Adventure & war", desc: "เดินทางแดนมหัศจรรย์ ปราบยักษ์/คู่ปรับ" },
      { thai: "คืนสู่คนรัก", en: "Reunion", desc: "กลับมาพบคนรักอีกครั้ง" },
      { thai: "ครองเมือง", en: "Enthronement", desc: "คืนความเป็นระเบียบ ครองราชย์ ธรรมะชนะอธรรม" },
    ],
  },
  {
    id: "nithan",
    thai: "นิทานพื้นบ้าน (มหัศจรรย์)",
    en: "Thai folk wonder-tale",
    origin: "นิทานมหัศจรรย์ไทย — วิเคราะห์โครงพรอพพ์ (ศิราพร ณ ถลาง / วิทยานิพนธ์จุฬาฯ)",
    conflictDriven: false,
    note: "โครงเป็นการสังเคราะห์แบบเติมตอน (episodic) ตามตรรกะบุญกรรม ไม่ใช่ปมขัดแย้งเดียว",
    beats: [
      { thai: "กำเนิดอัศจรรย์", en: "Miraculous origin", desc: "เกิดจากสิ่งมหัศจรรย์ (ในดอกบัว/ไข่/หอย) มีบุญบารมีหรือคู่วิเศษ" },
      { thai: "เคราะห์/อยุติธรรม", en: "Lack / injustice", desc: "ถูกใส่ร้าย ถูกกลั่นแกล้งจากผู้อิจฉา" },
      { thai: "ออกเดินทาง", en: "Departure", desc: "พลัดพรากเข้าป่า/สู่โลกกว้าง" },
      { thai: "ผู้ช่วยวิเศษ", en: "Magical helpers", desc: "พบครู/ฤๅษี ได้ของวิเศษและสัตว์ผู้ช่วย" },
      { thai: "บททดสอบ", en: "Tests", desc: "ผจญภัย พบคู่ครอง ปราบสิ่งชั่วร้าย" },
      { thai: "คืนสภาพ/ครองเมือง", en: "Restoration", desc: "กลับคืน ทวงสิ่งที่เสียไป ได้รับการยกย่อง" },
      { thai: "คติ", en: "Moral", desc: "ความดีชนะ บุญ/คุณธรรมได้รับผลตอบแทน" },
    ],
  },
  {
    id: "jataka",
    thai: "ชาดก (นิทานคติธรรม)",
    en: "Jātaka frame-tale",
    origin: "อรรถกถาชาดก — โครงเรื่องซ้อนกรอบ (นิทานปัจจุบัน ⊃ อดีต ⊃ ประชุมชาดก)",
    conflictDriven: false,
    note: "แกนหลัก 4 ส่วน (ปลอดภัยสุด); บางฉบับเพิ่มอารัมภกถา/คำอธิบายคาถาเป็น 5–6 ส่วน",
    beats: [
      { thai: "ปัจจุบันวัตถุ", en: "Story of the present", desc: "เหตุการณ์สมัยพุทธกาลที่เป็นเหตุให้ตรัสเล่านิทาน — วางโอกาส" },
      { thai: "อดีตวัตถุ", en: "Story of the past", desc: "นิทานอดีตชาติ: พระโพธิสัตว์บำเพ็ญบารมี/คุณธรรม" },
      { thai: "คาถา", en: "The verse (gāthā)", desc: "คาถาแก่นคำสอนฝังในเนื้อเรื่อง — หัวใจเชิงหลักธรรม" },
      { thai: "สโมธาน (ประชุมชาดก)", en: "The identification", desc: "ระบุว่าตัวละครในอดีตคือใครในปัจจุบัน ('ผู้นั้นคือเราตถาคต') ปิดกรอบ + คติ" },
    ],
  },
];

const BY_ID: Record<string, NarrativeStructure> = NARRATIVE_STRUCTURES.reduce(
  (m, s) => { m[s.id] = s; return m; },
  {} as Record<string, NarrativeStructure>
);

export function structureById(id: string | undefined): NarrativeStructure | null {
  return id ? BY_ID[id] ?? null : null;
}

export interface StructurePhase {
  structure: NarrativeStructure;
  beat: StructureBeat;
  beatIndex: number;   // 0-based
  beatCount: number;
}

/** Map a chapter (1-based) to its beat within the chosen structure, proportionally across
 *  the book. Deterministic; the same (id, chapter, total) always yields the same beat. */
export function structurePhase(id: string, chapter1: number, totalChapters: number): StructurePhase | null {
  const structure = BY_ID[id];
  if (!structure || totalChapters < 1 || chapter1 < 1) return null;
  const b = structure.beats.length;
  const idx = Math.min(b - 1, Math.floor(((chapter1 - 1) / Math.max(1, totalChapters)) * b));
  return { structure, beat: structure.beats[idx], beatIndex: idx, beatCount: b };
}

/** Thai chapter-prompt guidance block for the chosen structure, or "" if none / not found. */
export function structureGuidanceTh(id: string | undefined, chapter1: number, totalChapters: number): string {
  if (!id) return "";
  const ph = structurePhase(id, chapter1, totalChapters);
  if (!ph) return "";
  const engine = ph.structure.conflictDriven ? "ขับด้วยปมความขัดแย้ง" : "ขับด้วยความตัดกัน/บุญกรรม ไม่ต้องมีคู่ปรับก็ได้";
  return (
    `═══ โครงเรื่อง: ${ph.structure.thai} ═══\n` +
    `แนวขับเคลื่อน: ${engine}\n` +
    `บทนี้อยู่ช่วง ${ph.beatIndex + 1}/${ph.beatCount} — ${ph.beat.thai}: ${ph.beat.desc}\n`
  );
}
