// ╔══════════════════════════════════════════════════════════════════╗
// ║  EVIDENCE — the intervention catalog, and the grade behind each.  ║
// ║                                                                    ║
// ║  This is the file the whole "เชิงหลักฐาน / evidence-based" claim   ║
// ║  rests on, so it is the file most able to make the product a lie.  ║
// ║  Three rules hold it honest:                                       ║
// ║                                                                    ║
// ║  1. EVERY intervention carries ≥1 citation. Enforced by a test —   ║
// ║     an unsourced recommendation fails the build, it does not ship  ║
// ║     with a TODO.                                                   ║
// ║  2. The GRADE IS DEFINED BY THE EVIDENCE TYPE, not by how much we  ║
// ║     like the intervention. `EVIDENCE_GRADES` states what each      ║
// ║     grade requires, and a test checks that the entries match.      ║
// ║     Binaural beats sit at "emerging" even though they are the      ║
// ║     easiest thing for an app to generate — precisely because the   ║
// ║     grade is not ours to award.                                    ║
// ║  3. Where we could not verify an exact quantity, `effect` is null  ║
// ║     and the finding is stated qualitatively. Invented precision    ║
// ║     ("36 นาที ดีกว่า 12 นาที") is worse than no number: it borrows ║
// ║     the authority of measurement without doing any.                ║
// ║                                                                    ║
// ║  ⚠ PROVENANCE. This catalog is a summary compiled by the authors   ║
// ║  of this software from the publications named — it is not written  ║
// ║  or endorsed by the cited investigators, and figures are           ║
// ║  transcribed from published abstracts. Verify against the primary  ║
// ║  source before any clinical use. VERIFICATION_NOTE says this in    ║
// ║  the UI too; it is not a footnote we hid in a comment.             ║
// ╚══════════════════════════════════════════════════════════════════╝

import type { EvidenceGrade, Intervention } from "./types";

export const VERIFICATION_NOTE =
  "รายการนี้เป็นการสรุปงานวิจัยโดยผู้พัฒนาแพลตฟอร์ม ไม่ใช่ข้อความจากผู้วิจัยต้นทาง " +
  "ตัวเลขคัดลอกมาจากบทคัดย่อของงานที่อ้างอิง — โปรดตรวจสอบกับต้นฉบับก่อนนำไปใช้ทางคลินิก " +
  "และแพลตฟอร์มนี้ไม่ใช่การรักษา ไม่ใช่การวินิจฉัย และไม่ทดแทนผู้ให้บริการสุขภาพ";

/** What each grade REQUIRES. The grade is a claim about the evidence base's shape,
 *  so it is defined here in terms a reader can check against the citations. */
export const EVIDENCE_GRADES: Record<EvidenceGrade, { th: string; stars: number; requiresTh: string }> = {
  strong: {
    th: "หลักฐานแข็งแรง",
    stars: 5,
    requiresTh: "มี systematic review หรือ meta-analysis ของ RCT หลายสิบชิ้น ผลไปในทางเดียวกัน",
  },
  good: {
    th: "หลักฐานดี",
    stars: 4,
    requiresTh: "มี meta-analysis หรือ RCT ขนาดใหญ่ที่ออกแบบดี แต่ยังมีข้อจำกัดเรื่องความหลากหลายของผล",
  },
  moderate: {
    th: "หลักฐานปานกลาง",
    stars: 3,
    requiresTh: "มี RCT รองรับ แต่จำนวนน้อย กลุ่มตัวอย่างเล็ก หรือความเชื่อมั่นของหลักฐานอยู่ระดับต่ำ–ปานกลาง",
  },
  emerging: {
    th: "หลักฐานเบื้องต้น",
    stars: 2,
    requiresTh: "ผลยังไม่สอดคล้องกัน งานวิจัยเล็ก หรือเป็นการศึกษาเชิงสังเกตที่บอกความสัมพันธ์ ไม่ใช่สาเหตุ",
  },
};

/** Grades in the order the UI shows them, strongest first. */
export const GRADE_ORDER: EvidenceGrade[] = ["strong", "good", "moderate", "emerging"];

