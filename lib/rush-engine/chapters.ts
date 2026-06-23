// Shared, language-agnostic chapter segmentation for the analyzers.
// Splits on Markdown headings or "Chapter N" / "บทที่ N" / "ตอนที่ N" lines.

const HEADING = /^\s*(?:#{1,3}\s+\S|(?:chapter|ch\.?|part|บทที่|บท|ตอนที่|ตอน)\s+[\dIVXLivxl]+)/i;

/** Split text into chapters on headings; falls back to a single chunk. */
export function splitChapters(text: string): { title: string; body: string }[] {
  const lines = text.split(/\r?\n/);
  const heads = lines.map((l, i) => (HEADING.test(l) ? i : -1)).filter((i) => i >= 0);
  if (heads.length === 0) return [{ title: "Full text", body: text }];

  const chunks: { title: string; body: string }[] = [];
  const preamble = lines.slice(0, heads[0]).join("\n").trim();
  if (preamble) chunks.push({ title: "(intro)", body: preamble });
  heads.forEach((start, h) => {
    const end = h + 1 < heads.length ? heads[h + 1] : lines.length;
    const title = lines[start].replace(/^\s*#{1,3}\s*/, "").trim() || `Section ${h + 1}`;
    chunks.push({ title, body: lines.slice(start + 1, end).join("\n") });
  });
  return chunks;
}
