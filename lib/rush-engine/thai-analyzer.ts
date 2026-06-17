// ╔══════════════════════════════════════════════════════════════════╗
// ║  THAI ANALYZER — deterministic, client-side Thai prose checks      ║
// ║  No LLM. Uses Intl.Segmenter for real Thai word segmentation.     ║
// ╚══════════════════════════════════════════════════════════════════╝

const THAI_STOPWORDS = new Set([
  "ที่", "และ", "เป็น", "ของ", "ใน", "มี", "ไม่", "ได้", "จะ", "ก็", "ให้", "แต่", "กับ", "นี้",
  "นั้น", "เขา", "เธอ", "มัน", "ว่า", "การ", "ความ", "จาก", "ด้วย", "มา", "ไป", "อยู่", "แล้ว",
  "ๆ", "หรือ", "ทุก", "ถ้า", "เมื่อ", "อย่าง", "ซึ่ง", "โดย", "เพื่อ", "คือ", "ทั้ง", "ยัง", "เลย",
  "นะ", "ค่ะ", "ครับ", "เรา", "ฉัน", "ผม", "คุณ", "หนึ่ง", "บน", "ตัว", "คน", "นี่", "นั่น", "เอง",
  // extended
  "แค่", "พอ", "กว่า", "มาก", "น้อย", "บ้าง", "เพียง", "จึง", "ดัง", "ราว", "เช่น", "ต่อ", "ไว้",
  "ขึ้น", "ลง", "ออก", "เข้า", "ถึง", "กัน", "อีก", "ทำ", "เอา", "ไหน", "ใคร", "อะไร", "ทำไม",
  "เพราะ", "หาก", "แม้", "ทว่า", "อัน", "ต้อง", "ควร", "อาจ", "คง", "กำลัง", "เคย", "ย่อม",
  "ตาม", "ระหว่าง", "ภายใน", "เหนือ", "ใต้", "หลัง", "ก่อน", "ขณะ", "ส่วน", "พวก", "บรรดา",
  "เช่นกัน", "เท่า", "ทีเดียว", "นั่นเอง", "นี้เอง", "เสมอ", "ทันที", "ค่อย", "เริ่ม",
]);

// Emotion clichés / "AI-tell" phrases to flag (from the Anti-Safe constraint set).
export const THAI_AI_TELLS = [
  // tears / heart
  "น้ำตาไหลริน", "น้ำตาไหลพราก", "น้ำตาคลอเบ้า", "น้ำตาเอ่อ", "น้ำตารื้น",
  "หัวใจบีบรัด", "หัวใจสลาย", "หัวใจเต้นแรง", "หัวใจพองโต", "หัวใจแหลกสลาย", "ใจสลาย",
  // warmth / smile
  "รอยยิ้มอบอุ่น", "อบอุ่นหัวใจ", "อบอุ่นในใจ", "รอยยิ้มเปื้อนหน้า",
  // overwhelm
  "ความรู้สึกท่วมท้น", "ท่วมท้นไปด้วย", "ใจหายวาบ", "ใจหวิว", "อกสั่นขวัญแขวน", "ขนลุกซู่",
  // light / horizon
  "แสงสว่างที่ปลายอุโมงค์", "สุดขอบฟ้า", "ปลายขอบฟ้า", "แสงแห่งความหวัง",
  // forever / memory
  "ตราตรึงในใจ", "มิอาจลืมเลือน", "ไม่มีวันลืม", "ฝังลึกในความทรงจำ", "ชั่วนิรันดร์",
  // similes
  "ดั่งสายฟ้าฟาด", "ราวกับต้องมนตร์", "ราวกับฝัน", "ดั่งภาพวาด", "ราวกับเวลาหยุดนิ่ง",
  // life lessons (anti-safe)
  "บทเรียนล้ำค่า", "ทุกอย่างจะดีขึ้น", "แสงสว่างในความมืด", "ก้าวข้ามผ่าน",
];

const NEAR_WINDOW = 40; // tokens — a content word repeated within this span is a near-repeat

export interface ThaiAnalysis {
  wordCount: number;
  charCount: number;
  uniqueWords: number;
  topWords: { word: string; count: number }[];
  echoes: { word: string; count: number }[];
  /** Content words repeated within a short span (≤40 tokens) — local repetition. */
  nearRepeats: { word: string; count: number }[];
  aiTells: { phrase: string; count: number }[];
}

// Thai block + Latin letters/digits (avoids the /u flag for broad TS target support).
const WORD_CHAR = /[฀-๿a-zA-Z0-9]/;
const LETTER = /[฀-๿a-zA-Z]/;

interface SegmenterLike {
  segment(input: string): Iterable<{ segment: string }>;
}

function getSegmenter(): SegmenterLike | null {
  const I = Intl as unknown as { Segmenter?: new (loc: string, opts: { granularity: string }) => SegmenterLike };
  if (typeof I.Segmenter !== "function") return null;
  try {
    return new I.Segmenter("th", { granularity: "word" });
  } catch {
    return null;
  }
}

/** Segment Thai text into words. Falls back to a character-run split if Intl.Segmenter is absent. */
export function tokenizeThai(text: string): string[] {
  const seg = getSegmenter();
  if (seg) {
    const out: string[] = [];
    Array.from(seg.segment(text)).forEach(({ segment }) => {
      const w = segment.trim();
      if (w && WORD_CHAR.test(w)) out.push(w);
    });
    return out;
  }
  return text.split(/[^฀-๿a-zA-Z0-9]+/).filter((w) => w && WORD_CHAR.test(w));
}

export function analyzeThai(text: string): ThaiAnalysis {
  const words = tokenizeThai(text);
  const freq = new Map<string, number>();
  words.forEach((w) => freq.set(w, (freq.get(w) ?? 0) + 1));

  const content = Array.from(freq.entries()).filter(
    ([w]) => w.length >= 2 && !THAI_STOPWORDS.has(w) && LETTER.test(w)
  );

  const topWords = content
    .slice()
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([word, count]) => ({ word, count }));

  // Echoes: content words repeated unusually often (≥3 times).
  const echoes = content
    .filter(([, c]) => c >= 3)
    .sort((a, b) => b[1] - a[1])
    .map(([word, count]) => ({ word, count }));

  // Near-repeats: same content word recurring within NEAR_WINDOW tokens.
  const lastPos = new Map<string, number>();
  const near = new Map<string, number>();
  words.forEach((w, i) => {
    if (w.length >= 2 && !THAI_STOPWORDS.has(w) && LETTER.test(w)) {
      const prev = lastPos.get(w);
      if (prev !== undefined && i - prev <= NEAR_WINDOW) near.set(w, (near.get(w) ?? 0) + 1);
      lastPos.set(w, i);
    }
  });
  const nearRepeats = Array.from(near.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([word, count]) => ({ word, count }));

  const aiTells = THAI_AI_TELLS.map((phrase) => ({
    phrase,
    count: text.split(phrase).length - 1,
  })).filter((t) => t.count > 0);

  return {
    wordCount: words.length,
    charCount: text.replace(/\s/g, "").length,
    uniqueWords: freq.size,
    topWords,
    echoes,
    nearRepeats,
    aiTells,
  };
}
