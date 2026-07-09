// Parse a user-supplied outline into per-chapter beats, so each chapter prompt
// gets ITS specific beat (premise-specific), not just the generic structural role.
// Pure / deterministic — no LLM.

// Two header forms (Arabic OR Thai digits ๐-๙):
//  PREFIXED — an explicit keyword/# prefix makes it unambiguous, so the separator
//    is optional and the number is unbounded ("บทที่ ๑", "Chapter 12", "# 3 beat").
//  BARE — a plain "N. beat" line counts ONLY when N is within [1, maxChapters], so
//    prose like "10:30 they met", "1980: war begins", "3) backup plan" can't hijack.
const PREFIXED = /^\s*(?:บท(?:ที่)?|chapter|ch\.?|#+)\s*([\d๐-๙]+)\s*[.:)\-–—]?\s*(.*)$/i;
const BARE = /^\s*([\d๐-๙]{1,3})\s*[.:)\-–—]\s*(.*)$/;
const THAI_DIGITS = "๐๑๒๓๔๕๖๗๘๙";
const toArabic = (s: string) => s.replace(/[๐-๙]/g, (d) => String(THAI_DIGITS.indexOf(d)));

export function parseOutline(outline: string, maxChapters?: number): Map<number, string> {
  const parts = new Map<number, string[]>();
  let current: number | null = null;

  for (const raw of outline.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    let num: number | null = null;
    let beat = "";
    const pre = line.match(PREFIXED);
    if (pre) {
      num = parseInt(toArabic(pre[1]), 10);
      beat = pre[2];
    } else {
      const bare = line.match(BARE);
      if (bare) {
        const n = parseInt(toArabic(bare[1]), 10);
        // Accept a bare number only if it's a plausible chapter number.
        if (n >= 1 && maxChapters !== undefined && n <= maxChapters) {
          num = n;
          beat = bare[2];
        }
      }
    }
    if (num !== null) {
      current = num;
      if (!parts.has(current)) parts.set(current, []);
      if (beat.trim()) parts.get(current)!.push(beat.trim());
    } else if (current !== null) {
      parts.get(current)!.push(line);
    }
  }

  const out = new Map<number, string>();
  parts.forEach((lines, n) => {
    const text = lines.join("\n").trim();
    if (text) out.set(n, text);
  });
  return out;
}
