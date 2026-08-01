// ╔══════════════════════════════════════════════════════════════════╗
// ║  BOOTSTRAPS — 20 one-click starting points ("แม่แบบตั้งต้น").      ║
// ║  Pure data: each preset is a valid BookConfig seed (type + genre   ║
// ║  + length + narrative structure) that deep-links into /rush via    ║
// ║  the existing query-param mechanism. No new plumbing — a guard     ║
// ║  test keeps every preset valid against BOOK_TYPES and the          ║
// ║  structure registry, so a rename there fails the build here.       ║
// ║                                                                    ║
// ║  Curation bias (stated honestly): Thai-market-first — serial       ║
// ║  romance/Y, duanju-shaped micro-chapters, จักร ๆ วงศ์ ๆ, ชาดก —     ║
// ║  plus the evergreen nonfiction shapes. Numbers are editorial       ║
// ║  defaults, not market data.                                        ║
// ╚══════════════════════════════════════════════════════════════════╝

import type { BookTypeKey } from "./types";

export interface Bootstrap {
  id: string;
  nameTh: string;
  nameEn: string;
  /** One honest line: what this shape is FOR (no hype, no fake numbers). */
  taglineTh: string;
  type: BookTypeKey;
  genre: string;       // must be in BOOK_TYPES[type].sub_genres (guard-tested)
  chapters: number;    // 1..100 (the /rush deep-link cap)
  words: number;       // 100..20000 per chapter
  structure: string;   // narrative structure id, or "" = standard 3-act
}