export const INTERVENTIONS: Intervention[] = [
  {
    id: "music-listening",
    th: "ดนตรีบำบัด / การฟังดนตรี",
    en: "Music therapy & music listening",
    grade: "strong",
    summaryTh:
      "ฟังดนตรีอย่างมีโครงสร้าง หรือทำดนตรีบำบัดกับนักดนตรีบำบัดวิชาชีพ เพื่อลดความวิตกกังวลและความเครียด",
    citations: [
      {
        authors: "Bradt J, Dileo C, Myers-Coffman K, Biondo J",
        year: 2021,
        title: "Music interventions for improving psychological and physical outcomes in people with cancer",
        venue: "Cochrane Database of Systematic Reviews, Issue 10",
        pooled: { trials: 81, participants: 5576 },
        // Cochrane reported the anxiety effect on the STAI. We quote the metric and
        // the review, and do NOT attach a CI we have not checked line-by-line.
        effect: { metric: "mean difference (STAI)", value: -7.73, unit: "STAI units" },
      },
      {
        authors: "Jespersen KV, Pando-Naude V, Koenig J, Jennum P, Vuust P",
        year: 2022,
        title: "Music for insomnia in adults",
        venue: "Cochrane Database of Systematic Reviews",
        // Low-certainty evidence: stated qualitatively rather than given a number.
        effect: null,
      },
    ],
    dose: {
      minutesPerSession: [20, 40],
      sessionsPerWeek: 7,
      weeksToEffect: 4,
      note: "ช่วงเวลาที่งานวิจัยส่วนใหญ่ใช้ต่อครั้ง — ไม่ใช่ขนาดยาที่พิสูจน์แล้วว่าดีที่สุด",
    },
    costThb: [0, 0],
    harms: [],
    harmsNote: "ไม่พบรายงานผลข้างเคียงร้ายแรงในงานที่อ้างอิง — ไม่เท่ากับว่าไม่มี ระวังระดับเสียงที่ดังเกินไป",
    limitationTh:
      "หลักฐานที่แข็งแรงที่สุดมาจากการฟัง 'ดนตรีที่ผู้ฟังเลือกเอง/ชอบ' และจากดนตรีบำบัดที่มีนักวิชาชีพนำ — " +
      "เสียงที่แอปนี้สร้างขึ้นเองไม่ใช่สิ่งเดียวกัน และไม่ได้ถูกทดสอบในงานวิจัยเหล่านั้น",
    selfAdministered: true,
  },
  {
    id: "cyclic-sighing",
    th: "การหายใจแบบ Cyclic Sighing",
    en: "Cyclic sighing (breathwork)",
    grade: "good",
    summaryTh: "หายใจเข้าสองจังหวะแล้วหายใจออกยาว วันละ 5 นาที — เน้นให้ช่วงหายใจออกยาวกว่าหายใจเข้า",
    citations: [
      {
        authors: "Balban MY, Neri E, Kogon MM, Weed L, Nouriani B, Jo B, Holl G, Zeitzer JM, Spiegel D, Huberman AD",
        year: 2023,
        title: "Brief structured respiration practices enhance mood and reduce physiological arousal",
        venue: "Cell Reports Medicine 4(1):100895",
        pooled: { participants: 108 },
        // The trial's headline was a between-arm ranking, not a single pooled ES.
        effect: null,
      },
    ],
    dose: { minutesPerSession: [5, 5], sessionsPerWeek: 7, weeksToEffect: 4, note: "โปรโตคอลในงานวิจัยคือ 5 นาที/วัน นาน 28 วัน" },
    costThb: [0, 0],
    harms: ["เวียนหัวถ้าหายใจเร็วเกินไป"],
    harmsNote: "หยุดทันทีถ้ารู้สึกวิงเวียน — และปรึกษาแพทย์ก่อน ถ้ามีโรคหัวใจ โรคปอด หรือกำลังตั้งครรภ์",
    limitationTh: "เป็น RCT เดี่ยว กลุ่มตัวอย่าง 108 คน ยังไม่มี meta-analysis รองรับ",
    selfAdministered: true,
  },
  {
    id: "cbt",
    th: "CBT — การบำบัดความคิดและพฤติกรรม",
    en: "Cognitive behavioural therapy",
    grade: "strong",
    summaryTh: "การบำบัดแบบมีโครงสร้างกับนักจิตวิทยา/จิตแพทย์ โดยทั่วไป 8–16 ครั้ง",
    citations: [
      {
        authors: "Hofmann SG, Smits JAJ",
        year: 2008,
        title: "Cognitive-behavioral therapy for adult anxiety disorders: a meta-analysis of randomized placebo-controlled trials",
        venue: "Journal of Clinical Psychiatry 69(4):621–632",
        effect: { metric: "Hedges' g (anxiety symptoms)", value: 0.73 },
      },
    ],
    dose: { minutesPerSession: [50, 60], sessionsPerWeek: 1, weeksToEffect: 8, note: "โดยทั่วไป 8–16 ครั้ง" },
    costThb: [1500, 5000],
    harms: [],
    harmsNote: "ผลข้างเคียงพบน้อย แต่บางคนอาการแย่ลงชั่วคราวช่วงแรกของการบำบัด",
    limitationTh: "ต้องมีผู้บำบัดวิชาชีพ — แอปนี้ไม่ได้ให้บริการ CBT และไม่ได้ทดแทนมัน",
    selfAdministered: false,
  },
  {
    id: "exercise",
    th: "การออกกำลังกาย",
    en: "Physical exercise",
    grade: "strong",
    summaryTh: "ออกกำลังกายระดับปานกลาง 150 นาที/สัปดาห์ ตามข้อแนะนำขององค์การอนามัยโลก",
    citations: [
      {
        authors: "Noetel M, Sanders T, Gallardo-Gómez D, et al.",
        year: 2024,
        title: "Effect of exercise for depression: systematic review and network meta-analysis of randomised controlled trials",
        venue: "BMJ 384:e075847",
        pooled: { trials: 218, participants: 14170 },
        effect: null,
      },
      {
        authors: "World Health Organization",
        year: 2020,
        title: "WHO guidelines on physical activity and sedentary behaviour",
        venue: "WHO Guidelines",
        effect: { metric: "recommended dose", value: 150, unit: "นาที/สัปดาห์ (ระดับปานกลาง)" },
      },
    ],
    dose: { minutesPerSession: [20, 45], sessionsPerWeek: 5, weeksToEffect: 6 },
    costThb: [0, 0],
    harms: ["บาดเจ็บจากการออกกำลังกาย"],
    harmsNote: "ปรึกษาแพทย์ก่อนเริ่ม ถ้ามีโรคประจำตัวหรือไม่ได้ออกกำลังกายมานาน",
    limitationTh: "งานวิจัยส่วนใหญ่เปิดเผยกลุ่มทดลอง (ปกปิดไม่ได้) จึงมีความเสี่ยงต่ออคติ",
    selfAdministered: true,
  },
  {
    id: "cbti",
    th: "CBT-I — การบำบัดความคิดและพฤติกรรมสำหรับโรคนอนไม่หลับ",
    en: "CBT for insomnia",
    grade: "strong",
    summaryTh: "การรักษาลำดับแรกของอาการนอนไม่หลับเรื้อรัง — จำกัดเวลาบนเตียง คุมสิ่งเร้า ปรับความคิดเรื่องการนอน",
    citations: [
      {
        authors: "Trauer JM, Qian MY, Doyle JS, Rajaratnam SMW, Cunnington D",
        year: 2015,
        title: "Cognitive behavioral therapy for chronic insomnia: a systematic review and meta-analysis",
        venue: "Annals of Internal Medicine 163(3):191–204",
        effect: null,
      },
      {
        authors: "Qaseem A, Kansagara D, Forciea MA, Cooke M, Denberg TD (American College of Physicians)",
        year: 2016,
        title: "Management of chronic insomnia disorder in adults: a clinical practice guideline",
        venue: "Annals of Internal Medicine 165(2):125–133",
        effect: null,
      },
    ],
    dose: { minutesPerSession: [30, 60], sessionsPerWeek: 1, weeksToEffect: 6, note: "โดยทั่วไป 4–8 ครั้ง" },
    costThb: [0, 5000],
    harms: ["ง่วงมากขึ้นในช่วงแรกของการจำกัดเวลาบนเตียง"],
    harmsNote: "ช่วงแรกอาจง่วงระหว่างวันมากขึ้น — ระวังการขับรถ",
    limitationTh: "แอปนี้ช่วยได้แค่บันทึกการนอนและคำนวณประสิทธิภาพการนอน ไม่ใช่โปรแกรม CBT-I",
    selfAdministered: false,
  },
  {
    id: "mindfulness",
    th: "การฝึกสติ / สมาธิ",
    en: "Mindfulness meditation",
    grade: "good",
    summaryTh: "โปรแกรมฝึกสติแบบมีโครงสร้าง เช่น MBSR — ผลชัดที่สุดกับความวิตกกังวลและอารมณ์ซึมเศร้า",
    citations: [
      {
        authors: "Goyal M, Singh S, Sibinga EMS, et al.",
        year: 2014,
        title: "Meditation programs for psychological stress and well-being: a systematic review and meta-analysis",
        venue: "JAMA Internal Medicine 174(3):357–368",
        pooled: { trials: 47, participants: 3515 },
        effect: { metric: "effect size (anxiety, 8 weeks)", value: 0.38 },
      },
    ],
    dose: { minutesPerSession: [10, 30], sessionsPerWeek: 7, weeksToEffect: 8 },
    costThb: [0, 0],
    harms: [],
    harmsNote: "มีรายงานประสบการณ์ไม่พึงประสงค์ในบางราย (เช่น ความวิตกกังวลเพิ่มขึ้นชั่วคราว) แม้พบไม่บ่อย",
    limitationTh: "งานทบทวนพบว่าผลอยู่ระดับปานกลาง–เล็ก และไม่ดีกว่าการรักษาอื่นที่ออกฤทธิ์จริงอย่างชัดเจน",
    selfAdministered: true,
  },
  {
    id: "ssri",
    th: "ยาต้านเศร้า (SSRI และกลุ่มอื่น)",
    en: "Antidepressant medication",
    grade: "strong",
    summaryTh: "ยาที่ต้องสั่งจ่ายโดยแพทย์เท่านั้น — มีหลักฐานว่าได้ผลดีกว่ายาหลอกในภาวะซึมเศร้าระดับปานกลางขึ้นไป",
    citations: [
      {
        authors: "Cipriani A, Furukawa TA, Salanti G, et al.",
        year: 2018,
        title:
          "Comparative efficacy and acceptability of 21 antidepressant drugs for the acute treatment of adults with major depressive disorder: a systematic review and network meta-analysis",
        venue: "The Lancet 391(10128):1357–1366",
        pooled: { trials: 522, participants: 116477 },
        effect: { metric: "odds ratio vs placebo (range across 21 drugs)", value: 1.37, ci: [1.37, 2.13] },
      },
    ],
    dose: null,
    costThb: [0, 3000],
    harms: ["คลื่นไส้", "นอนไม่หลับหรือง่วง", "ผลข้างเคียงทางเพศ", "อาการถอนยาเมื่อหยุดกะทันหัน"],
    harmsNote: "ห้ามเริ่ม หยุด หรือปรับขนาดยาเอง — ต้องอยู่ภายใต้การดูแลของแพทย์เท่านั้น",
    limitationTh: "แพลตฟอร์มนี้ไม่สั่งจ่ายยา ไม่แนะนำตัวยา และไม่แนะนำขนาดยา — แสดงไว้เพื่อให้เห็นภาพทางเลือกทั้งหมด",
    selfAdministered: false,
  },
  {
    id: "nature",
    th: "การใช้เวลาในธรรมชาติ",
    en: "Time in nature",
    grade: "emerging",
    summaryTh: "อยู่ในพื้นที่สีเขียวรวมอย่างน้อย 120 นาที/สัปดาห์ สัมพันธ์กับสุขภาวะที่ดีกว่า",
    citations: [
      {
        authors: "White MP, Alcock I, Grellier J, et al.",
        year: 2019,
        title: "Spending at least 120 minutes a week in nature is associated with good health and wellbeing",
        venue: "Scientific Reports 9:7730",
        pooled: { participants: 19806 },
        effect: { metric: "threshold associated with better wellbeing", value: 120, unit: "นาที/สัปดาห์" },
      },
    ],
    dose: { minutesPerSession: [20, 30], sessionsPerWeek: 5, weeksToEffect: 4 },
    costThb: [0, 0],
    harms: [],
    harmsNote: "ไม่มีรายงานผลข้างเคียง",
    limitationTh:
      "งานนี้เป็นการศึกษาเชิงตัดขวาง — บอก 'ความสัมพันธ์' ไม่ใช่ 'สาเหตุ' คนที่สุขภาพดีอยู่แล้วอาจออกไปข้างนอกได้มากกว่า",
    selfAdministered: true,
  },
  {
    id: "binaural",
    th: "Binaural beats",
    en: "Binaural beats",
    grade: "emerging",
    summaryTh: "ฟังเสียงสองความถี่ที่ต่างกันเล็กน้อยผ่านหูฟัง — ผลวิจัยยังไม่สอดคล้องกัน",
    citations: [
      {
        authors: "Garcia-Argibay M, Santed MA, Reales JM",
        year: 2019,
        title: "Efficacy of binaural auditory beats in cognition, anxiety, and pain perception: a meta-analysis",
        venue: "Psychological Research 83:357–372",
        effect: null,
      },
    ],
    dose: { minutesPerSession: [10, 30], sessionsPerWeek: 7, weeksToEffect: 4 },
    costThb: [0, 0],
    harms: [],
    harmsNote: "ต้องใช้หูฟัง — ระวังระดับเสียง",
    limitationTh:
      "งานวิจัยมีความหลากหลายสูงและกลุ่มตัวอย่างเล็ก เราจัดไว้ที่ 'หลักฐานเบื้องต้น' ทั้งที่เป็นสิ่งที่แอปสร้างได้ง่ายที่สุด — " +
      "เพราะระดับหลักฐานไม่ใช่สิ่งที่ผู้พัฒนาเป็นคนให้",
    selfAdministered: true,
  },
];

