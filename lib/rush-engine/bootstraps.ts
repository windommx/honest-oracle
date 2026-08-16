// ╔══════════════════════════════════════════════════════════════════╗
// ║  BOOTSTRAPS — 70 one-click starting points ("แม่แบบตั้งต้น").      ║
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
  // ── fleet batch (50 agents, 2026-08) · โรมานซ์ขยาย ──
  { id: "rom-enemies", nameTh: "คู่กัดหัวใจ: ศัตรูสู่คนรัก", nameEn: "Enemies to Lovers TH", taglineTh: "โรมานซ์ไทยร่วมสมัยสายคู่กัด — วางแรงเสียดทานให้มีเหตุผล ค่อยๆ ละลายกำแพงทีละบท จนคำสารภาพรักฟังขึ้นจริง", type: "novel", genre: "romance", chapters: 50, words: 1800, structure: "thai-web-novel" },
  { id: "rom-contract", nameTh: "วิวาห์กระดาษ รักตัวจริง", nameEn: "Contract Vows", taglineTh: "แม่แบบรักจากสัญญาแต่งงาน เน้นเงื่อนไขผูกมัดที่ค่อย ๆ กลายเป็นความรู้สึกจริง พร้อมจังหวะเปิด-ปิดตอนแบบนิยายรายตอนไทย", type: "novel", genre: "romance", chapters: 45, words: 1800, structure: "thai-web-novel" },
  { id: "rom-second", nameTh: "รักครั้งที่สอง เมื่อเราพบกันอีกครั้ง", nameEn: "Second Chance Reunion", taglineTh: "โรมานซ์เต็มเล่มว่าด้วยคนเคยรักที่กลับมาเจอกัน — เด่นที่แผลเก่า เหตุผลที่เคยแยกทาง และการให้อภัยที่ค่อยๆ คลี่ทีละบท", type: "novel", genre: "romance", chapters: 30, words: 2800, structure: "save-the-cat" },
  { id: "rom-gl", nameTh: "รักเธอรายตอน (GL)", nameEn: "GL Serial Romance", taglineTh: "นิยายหญิงรักหญิงแบบรายตอน เน้นเคมีค่อยก่อตัว จบทุกบทด้วยตะขอเกี่ยวใจให้อยากอ่านตอนต่อ", type: "novel", genre: "romance", chapters: 60, words: 1800, structure: "thai-web-novel" },
  { id: "rom-agegap", nameTh: "รักต่างวัย หัวใจไม่นับเลข", nameEn: "Age-Gap Romance", taglineTh: "เขียนรักต่างวัยแบบรายตอน เน้นแรงเสียดทานจากช่องว่างวัย ครอบครัว และสายตาสังคม ให้คลี่คลายอย่างสมเหตุผล ไม่ฉาบฉวย", type: "novel", genre: "romance", chapters: 45, words: 1800, structure: "thai-web-novel" },
  { id: "rom-showbiz", nameTh: "รักหลังม่านสปอตไลต์", nameEn: "Backstage Hearts", taglineTh: "โรมานซ์วงการบันเทิง/ไอดอลแบบรายตอน เน้นความตึงระหว่างภาพลักษณ์สาธารณะกับใจจริง — จบทุกตอนด้วยตะขอความสัมพันธ์", type: "novel", genre: "romance", chapters: 40, words: 2200, structure: "thai-web-novel" },
  { id: "rom-medical", nameTh: "หัวใจเวรดึก", nameEn: "Night Shift Hearts", taglineTh: "รักหมอ-พยาบาลที่สมจริงเรื่องงาน: เวรดึก เคสคนไข้ และจรรยาบรรณเป็นตัวขับความสัมพันธ์ ไม่ใช่ฉากหลังประดับ", type: "novel", genre: "romance", chapters: 40, words: 2200, structure: "thai-web-novel" },
  { id: "rom-dark", nameTh: "รักต้องห้ามเงามาเฟีย", nameEn: "Mafia Dark Romance", taglineTh: "แม่แบบรักดาร์กสายมาเฟียแบบรายตอน เน้นสร้างเสน่ห์ตัวร้าย แรงดึงดูดอันตราย และเส้นความยินยอมที่เขียนอย่างมีชั้นเชิงสำหรับผู้อ่านผู้ใหญ่", type: "novel", genre: "romance", chapters: 60, words: 1800, structure: "thai-web-novel" },
  { id: "rom-healing", nameTh: "คาเฟ่ปลายซอย รักช้าๆ เยียวยาใจ", nameEn: "Slow Cafe Healing", taglineTh: "โรมานซ์จังหวะช้าในคาเฟ่เมืองเล็ก เน้นบทสนทนาอบอุ่น รายละเอียดชีวิตประจำวัน และการค่อยๆ คลี่ปมใจตัวละครทีละบท", type: "novel", genre: "romance", chapters: 24, words: 1800, structure: "kishotenketsu" },
  // ── fleet batch · แฟนตาซี ──
  { id: "fan-romantasy", nameTh: "รักต่างภพ บัลลังก์มนตรา", nameEn: "Romantasy Throne", taglineTh: "สร้างโลกแฟนตาซีที่กติกาเวทชัด แล้วให้เส้นรักกับเส้นอำนาจบีบกันจนตัวละครต้องเลือก", type: "novel", genre: "fantasy", chapters: 40, words: 2500, structure: "save-the-cat" },
  { id: "fan-cultivation", nameTh: "ก้าวข้ามขั้นเซียน", nameEn: "Ascension Path", taglineTh: "นิยายบำเพ็ญเซียนสายจีนแบบรายตอน: วางลำดับขั้นพลังชัด เปิดสามบทแรกให้ติดตะขอ และคุมจังหวะทะลวงด่านให้สมเหตุผลทุกครั้ง", type: "novel", genre: "fantasy", chapters: 60, words: 1800, structure: "golden-three" },
  { id: "fan-isekai", nameTh: "ทะลุมิติรายตอน", nameEn: "Isekai Serial", taglineTh: "นิยายเกิดใหม่ต่างโลกแบบรายตอน เน้นสร้างโลกทีละชั้นและตะขอท้ายบทให้คนอ่านตามต่อ", type: "novel", genre: "fantasy", chapters: 60, words: 1800, structure: "thai-web-novel" },
  { id: "fan-urban-bkk", nameTh: "มนตร์ใต้กรุง", nameEn: "Bangkok Undercity", taglineTh: "แม่แบบ urban fantasy รายตอน: ซ่อนโลกเวทมนตร์ไว้ใต้กรุงเทพจริง — ผูกสถานที่ ผี-เทพ-ของขลังท้องถิ่นเข้ากับปมตัวละคร ให้ทุกตอนจบด้วยเงื่อนคาใจ", type: "novel", genre: "fantasy", chapters: 60, words: 1800, structure: "thai-web-novel" },
  { id: "fan-litrpg", nameTh: "ระบบตื่นแล้ว: เลเวลลุยด่าน", nameEn: "System Awakened", taglineTh: "แม่แบบ LitRPG แฟนตาซี: วางหน้าต่างสถานะ เควสต์ และเส้นเลเวลให้โตพร้อมเดิมพันของตัวละคร ไม่ใช่แค่ตัวเลขพุ่ง", type: "novel", genre: "fantasy", chapters: 60, words: 2000, structure: "golden-three" },
  { id: "fan-dark", nameTh: "แลกวิญญาณ: ดาร์กแฟนตาซีราคาของพลัง", nameEn: "Cost of Power", taglineTh: "แม่แบบดาร์กแฟนตาซีรายตอน ที่ทุกครั้งตัวเอกใช้พลัง ต้องจ่ายด้วยชิ้นส่วนความเป็นคน—ออกแบบระบบราคา จุดเสื่อม และทางเลือกที่เจ็บจริงในทุกบท", type: "novel", genre: "fantasy", chapters: 60, words: 1800, structure: "thai-web-novel" },
  // ── fleet batch · ระทึกขวัญ/อาชญากรรม ──
  { id: "thr-psych", nameTh: "เงาในกระจก: ระทึกจิตผู้เล่าเชื่อไม่ได้", nameEn: "Unreliable Mind Thriller", taglineTh: "แม่แบบระทึกจิตวิทยาแบบผู้เล่าเชื่อถือไม่ได้ — ฝึกวางเบาะแสสองชั้น บิดมุมมอง และหักมุมที่ยุติธรรมต่อคนอ่านเมื่อย้อนกลับไปอ่านซ้ำ", type: "novel", genre: "thriller", chapters: 32, words: 2500, structure: "save-the-cat" },
  { id: "thr-scam", nameTh: "เครือข่ายล่าเหยื่อ: ทริลเลอร์คอลเซ็นเตอร์", nameEn: "Scam Network Thriller", taglineTh: "ทริลเลอร์อาชญากรรมการเงินยุคใหม่ เกาะกลไกแก๊งคอลเซ็นเตอร์จริง เน้นความแม่นของรายละเอียดกลโกงและจังหวะไล่ล่าที่ตึงทุกตอน", type: "novel", genre: "thriller", chapters: 40, words: 1800, structure: "thai-web-novel" },
  { id: "thr-legal", nameTh: "สำนวนที่ความจริงแพ้", nameEn: "Verdict Against Truth", taglineTh: "แม่แบบ legal thriller เต็มเล่ม: เดินเรื่องด้วยสำนวนคดี พยานหลักฐาน และเกมในห้องพิจารณา ที่ความจริงกับผลคดีไม่ใช่เรื่องเดียวกัน", type: "novel", genre: "thriller", chapters: 30, words: 3500, structure: "save-the-cat" },
  { id: "thr-spy", nameTh: "เงาปฏิบัติการอุษาคเนย์", nameEn: "Mekong Shadow Ops", taglineTh: "แม่แบบนิยายสายลับฉากอาเซียน เน้นงานข่าวกรองสมจริง เกมหักหลังหลายชั้น และเดดไลน์ที่บีบตัวละครทุกบท", type: "novel", genre: "thriller", chapters: 32, words: 2800, structure: "save-the-cat" },
  // ── fleet batch · สยองขวัญ ──
  { id: "hor-thai-ghost", nameTh: "ผีบ้านผีเรือน: สยองจากความเชื่อจริง", nameEn: "Folk Ghost Horror", taglineTh: "นิยายสยองที่ยืนบนความเชื่อผีท้องถิ่นจริง — พิธี ข้อห้าม และบุญกรรมเป็นกลไกความกลัว ไม่ใช่แค่ฉากหลอก", type: "novel", genre: "horror", chapters: 28, words: 2500, structure: "nithan" },
  { id: "hor-psych", nameTh: "หลอนเงียบ", nameEn: "Quiet Dread", taglineTh: "นิยายสยองจิตวิทยาเต็มเล่ม สร้างความหลอนจากการรับรู้ที่บิดเบี้ยวและผู้เล่าที่เชื่อไม่ได้ ไม่พึ่ง jumpscare", type: "novel", genre: "horror", chapters: 24, words: 2800, structure: "kishotenketsu" },
  { id: "hor-apoc", nameTh: "ซอมบี้เมืองไทย วันที่โลกหยุดหมุน", nameEn: "Thai Zombie Apocalypse", taglineTh: "นิยายสยองรายตอนโลกล่มสลายในฉากไทยแท้ — ตลาดสด วัด หมู่บ้าน — เน้นความกลัวจากคนเป็นพอๆ กับซอมบี้ และจบทุกตอนด้วยเงื่อนความอยากรู้", type: "novel", genre: "horror", chapters: 60, words: 1800, structure: "thai-web-novel" },
  // ── fleet batch · ไซไฟ ──
  { id: "sf-ai", nameTh: "พรมแดนสำนึก", nameEn: "Sentience Line", taglineTh: "นิยายไซไฟถามเส้นแบ่งคน/เครื่อง ผ่านสายสัมพันธ์คนกับ AI ที่ค่อยๆ เผยสำนึก — เน้นบทสนทนาเชิงปรัชญาที่จับต้องได้และปมจริยธรรมไม่มีคำตอบสำเร็จรูป", type: "novel", genre: "sci-fi", chapters: 12, words: 3500, structure: "limited-series" },
  { id: "sf-space", nameTh: "มหากาพย์ดวงดาว", nameEn: "Star Saga", taglineTh: "วางมหากาพย์อวกาศเต็มเล่ม: สร้างจักรวาลการเมืองหลายดวงดาว กองยาน และชะตาตัวละครที่ผูกกับสงครามใหญ่ โดยคุมเส้นเรื่องหลักให้ไม่หลงทางในฉากกว้าง", type: "novel", genre: "sci-fi", chapters: 40, words: 2800, structure: "save-the-cat" },
  { id: "sf-timeloop", nameTh: "วันเดิมซ้ำจนกว่าจะเข้าใจ", nameEn: "Loop Until Understood", taglineTh: "นิยายไซไฟ time loop ที่แต่ละรอบไม่ใช่การแก้เกม แต่คือการเห็นวันเดิมลึกขึ้นทีละชั้น — โครงต่อบทช่วยคุมข้อมูลใหม่ต่อรอบไม่ให้ซ้ำจนเบื่อ", type: "novel", genre: "sci-fi", chapters: 14, words: 3500, structure: "limited-series" },
  // ── fleet batch · อิงประวัติศาสตร์ / ผจญภัย / ปริศนา ──
  { id: "his-rattanakosin", nameTh: "แผ่นดินต้นกรุง", nameEn: "Early Bangkok Chronicle", taglineTh: "นิยายพีเรียดรัตนโกสินทร์ตอนต้นผ่านสายตาสามัญชน เน้นค้นคว้ารายละเอียดยุคสมัยให้สมจริงและถักชะตาคนเล็กเข้ากับเหตุการณ์บ้านเมือง", type: "novel", genre: "historical", chapters: 40, words: 2500, structure: "thai-plot" },
  { id: "his-ayutthaya", nameTh: "ฝุ่นใต้ตีนช้าง: สามัญชนกรุงศรีฯ", nameEn: "Dust Beneath the War Elephants", taglineTh: "นิยายอิงประวัติศาสตร์อยุธยาผ่านสายตาไพร่ แม่ค้า ทหารเลว — เล่าสงครามใหญ่จากมุมคนไร้ชื่อในพงศาวดาร เน้นรายละเอียดชีวิตประจำวันและราคาที่คนตัวเล็กต้องจ่าย", type: "novel", genre: "historical", chapters: 36, words: 2800, structure: "kishotenketsu" },
  { id: "his-lanna", nameTh: "พงศาวดารเล่าขาน ล้านนา", nameEn: "Lanna Chronicle Weave", taglineTh: "นิยายอิงประวัติศาสตร์ล้านนา ถักพงศาวดารเข้ากับตำนานมุขปาฐะ — เล่าเหตุการณ์จริงผ่านสายตาคนเล็กในหน้าประวัติศาสตร์ โดยแยกชัดว่าส่วนใดคือหลักฐาน ส่วนใดคือเรื่องเล่า", type: "novel", genre: "historical", chapters: 28, words: 3200, structure: "kishotenketsu" },
  { id: "adv-survival", nameTh: "ป่าไม่ปรานี", nameEn: "Against the Wild", taglineTh: "นิยายเอาชีวิตรอดที่ธรรมชาติคือคู่ปรับ — วัดตัวละครด้วยการตัดสินใจใต้แรงกดดัน ทรัพยากรร่อยหรอ และราคาที่ต้องจ่ายจริงทุกบท", type: "novel", genre: "adventure", chapters: 40, words: 2200, structure: "thai-web-novel" },
  { id: "mys-cozy", nameTh: "คดีลับย่านเก่า", nameEn: "Old Town Cozy Case", taglineTh: "โคซี่มิสเตอรีย่านเก่ากรุงเทพ นักสืบสมัครเล่นไขคดีด้วยความรู้จักคนในชุมชน — เบาะแสแฟร์ต่อผู้อ่าน อบอุ่นไม่พึ่งความรุนแรง", type: "novel", genre: "mystery", chapters: 24, words: 2500, structure: "save-the-cat" },
  // ── fleet batch · YA / วรรณกรรม ──
  { id: "ya-school", nameTh: "ปริศนาหลังคาบเรียน", nameEn: "After-Class Mystery", taglineTh: "นิยาย YA สืบสวนในรั้วมัธยม: วางเงื่อนงำเป็นราย บท เล่นแฟร์กับคนอ่าน และให้คดีสะท้อนแผลใจวัยรุ่นของตัวละคร", type: "novel", genre: "young_adult", chapters: 30, words: 1800, structure: "thai-web-novel" },
  { id: "ya-sports", nameTh: "คัมแบ็กนัดสุดท้าย", nameEn: "Last Season Comeback", taglineTh: "นิยายกีฬาวัยรุ่นเต็มเล่ม: ทีมที่แพ้ยับ เพื่อนที่ร้าว และเส้นทางกลับสู่สนาม — เน้นอาร์กใจตัวละครคู่กับจังหวะแมตช์แข่ง", type: "novel", genre: "young_adult", chapters: 30, words: 2500, structure: "save-the-cat" },
  { id: "lit-linked", nameTh: "เสียงจากซอยเดียวกัน", nameEn: "One Soi, Many Voices", taglineTh: "เรื่องสั้นร้อยเรียง: แต่ละบทคือเสียงของคนหนึ่งในชุมชนเดียวกัน จบในตัวแต่สานเป็นภาพใหญ่ ฝึกสลับมุมมองและวางรายละเอียดร่วมให้เชื่อมกันเอง", type: "novel", genre: "literary", chapters: 12, words: 4500, structure: "kishotenketsu" },
  // ── fleet batch · เด็ก / กวีนิพนธ์ ──
  { id: "kid-bilingual", nameTh: "นิทานสองภาษา ไทย-อังกฤษ", nameEn: "Bilingual Tales TH-EN", taglineTh: "นิทานสั้นเล่าคู่สองภาษา ประโยคไทย-อังกฤษเทียบบรรทัดต่อบรรทัด คำศัพท์ซ้ำจังหวะให้เด็กจำได้เอง", type: "kids", genre: "bilingual_kids", chapters: 10, words: 600, structure: "" },
  { id: "kid-midgrade", nameTh: "แผนที่ลับนักผจญภัยรุ่นจิ๋ว", nameEn: "Junior Quest", taglineTh: "ผจญภัยเด็ก 8-12 ปี ตอนสั้นจบเป็นด่าน มีปริศนาให้เด็กแก้ไปพร้อมตัวละคร และเพื่อนคือพลังหลักของเรื่อง", type: "kids", genre: "middle_grade", chapters: 20, words: 1500, structure: "" },
  { id: "kid-science", nameTh: "ห้องทดลองจิ๋ว สนุกวิทย์รอบตัว", nameEn: "Tiny Lab Wonders", taglineTh: "อธิบายวิทยาศาสตร์รอบตัวเป็นตอนสั้น เริ่มจากคำถาม \"ทำไม\" ของเด็ก จบด้วยกิจกรรมทดลองง่าย ๆ ที่ทำได้จริงที่บ้าน", type: "kids", genre: "educational", chapters: 20, words: 800, structure: "" },
  { id: "kid-moral", nameTh: "นิทานคิดเอง", nameEn: "Show-Don't-Preach Tales", taglineTh: "นิทานคุณธรรมที่ให้เด็กเห็นผลของการกระทำผ่านเรื่อง แล้วสรุปบทเรียนด้วยตัวเอง — ไม่มีประโยคเทศนาท้ายเรื่อง", type: "kids", genre: "moral_stories", chapters: 12, words: 800, structure: "" },
  { id: "poe-prose", nameTh: "เมืองในบรรทัดเดียว", nameEn: "City in a Single Line", taglineTh: "ร้อยแก้วกวีจับภาพเมืองไทยร่วมสมัย — ตลาดเช้า รถไฟฟ้า ตรอกเก่า — ฝึกสายตาเก็บรายละเอียดเล็กให้กลายเป็นภาพและอารมณ์ในย่อหน้าสั้น", type: "poetry", genre: "prose_poetry", chapters: 40, words: 350, structure: "" },
  { id: "poe-confessional", nameTh: "เปลือยเสียง: กวีสารภาพ", nameEn: "Bare Voice Confessional", taglineTh: "รวมบทกวีสารภาพเสียงแรกบุคคล — ฝึกเปลือยความจริงส่วนตัวด้วยภาพคมและถ้อยคำไม่อ้อม โดยเรียงร้อยเป็นเล่มที่มีเส้นอารมณ์ต่อเนื่อง", type: "poetry", genre: "confessional", chapters: 40, words: 250, structure: "" },
  // ── fleet batch · non-fiction / how-to / อื่น ๆ ──
  { id: "nf-psych", nameTh: "สมองเบื้องหลัง: จิตวิทยาจากแล็บสู่ชีวิต", nameEn: "Pop Psych Lab", taglineTh: "เล่างานวิจัยจิตวิทยาจริงทีละบท อ้างที่มาได้ ระบุข้อจำกัดของหลักฐาน ไม่เกินจากที่ข้อมูลรองรับ", type: "nonfiction", genre: "psychology", chapters: 14, words: 3000, structure: "" },
  { id: "nf-sleep", nameTh: "หลับดี มีแรง: คู่มือการนอนอิงหลักฐาน", nameEn: "Evidence-Based Sleep & Energy", taglineTh: "เล่มสุขภาพการนอนที่แยก \"งานวิจัยว่าอย่างไร\" ออกจากความเชื่อ พร้อมวิธีปรับพฤติกรรมทีละขั้นและบอกข้อจำกัดของหลักฐานตรงไปตรงมา", type: "nonfiction", genre: "health", chapters: 12, words: 2500, structure: "" },
  { id: "nf-funhistory", nameTh: "เกร็ดที่ตำราไม่เล่า", nameEn: "Untold History Bites", taglineTh: "เล่าประวัติศาสตร์แบบชวนคุย บทละหนึ่งเกร็ด อ้างที่มาชัด แยกข้อเท็จจริงออกจากตำนาน", type: "nonfiction", genre: "history", chapters: 24, words: 1800, structure: "" },
  { id: "nf-biography", nameTh: "คนที่โลกลืม", nameEn: "Forgotten Lives", taglineTh: "ชีวประวัติบุคคลที่ประวัติศาสตร์มองข้าม เล่าจากหลักฐานจริง แยกข้อเท็จจริงออกจากคำเล่าลือ และซื่อสัตย์กับช่องว่างที่ไม่มีใครรู้", type: "nonfiction", genre: "biography", chapters: 14, words: 3500, structure: "" },
  { id: "nf-stoic", nameTh: "ใจนิ่งในโลกวุ่น", nameEn: "Stoic Calm", taglineTh: "แปลงหลักสโตอิกและปรัชญาตะวันออกเป็นบทฝึกสั้น ๆ ใช้ได้จริงในชีวิตประจำวัน โดยไม่บิดเบือนต้นตำรับ", type: "nonfiction", genre: "philosophy", chapters: 24, words: 2500, structure: "" },
  { id: "nf-thaisociety", nameTh: "อ่านสังคมไทยด้วยข้อมูลและเรื่องเล่า", nameEn: "Thai Society in Data & Stories", taglineTh: "สารคดีสังคมศาสตร์ที่จับคู่ชุดข้อมูลกับเรื่องเล่าคนจริง แต่ละบทตั้งคำถามหนึ่งข้อเกี่ยวกับสังคมไทยร่วมสมัย แล้วตอบอย่างระบุแหล่งอ้างอิงและข้อจำกัดของข้อมูลตรงไปตรงมา", type: "nonfiction", genre: "social_science", chapters: 12, words: 4500, structure: "" },
  { id: "how-career", nameTh: "คู่มือเปลี่ยนสายงานทีละก้าว", nameEn: "Career Switch Playbook", taglineTh: "how-to สมัครงาน/ย้ายสายแบบ step-by-step: เช็กลิสต์ เวิร์กชีต และตัวอย่างเรซูเม่-สัมภาษณ์ที่ทำตามได้จริง โดยไม่สัญญาผลลัพธ์เกินจริง", type: "howto", genre: "career", chapters: 12, words: 2500, structure: "" },
  { id: "how-fitness", nameTh: "ฟิตหุ่นที่บ้าน ไม่ง้อยิม", nameEn: "Home Fit No Gym", taglineTh: "คู่มือออกกำลังกายด้วยน้ำหนักตัวในพื้นที่จำกัด — สอนท่าเป็นขั้นตอน จัดตารางฝึกตามระดับ และวิธีปรับความหนักโดยไม่ต้องมีอุปกรณ์", type: "howto", genre: "fitness", chapters: 14, words: 2500, structure: "" },
  { id: "how-crafts", nameTh: "งานมือเรา สู่ร้านออนไลน์", nameEn: "Craft to Shop", taglineTh: "คู่มือพาคนทำงานฝีมือเปิดร้านออนไลน์ทีละขั้น ตั้งแต่คิดต้นทุนชิ้นงาน ถ่ายรูปสินค้า จนถึงแพ็กส่งและดูแลลูกค้าซ้ำ", type: "howto", genre: "crafts", chapters: 14, words: 2500, structure: "" },
  { id: "ckb-baking", nameTh: "อบขนมจากครัวบ้าน เริ่มจากศูนย์", nameEn: "Home Bakery from Zero", taglineTh: "คู่มืออบขนมสำหรับมือใหม่ครัวบ้าน: สูตรทีละขั้น เข้าใจหลักการ วัตถุดิบหาได้ในไทย และวิธีแก้เมื่อขนมพลาด", type: "cookbook", genre: "baking", chapters: 14, words: 1800, structure: "" },
  { id: "mem-solotravel", nameTh: "เดินทางคนเดียว ทางกลับเข้าใจตัว", nameEn: "Solo Journey Memoir", taglineTh: "บันทึกเที่ยวคนเดียวที่แต่ละเมืองคือกระจก — ผูกฉากข้างนอกเข้ากับคลื่นข้างในทีละบท ด้วยรายละเอียดสัมผัสจริง ไม่โรแมนติไซส์ความเหงา", type: "memoir", genre: "travel", chapters: 18, words: 2500, structure: "" },
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
