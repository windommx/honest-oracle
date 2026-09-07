// ╔══════════════════════════════════════════════════════════════════╗
// ║  INSTRUMENTS — the two screening questionnaires, as published.     ║
// ║                                                                    ║
// ║  Why these two and no others:                                      ║
// ║  GAD-7 and PHQ-9 were released into the PUBLIC DOMAIN by their     ║
// ║  sponsor (Pfizer), so reproducing their items verbatim is lawful   ║
// ║  and requires no permission. That is not true of every instrument  ║
// ║  a mental-health app would like to ship: the PSQI (sleep quality)  ║
// ║  and the ISI (insomnia severity) are both under copyright with     ║
// ║  licensing terms. We therefore do NOT reproduce them. Sleep is     ║
// ║  measured instead from raw diary quantities the user reports about ║
// ║  their own night (see sleep.ts) — which needs no licence, and is   ║
// ║  a direct count rather than a scale score.                         ║
// ║                                                                    ║
// ║  Refusing to ship an instrument we have no right to ship is the    ║
// ║  same discipline as refusing to print a score we cannot compute.   ║
// ║                                                                    ║
// ║  ⚠ THE THAI WORDING BELOW IS OUR OWN RENDERING.                    ║
// ║  Officially validated Thai editions of both instruments exist and  ║
// ║  were validated as translations — psychometric validation does NOT ║
// ║  transfer to a different translation of the same items. A Thai     ║
// ║  score from this app is therefore usable as a self-tracking        ║
// ║  signal, and is NOT interchangeable with a score from the          ║
// ║  validated Thai edition. Said here, and said again in the UI.      ║
// ╚══════════════════════════════════════════════════════════════════╝

import type { Instrument, ResponseOption } from "./types";

/** The 4-point frequency scale both instruments share. */
const FREQUENCY_OPTIONS: ResponseOption[] = [
  { value: 0, en: "Not at all", th: "ไม่มีเลย" },
  { value: 1, en: "Several days", th: "หลายวัน" },
  { value: 2, en: "More than half the days", th: "เกินครึ่งของจำนวนวัน" },
  { value: 3, en: "Nearly every day", th: "แทบทุกวัน" },
];

const GAD7: Instrument = {
  id: "gad7",
  name: "GAD-7",
  th: "แบบคัดกรองความวิตกกังวล GAD-7",
  windowEn: "the last 2 weeks",
  windowTh: "2 สัปดาห์ที่ผ่านมา",
  stemEn: "Over the last 2 weeks, how often have you been bothered by the following problems?",
  stemTh: "ในช่วง 2 สัปดาห์ที่ผ่านมา คุณมีปัญหาต่อไปนี้บ่อยแค่ไหน",
  items: [
    { n: 1, en: "Feeling nervous, anxious, or on edge", th: "รู้สึกประหม่า วิตกกังวล หรือกระวนกระวาย" },
    { n: 2, en: "Not being able to stop or control worrying", th: "หยุดคิดกังวลหรือควบคุมความกังวลไม่ได้" },
    { n: 3, en: "Worrying too much about different things", th: "กังวลกับเรื่องต่าง ๆ มากเกินไป" },
    { n: 4, en: "Trouble relaxing", th: "ผ่อนคลายได้ยาก" },
    { n: 5, en: "Being so restless that it is hard to sit still", th: "กระสับกระส่ายจนนั่งอยู่เฉย ๆ ได้ยาก" },
    { n: 6, en: "Becoming easily annoyed or irritable", th: "หงุดหงิดหรือโมโหง่ายกว่าปกติ" },
    { n: 7, en: "Feeling afraid, as if something awful might happen", th: "รู้สึกกลัว เหมือนจะมีเรื่องร้ายเกิดขึ้น" },
  ],
  options: FREQUENCY_OPTIONS,
  min: 0,
  max: 21,
  source: {
    authors: "Spitzer RL, Kroenke K, Williams JBW, Löwe B",
    year: 2006,
    title: "A brief measure for assessing generalized anxiety disorder: the GAD-7",
    venue: "Archives of Internal Medicine 166(10):1092–1097",
  },
  licence: "สาธารณสมบัติ (public domain) — เผยแพร่ซ้ำได้โดยไม่ต้องขออนุญาต",
};