export function byGrade(grade: EvidenceGrade): Intervention[] {
  return INTERVENTIONS.filter((i) => i.grade === grade);
}

export function getIntervention(id: string): Intervention | undefined {
  return INTERVENTIONS.find((i) => i.id === id);
}

/** Interventions a user can start today, in this app, without a clinician. */
export function selfAdministered(): Intervention[] {
  return INTERVENTIONS.filter((i) => i.selfAdministered);
}

/** Counts computed from the catalog itself — never hardcoded into a marketing
 *  headline, so the numbers on the landing page cannot drift from the table
 *  beneath them.
 *
 *  ⚠ `participants` and `trials` are SUMS ACROSS REVIEWS, and reviews overlap:
 *  a trial included in two meta-analyses is counted twice here. That makes these
 *  a measure of the cited literature's size, NOT a headcount of distinct people.
 *  `overlapNoteTh` ships with them so the figure is never displayed bare — which
 *  is exactly the trick a "13,000+ participants" hero stat normally plays. */
export function catalogTotals() {
  const citations = INTERVENTIONS.flatMap((i) => i.citations);
  return {
    interventions: INTERVENTIONS.length,
    citations: citations.length,
    trials: citations.reduce((n, c) => n + (c.pooled?.trials ?? 0), 0),
    participants: citations.reduce((n, c) => n + (c.pooled?.participants ?? 0), 0),
    overlapNoteTh:
      "ตัวเลขนี้คือผลรวมจากงานทบทวนที่อ้างอิง ซึ่งอาจนับซ้ำได้ (งานวิจัยชิ้นเดียวอาจอยู่ในหลาย meta-analysis) " +
      "จึงเป็นขนาดของฐานงานวิจัยที่อ้างอิง ไม่ใช่จำนวนคนที่ไม่ซ้ำกัน",
  };
}
