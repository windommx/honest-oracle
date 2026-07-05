// ╔══════════════════════════════════════════════════════════════════╗
// ║  SENSORY DENSITY — deterministic sensory-detail counter.          ║
// ║  No LLM. The one measurable claim behind "Narrative Transportation"║
// ║  is that immersive prose carries sensory detail — so we COUNT it.  ║
// ║  Matches a fixed sensory word list per sense (sight/sound/smell/   ║
// ║  taste/touch) and reports real counts + density per 1,000 words.  ║
// ║  It is a lexicon match, NOT a quality score: the writer sees which ║
// ║  words matched and which senses they never used, and decides.     ║
// ║  Thai recall is bounded by word segmentation and the lexicon.     ║
// ╚══════════════════════════════════════════════════════════════════╝

import { countPhrases } from "./text-util";
import { tokenizeProse } from "./prose-analyzer";
import { tokenizeThai } from "./thai-analyzer";

export type Sense = "sight" | "sound" | "smell" | "taste" | "touch";
export const SENSES: Sense[] = ["sight", "sound", "smell", "taste", "touch"];

export const SENSE_LABEL: Record<Sense, { en: string; th: string }> = {
  sight: { en: "sight", th: "การมองเห็น" },
  sound: { en: "sound", th: "เสียง" },
  smell: { en: "smell", th: "กลิ่น" },
  taste: { en: "taste", th: "รส" },
  touch: { en: "touch", th: "สัมผัส" },
};

// English sensory lexicon. Single tokens only (matched by exact lowercased token).
const EN_LEXICON: Record<Sense, string[]> = {
  sight: ["light", "shadow", "glow", "gleam", "glint", "flicker", "bright", "dark", "dim",
    "pale", "shimmer", "shine", "color", "colour", "glare", "blur", "silhouette",
    "reflection", "flash", "dazzle", "murky", "vivid", "glimmer", "hue"],
  sound: ["sound", "loud", "quiet", "silence", "whisper", "shout", "echo", "hum", "buzz",
    "rustle", "crash", "creak", "murmur", "ring", "thud", "hiss", "roar", "clatter",
    "footsteps", "clang", "rumble", "screech", "patter", "wail"],
  smell: ["smell", "scent", "odor", "odour", "fragrance", "stench", "reek", "aroma",
    "whiff", "musty", "perfume", "smoky", "rotten", "fumes", "acrid"],
  taste: ["taste", "sweet", "sour", "salty", "bitter", "spicy", "savory", "savoury",
    "bland", "tang", "flavor", "flavour", "sip", "swallow", "tart"],
  touch: ["touch", "cold", "hot", "warm", "cool", "soft", "hard", "rough", "smooth",
    "slick", "sticky", "damp", "dry", "sharp", "prickle", "numb", "ache", "sting",
    "itch", "wet", "coarse", "tender", "brush", "grip", "clammy", "silky"],
};

// Thai sensory lexicon. Distinctive content words per sense (bounded by segmentation).
const TH_LEXICON: Record<Sense, string[]> = {
  sight: ["แสง", "เงา", "ประกาย", "วิบวับ", "ระยิบระยับ", "สว่าง", "มืด", "สลัว", "จ้า",
    "พร่า", "เลือน", "เรืองรอง", "ส่อง", "สะท้อน", "มืดมิด", "สีสัน", "รำไร", "วูบวาบ", "เจิดจ้า",
    "ทึบ", "วาบ", "แวบ", "ฟ้าแลบ", "จันทร์", "ระยับ", "โพลง", "มัว"],
  sound: ["เสียง", "ดัง", "เงียบ", "กระซิบ", "ตะโกน", "ครืน", "ครวญ", "แว่ว", "ก้อง",
    "กรอบแกรบ", "หวีด", "แผ่ว", "อึกทึก", "จอแจ", "กังวาน", "ครืดคราด", "แผดเสียง", "ซู่",
    "สนั่น", "เห่า", "อึง", "ร้อง", "ฟ้าร้อง", "หอน", "คำราม", "อื้ออึง", "แผด"],
  smell: ["กลิ่น", "หอม", "เหม็น", "ฉุน", "อบอวล", "คละคลุ้ง", "ตลบ", "กรุ่น", "หืน", "สาบ", "คาว", "หึ่ง",
    "คลุ้ง", "ฉุนกึก", "หอมกรุ่น"],
  taste: ["รสชาติ", "หวาน", "เปรี้ยว", "เค็ม", "ขม", "เผ็ด", "จืด", "ฝาด", "กลมกล่อม",
    "ลิ้มรส", "ชิม", "มันเยิ้ม", "รส", "เฝื่อน", "กร่อย", "จัดจ้าน"],
  touch: ["เย็น", "ร้อน", "อุ่น", "หนาว", "นุ่ม", "แข็ง", "หยาบ", "เรียบ", "ลื่น", "เหนียว",
    "ชื้น", "แห้ง", "ระคาย", "ชา", "แสบ", "คัน", "เปียก", "กระด้าง", "อ่อนนุ่ม", "เยือกเย็น",
    "สาก", "เฉียบ", "เหนอะหนะ", "ผ่าว", "นุ่มนิ่ม", "เย็นเฉียบ", "แสบร้อน"],
};

export interface SenseStat {
  sense: Sense;
  count: number;
  per1k: number; // occurrences per 1,000 words (rounded to 1 dp)
  samples: { word: string; count: number }[]; // matched words, most frequent first
}
export interface SensoryLedger {
  words: number;
  total: number; // total sensory-word occurrences across all senses
  per1k: number;
  senses: SenseStat[]; // fixed order: sight, sound, smell, taste, touch
  unused: Sense[]; // senses with zero matches (a fact, not a verdict)
}

/** Count sensory-detail words per sense. Deterministic; counts + density only,
 *  no quality verdict. `lang` picks the lexicon + tokenizer. */
export function sensoryDensity(text: string, lang: "en" | "th"): SensoryLedger {
  const tokens = lang === "th" ? tokenizeThai(text) : tokenizeProse(text);
  const words = tokens.length;
  const lex = lang === "th" ? TH_LEXICON : EN_LEXICON;
  const per1k = (n: number) => (words ? Math.round((n / words) * 1000 * 10) / 10 : 0);

  const senses: SenseStat[] = SENSES.map((sense) => {
    const hits = countPhrases(text, lex[sense], { tokens }).sort((a, b) => b.count - a.count);
    const count = hits.reduce((s, h) => s + h.count, 0);
    return {
      sense,
      count,
      per1k: per1k(count),
      samples: hits.slice(0, 6).map((h) => ({ word: h.phrase, count: h.count })),
    };
  });

  const total = senses.reduce((s, x) => s + x.count, 0);
  return {
    words,
    total,
    per1k: per1k(total),
    senses,
    unused: senses.filter((s) => s.count === 0).map((s) => s.sense),
  };
}
