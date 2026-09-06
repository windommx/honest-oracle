// ╔══════════════════════════════════════════════════════════════════╗
// ║  STORY STRUCTURE TEMPLATES — four classic beat sheets, Thai-first. ║
// ║  Absorbed from InkStudio Pro (whose research followed Plottr's     ║
// ║  pattern: one plot line + beats pre-placed by percentage).         ║
// ║  Pure data + two pure functions. A beat's `pct` is where it falls  ║
// ║  in the story (0–100); colIndex = round(pct/100 × (scenes−1)).      ║
// ║  These are CONVENTIONS, not measurements — a writer may ignore     ║
// ║  them; nothing here scores a manuscript against them.              ║
// ╚══════════════════════════════════════════════════════════════════╝

export interface TemplateBeat { en: string; th: string; desc: string; pct: number }
export interface StoryStructureTemplate {
  id: string; nameTh: string; nameEn: string; emoji: string;
  tagline: string; bestFor: string; sceneMap: string; beats: TemplateBeat[];
}

export const STORY_TEMPLATES: StoryStructureTemplate[] = [
  {
    id: "save-the-cat", nameTh: "โครง 15 จังหวะ", nameEn: "Save the Cat! (15 Beats)", emoji: "🐱",
    tagline: "โครงยอดนิยมที่สุดในวงการ เปิด-จบคู่กระจก", bestFor: "ทุกแนว — โรแมนซ์ สืบสวน ดราม่า",
    sceneMap: "15 ฉากขั้นต่ำ · เรื่อง 20–40 บท (จังหวะละ 1–2 บท)",
    beats: [
      { en: "Opening Image", th: "ภาพเปิดเรื่อง", desc: "โชว์โลกและตัวเอกก่อนเปลี่ยนแปลง จุดตั้งต้นที่จะกลับมาเทียบตอนจบ", pct: 0 },
      { en: "Theme Stated", th: "แทรกแนวคิดหลัก", desc: "ใครสักคนพูดบทเรียนชีวิตใส่ตัวเอก โดยเขายังไม่เข้าใจความหมาย", pct: 5 },
      { en: "Setup", th: "ปูพื้นเรื่อง", desc: "แนะนำชีวิตตัวเอก เพื่อน ศัตรู และจุดอ่อนที่ต้องถูกแก้ภายในเรื่อง", pct: 7 },
      { en: "Catalyst", th: "เหตุการณ์กระตุ้น", desc: "เหตุการณ์ฉับพลันที่สั่นคลอนชีวิตเดิม บังคับให้เรื่องเริ่มขยับ", pct: 10 },
      { en: "Debate", th: "ความลังเลใจ", desc: "ตัวเอกถามตัวเองว่าจะลุกขึ้นเปลี่ยนแปลงหรือยังอยู่ที่เดิมดี", pct: 15 },
      { en: "Break Into Two", th: "ก้าวสู่องก์สอง", desc: "ตัวเอกเลือกออกจากโซนสบายด้วยตัวเอง ก้าวเข้าสู่โลกใหม่", pct: 20 },
      { en: "B Story", th: "เส้นเรื่องรอง", desc: "เปิดเรื่องรอง (คนรัก เพื่อน เมนเทอร์) ที่จะหว่านธีมแบบจริงใจ", pct: 22 },
      { en: "Fun and Games", th: "ช่วงสนุกตามสัญญา", desc: "ช่วงเพลินที่ผู้อ่านได้อย่างที่ปกหลังสัญญาไว้ ก่อนแรงกดดันจริง", pct: 35 },
      { en: "Midpoint", th: "จุดกึ่งกลาง", desc: "ชัยชนะหรือความจริงกลางเรื่อง เปลี่ยนตัวเอกจากตอบโต้เป็นลงมือ", pct: 50 },
      { en: "Bad Guys Close In", th: "ศัตรูปิดล้อม", desc: "แรงกดดันจากศัตรูภายนอกและความขัดแย้งภายในทีมรุมเข้ามา", pct: 62 },
      { en: "All Is Lost", th: "หมดหนทาง", desc: "จุดต่ำสุดที่สุด บาดแผลใหญ่ มักมีความตายสัญลักษณ์ สิ้นหวัง", pct: 75 },
      { en: "Dark Night of the Soul", th: "ค่ำคืนมืดมน", desc: "ตัวเอกกลืนความเจ็บปวด ไตร่ตรองในความมืดก่อนหาทางออก", pct: 77 },
      { en: "Break Into Three", th: "ก้าวสู่องก์สาม", desc: "ไอเดียจากเส้นเรื่องรองจุดประกายทางออก รวมพลังวางแผนสุดท้าย", pct: 80 },
      { en: "Finale", th: "บทสรุปปฏิบัติการ", desc: "ลุยไฟนอลเผชิญหน้าศัตรู พิสูจน์ว่าตัวเอกเรียนรู้ธีมจริงแล้ว", pct: 90 },
      { en: "Final Image", th: "ภาพปิดเรื่อง", desc: "ฉากจบสะท้อนภาพเปิดอย่างชัด โชว์โลกที่เปลี่ยนไปพร้อมตัวเอก", pct: 100 },
    ],
  },
  {
    id: "heros-journey", nameTh: "การเดินทางของฮีโร่", nameEn: "Hero's Journey (Vogler 12 Stages)", emoji: "🗡️",
    tagline: "โครงสากล 12 ขั้น จากโลกธรรมดาถึงยาวิเศษ", bestFor: "แฟนตาซี ผจญภัย coming-of-age",
    sceneMap: "12 ฉากขั้นต่ำ · เรื่อง 24–36 บท (ขั้นละ 2–3 บท)",
    beats: [
      { en: "Ordinary World", th: "โลกธรรมดา", desc: "ชีวิตปกติของฮีโร่ก่อนออกเดินทาง สร้างความผูกพันกับผู้อ่าน", pct: 0 },
      { en: "Call to Adventure", th: "การเรียกเข้าสู่การผจญภัย", desc: "คำเชิญ จดหมาย หรือเหตุการณ์ที่ปลุกให้ฮีโร่ออกจากโลกเดิม", pct: 8 },
      { en: "Refusal of the Call", th: "การปฏิเสธคำเรียก", desc: "ฮีโร่กลัวหรือลังเลปฏิเสธ เพราะเห็นความเสี่ยงและข้อผูกพัน", pct: 12 },
      { en: "Meeting the Mentor", th: "พบเมนเทอร์", desc: "ผู้ชี้ทางมอบกำลังใจ ความรู้ หรือของวิเศษก่อนตัดสินใจ", pct: 18 },
      { en: "Crossing the First Threshold", th: "ข้ามเส้นขอบเขตแรก", desc: "ฮีโร่ตัดสินใจเต็มใจ ก้าวผ่านประตูเข้าสู่โลกพิเศษอย่างไม่ถอย", pct: 25 },
      { en: "Tests, Allies and Enemies", th: "บททดสอบ พันธมิตร และศัตรู", desc: "ฝึกฝนกฎของโลกใหม่ หาเพื่อนร่วมทีม เจอคู่ปรับประจำตัว", pct: 35 },
      { en: "Approach to the Inmost Cave", th: "เข้าใกล้ถ้ำในสุด", desc: "เตรียมพร้อมก่อนภารกิจใหญ่ บรรยากาศตึงเครียดสูงสุดช่วงแรก", pct: 50 },
      { en: "Ordeal", th: "บทพิสูจน์กลางเรื่อง", desc: "เผชิญศัตรูหรือความกลัวสุด ตายสัญลักษณ์แล้วเกิดใหม่ในอีกระดับ", pct: 60 },
      { en: "Reward", th: "ชิงรางวัล", desc: "ได้ของ ความจริง หรือหัวใจที่ต้องการ แต่ยังไม่ปลอดภัยเลย", pct: 70 },
      { en: "The Road Back", th: "ทางเดินกลับ", desc: "เริ่มเดินทางกลับพร้อมรางวัล ศัตรูไล่ตาม เดิมพันเพิ่มอีกขั้น", pct: 80 },
      { en: "Resurrection", th: "การฟื้นคืนชีพ", desc: "การทดสอบครั้งสุดท้าย ฮีโร่ถูกขัดเกลาจนกลายเป็นคนใหม่จริง", pct: 90 },
      { en: "Return with the Elixir", th: "กลับมาพร้อมยาวิเศษ", desc: "กลับโลกเดิมพร้อมบทเรียนหรือของล้ำค่าที่เปลี่ยนชีวิตทุกคน", pct: 100 },
    ],
  },
  {
    id: "three-act", nameTh: "สามองก์พื้นฐาน", nameEn: "Three-Act Structure", emoji: "🎭",
    tagline: "เริ่ม-ท้าทาย-จบ สัดส่วน 25/50/25 เข้าใจง่ายที่สุด", bestFor: "มือใหม่ เรื่องสั้น–กลาง ทุกแนว",
    sceneMap: "9 ฉากขั้นต่ำ · เรื่อง 12–20 บท",
    beats: [
      { en: "Hook", th: "คว้าใจตั้งแต่หน้าแรก", desc: "ฉากเปิดที่หยุดนิ้วผู้อ่าน แนะนำเสน่ห์หรือปัญหาของตัวเอก", pct: 0 },
      { en: "Inciting Incident", th: "เหตุการณ์จุดประกาย", desc: "เหตุการณ์ที่หยุดชีวิตเดิมและเผยปัญหาหลักของเรื่อง", pct: 10 },
      { en: "Plot Point One", th: "จุดหักเลี้ยวหนึ่ง", desc: "ตัวเอกตัดสินใจลุกเข้าสู่ความขัดแย้ง ปิดองก์แรกพอดี", pct: 25 },
      { en: "Rising Complications", th: "ปัญหาทบต้น", desc: "อุปสรรคไล่ลำดับ เส้นเรื่องซับซ้อน การเดิมพันสูงขึ้นเรื่อยๆ", pct: 35 },
      { en: "Midpoint", th: "จุดกึ่งกลาง", desc: "การพลิกกลางเรื่อง ตัวเอกเปลี่ยนจากรับมือเป็นลงมือเอง", pct: 50 },
      { en: "Crisis", th: "วิกฤต", desc: "แพ้ยับ ทางเลือกแคบลง ความเสี่ยงพุ่งสูงสุดก่อนองก์จบ", pct: 60 },
      { en: "Plot Point Two", th: "จุดหักเลี้ยวสอง", desc: "ความจริงหรือเหตุการณ์ใหม่ผลักเรื่องเข้าสู่องก์สุดท้าย", pct: 70 },
      { en: "Climax", th: "ฉากไคลแมกซ์", desc: "การเผชิญหน้าสุดยอด ตัวเอกแก้ปัญหาหลักด้วยตัวเอง", pct: 85 },
      { en: "Resolution", th: "บทสรุป", desc: "ผลลัพธ์หลังไคลแมกซ์ โลกใหม่ของตัวเอก ปิดทุกเส้นเรื่อง", pct: 100 },
    ],
  },
  {
    id: "kishotenketsu", nameTh: "เปิด-รับ-พลิก-สรุป", nameEn: "Kishōtenketsu (เอเชีย 4 องก์)", emoji: "🌸",
    tagline: "โครงเอเชียที่ไม่ต้องมีศัตรู เน้นอารมณ์และพลิกความคิด", bestFor: "สไลซ์ออฟไลฟ์ โรแมนซ์จบใส วรรณกรรม",
    sceneMap: "4 ฉากขั้นต่ำ · เรื่องสั้นหรือ 8–12 บท (องก์ละ 2–3 บท)",
    beats: [
      { en: "Ki (Introduction)", th: "การเปิด (Ki)", desc: "แนะนำตัวละคร สถานที่ บรรยากาศอย่างเนิบช้า ยังไม่มีความขัดแย้ง", pct: 0 },
      { en: "Shō (Development)", th: "การรับต่อ (Shō)", desc: "ขยายความคุ้นเคย พาผู้อ่านซึมชีวิตประจำวันของตัวละครลึกขึ้น", pct: 25 },
      { en: "Ten (Twist)", th: "การพลิก (Ten)", desc: "องค์ประกอบแปลกใหม่เข้ามา ทำให้มองทุกอย่างเดิมด้วยสายตาใหม่", pct: 55 },
      { en: "Ketsu (Conclusion)", th: "การสรุป (Ketsu)", desc: "ร้อยเรื่องทั้งหมดเข้าด้วยกัน ผู้อ่านมองย้อนเห็นความหมายใหม่", pct: 85 },
    ],
  },
];

export function templateById(id: string): StoryStructureTemplate | undefined {
  return STORY_TEMPLATES.find((t) => t.id === id);
}

/** Column (scene) index for each beat given a scene count — clamped, never past the last. */
export function beatColIndexes(template: StoryStructureTemplate, sceneCount?: number): number[] {
  const n = Math.max(template.beats.length, sceneCount ?? template.beats.length);
  const last = n - 1;
  return template.beats.map((b) => Math.min(last, Math.max(0, Math.round((b.pct / 100) * last))));
}

/** The template as an outline the prompt tool's `outline` field accepts: one numbered
 *  beat per line with its position and a one-line brief. */
export function templateToOutline(template: StoryStructureTemplate): string {
  return template.beats.map((b, i) => `${i + 1}. ${b.th} (${b.pct}%) — ${b.desc}`).join("\n");
}