export const BOOTSTRAPS: Bootstrap[] = [
  // ── fiction · serial-first (the Thai web market) ──
  { id: "rom-serial", nameTh: "นิยายรักรายตอน", nameEn: "Serial romance", taglineTh: "รักร่วมสมัยแบบแพลตฟอร์มไทย — ทุกบทปิดด้วย hook", type: "novel", genre: "romance", chapters: 30, words: 1800, structure: "thai-web-novel" },
  { id: "office-slowburn", nameTh: "รักออฟฟิศ slow burn", nameEn: "Office slow burn", taglineTh: "เคมีค่อยก่อตัวใต้ความเป็นมืออาชีพ — เดิน 15 beat เต็มเล่ม", type: "novel", genre: "romance", chapters: 24, words: 2200, structure: "save-the-cat" },
  { id: "y-serial", nameTh: "นิยายวาย (Y) รายตอน", nameEn: "Y/BL serial", taglineTh: "โครงรายตอน + เสียงตัวละครชายสองเสียงที่ต้องต่างกันชัด", type: "novel", genre: "romance", chapters: 24, words: 1800, structure: "thai-web-novel" },
  { id: "duanju-revenge", nameTh: "เกิดใหม่ล้างแค้น (ตอนสั้น)", nameEn: "Rebirth revenge micro-serial", taglineTh: "บทสั้นแนวตั้ง 80 ตอน — เปิดทอง 3 ตอนแรก จุดอารมณ์ทุกตอน", type: "novel", genre: "thriller", chapters: 80, words: 600, structure: "duanju" },
  { id: "golden-system", nameTh: "แฟนตาซีระบบ (สามบททอง)", nameEn: "System fantasy, golden-three", taglineTh: "สามบทแรกคือชีวิต — แล้วเดินเครื่องรายตอนแบบนิยายเว็บจีน", type: "novel", genre: "fantasy", chapters: 60, words: 1500, structure: "golden-three" },
  { id: "ya-serial", nameTh: "YA ก้าวพ้นวัย รายตอน", nameEn: "YA coming-of-age serial", taglineTh: "เสียงวัยรุ่นจริง เดิมพันหัวใจจริง — จังหวะรายตอน", type: "novel", genre: "young_adult", chapters: 20, words: 1800, structure: "thai-web-novel" },
  // ── fiction · โครงพื้นถิ่น/เอเชีย (the cultural moat) ──
  { id: "chak-wong-epic", nameTh: "มหากาพย์จักร ๆ วงศ์ ๆ", nameEn: "Chak-chak Wong-wong epic", taglineTh: "กำเนิดวิเศษ → พลัดพราก → ครองเมือง ตามโครงวีรบุรุษไทย", type: "novel", genre: "fantasy", chapters: 28, words: 2200, structure: "chak-wong" },
  { id: "folk-wonder", nameTh: "นิทานมหัศจรรย์ร่วมสมัย", nameEn: "Modern folk wonder-tale", taglineTh: "ตรรกะบุญกรรมของนิทานพื้นบ้าน เล่าในฉากปัจจุบัน", type: "novel", genre: "fantasy", chapters: 16, words: 1800, structure: "nithan" },
  { id: "jataka-frame", nameTh: "นิทานคติธรรมซ้อนกรอบ", nameEn: "Jātaka frame-tale", taglineTh: "ปัจจุบัน ⊃ อดีต ⊃ ประชุมชาดก — เรื่องสอนใจที่ปิดกรอบสวย", type: "novel", genre: "literary", chapters: 12, words: 1600, structure: "jataka" },
  { id: "quiet-literary", nameTh: "วรรณกรรมเงียบ (คิโชเท็งเค็ตสึ)", nameEn: "Quiet literary, kishōtenketsu", taglineTh: "ไม่ต้องมีคู่ปรับ — พลังอยู่ที่การพลิกมุมมอง", type: "novel", genre: "literary", chapters: 12, words: 2500, structure: "kishotenketsu" },
  // ── fiction · แนวเข้ม ──
  { id: "murder-mystery", nameTh: "สืบสวนฆาตกรรม", nameEn: "Murder mystery", taglineTh: "วางเบาะแสยุติธรรมต่อผู้อ่าน เฉลยที่ต้อง 'ย้อนดูแล้วเห็นตลอดมา'", type: "novel", genre: "mystery", chapters: 24, words: 2400, structure: "save-the-cat" },
  { id: "mini-horror", nameTh: "สยองขวัญมินิซีรีส์", nameEn: "Horror limited-series novella", taglineTh: "8 บท ขยายขอบเขตต่อบทแบบ Chernobyl — ไม่มีกลางหย่อน", type: "novel", genre: "horror", chapters: 8, words: 2800, structure: "limited-series" },
  { id: "scifi-dystopia", nameTh: "ไซไฟดิสโทเปีย", nameEn: "Sci-fi dystopia", taglineTh: "โลกพังหนึ่งระบบ ตามราคาที่มนุษย์ตัวเล็กต้องจ่าย", type: "novel", genre: "sci-fi", chapters: 26, words: 2400, structure: "save-the-cat" },
  { id: "historical-siam", nameTh: "อิงประวัติศาสตร์สยาม", nameEn: "Siamese historical", taglineTh: "โครง 5 ขั้นแบบไทย บนฉากประวัติศาสตร์ที่ค้นจริง", type: "novel", genre: "historical", chapters: 22, words: 2500, structure: "thai-plot" },
  // ── nonfiction / อื่น ๆ ──
  { id: "selfhelp-habits", nameTh: "พัฒนาตัวเอง (นิสัย/ระบบ)", nameEn: "Self-help: habits & systems", taglineTh: "หนึ่งแก่นความคิด พิสูจน์ด้วยกรณีจริง จบด้วยเครื่องมือใช้ได้", type: "nonfiction", genre: "self_help", chapters: 12, words: 3000, structure: "" },
  { id: "business-playbook", nameTh: "คู่มือธุรกิจภาคปฏิบัติ", nameEn: "Business playbook", taglineTh: "จากปัญหาจริงของคนทำงาน สู่ playbook ที่ทำตามได้", type: "nonfiction", genre: "business", chapters: 12, words: 3000, structure: "" },
  { id: "howto-money", nameTh: "การเงินส่วนบุคคล step-by-step", nameEn: "Personal finance how-to", taglineTh: "ทีละขั้น มีเช็คลิสต์ วัดผลได้ — ไม่ขายฝัน", type: "howto", genre: "finance", chapters: 14, words: 2500, structure: "" },
  { id: "kids-bedtime", nameTh: "นิทานก่อนนอน", nameEn: "Bedtime stories", taglineTh: "จังหวะคำสำหรับอ่านออกเสียง จบอบอุ่นทุกคืน", type: "kids", genre: "bedtime", chapters: 10, words: 500, structure: "" },
  { id: "memoir-family", nameTh: "บันทึกความทรงจำครอบครัว", nameEn: "Family memoir", taglineTh: "เก็บเสียงของบ้านไว้ก่อนจะเงียบ — เล่าจากความจริง", type: "memoir", genre: "family", chapters: 14, words: 2200, structure: "" },
  { id: "thai-kitchen", nameTh: "ตำรับครัวไทย", nameEn: "Thai home-kitchen cookbook", taglineTh: "สูตรทำตามได้จริง วัตถุดิบหาได้จริง เล่าที่มาพอดีคำ", type: "cookbook", genre: "thai_cuisine", chapters: 12, words: 1200, structure: "" },
];

const BY_ID: Record<string, Bootstrap> = BOOTSTRAPS.reduce(
  (m, b) => { m[b.id] = b; return m; },
  {} as Record<string, Bootstrap>
);

export function bootstrapById(id: string | undefined): Bootstrap | null {
  return id ? BY_ID[id] ?? null : null;
}

/** Deep-link query for /rush — matches the params the generator page already reads. */
export function bootstrapQuery(b: Bootstrap): string {
  const q = new URLSearchParams({
    type: b.type,
    genre: b.genre,
    lang: "th",
    chapters: String(b.chapters),
    words: String(b.words),
  });
  if (b.structure) q.set("structure", b.structure);
  return q.toString();
}
