// Parse a user-supplied outline into per-chapter beats, so each chapter prompt
// gets ITS specific beat (premise-specific), not just the generic structural role.
// Pure / deterministic — no LLM.

// A "chapter header" line: optional prefix (บท / บทที่ / Chapter / Ch / #) + number
// + a separator (. ) : - – —) + the beat text. Lines without a header append to the
// current chapter (multi-line beats).
const HEADER = /^\s*(?:บท(?:ที่)?\s*|chapter\s*|ch\.?\s*|#\s*)?(\d{1,3})\s*[.:)\-–—]\s*(.*)$/i;

export function parseOutline(outline: string): Map<number, string> {
  const parts = new Map<number, string[]>();
  let current: number | null = null;

  for (const raw of outline.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(HEADER);
    if (m) {
      current = parseInt(m[1], 10);
      if (!parts.has(current)) parts.set(current, []);
      if (m[2].trim()) parts.get(current)!.push(m[2].trim());
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