const PHQ9: Instrument = {
  id: "phq9",
  name: "PHQ-9",
  th: "แบบคัดกรองภาวะซึมเศร้า PHQ-9",
  windowEn: "the last 2 weeks",
  windowTh: "2 สัปดาห์ที่ผ่านมา",
  stemEn: "Over the last 2 weeks, how often have you been bothered by any of the following problems?",
  stemTh: "ในช่วง 2 สัปดาห์ที่ผ่านมา คุณมีปัญหาต่อไปนี้บ่อยแค่ไหน",
  items: [
    { n: 1, en: "Little interest or pleasure in doing things", th: "เบื่อ ไม่สนใจ หรือไม่เพลิดเพลินกับการทำสิ่งต่าง ๆ" },
    { n: 2, en: "Feeling down, depressed, or hopeless", th: "รู้สึกเศร้า หดหู่ หรือสิ้นหวัง" },
    { n: 3, en: "Trouble falling or staying asleep, or sleeping too much", th: "หลับยาก หลับ ๆ ตื่น ๆ หรือหลับมากเกินไป" },
    { n: 4, en: "Feeling tired or having little energy", th: "รู้สึกเหนื่อยง่าย หรือไม่ค่อยมีแรง" },
    { n: 5, en: "Poor appetite or overeating", th: "เบื่ออาหาร หรือกินมากเกินไป" },
    {
      n: 6,
      en: "Feeling bad about yourself — or that you are a failure or have let yourself or your family down",
      th: "รู้สึกไม่ดีกับตัวเอง คิดว่าตัวเองล้มเหลว หรือทำให้ตัวเองและครอบครัวผิดหวัง",
    },
    {
      n: 7,
      en: "Trouble concentrating on things, such as reading the newspaper or watching television",
      th: "มีสมาธิยาก เช่น เวลาอ่านหนังสือหรือดูโทรทัศน์",
    },
    {
      n: 8,
      en: "Moving or speaking so slowly that other people could have noticed — or the opposite, being so fidgety or restless that you have been moving around a lot more than usual",
      th: "เคลื่อนไหวหรือพูดช้าจนคนอื่นสังเกตเห็น หรือในทางกลับกัน อยู่ไม่นิ่งจนต้องขยับตัวมากกว่าปกติ",
    },
    {
      n: 9,
      en: "Thoughts that you would be better off dead, or of hurting yourself in some way",
      th: "คิดว่าถ้าตายไปคงจะดีกว่า หรือคิดทำร้ายตัวเอง",
      // The one item on either instrument that is acted on regardless of the total.
      safetyCritical: true,
    },
  ],
  options: FREQUENCY_OPTIONS,
  min: 0,
  max: 27,
  source: {
    authors: "Kroenke K, Spitzer RL, Williams JBW",
    year: 2001,
    title: "The PHQ-9: validity of a brief depression severity measure",
    venue: "Journal of General Internal Medicine 16(9):606–613",
  },
  licence: "สาธารณสมบัติ (public domain) — เผยแพร่ซ้ำได้โดยไม่ต้องขออนุญาต",
};

export const INSTRUMENTS: Record<Instrument["id"], Instrument> = { gad7: GAD7, phq9: PHQ9 };

/** Ordered list, for iterating the assessment flow. */
export const INSTRUMENT_LIST: Instrument[] = [GAD7, PHQ9];

export function getInstrument(id: Instrument["id"]): Instrument {
  return INSTRUMENTS[id];
}

/** Instruments we deliberately do NOT ship, and why. Surfaced in the UI so the
 *  absence reads as a decision rather than an oversight. */
export const WITHHELD_INSTRUMENTS = [
  {
    name: "PSQI (Pittsburgh Sleep Quality Index)",
    reasonTh: "อยู่ภายใต้ลิขสิทธิ์ของ University of Pittsburgh — ต้องขออนุญาตก่อนนำมาเผยแพร่ในซอฟต์แวร์",
  },
  {
    name: "ISI (Insomnia Severity Index)",
    reasonTh: "อยู่ภายใต้ลิขสิทธิ์ — ต้องมีสัญญาอนุญาตก่อนนำข้อคำถามมาแสดง",
  },
  {
    name: "STAI (State-Trait Anxiety Inventory)",
    reasonTh: "ต้องซื้อสัญญาอนุญาตรายผู้ใช้ — เราอ้างอิงผลวิจัยที่ใช้ STAI ได้ แต่แสดงข้อคำถามเองไม่ได้",
  },
] as const;
