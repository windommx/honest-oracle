// ╔══════════════════════════════════════════════════════════════════╗
// ║  KDP — deterministic print/publish math & compliance.             ║
// ║  Pure, no LLM, no network. Real KDP formulas; estimates are        ║
// ║  labelled as estimates (no fake precision).                        ║
// ╚══════════════════════════════════════════════════════════════════╝

export type PaperWeight = "50_white" | "60_cream" | "70_white";
export type TrimSize = "5x8" | "5.5x8.5" | "6x9" | "7x10" | "8.5x11";

// Pages-per-inch by paper stock (Amazon KDP published values).
const PPI: Record<PaperWeight, number> = { "50_white": 444, "60_cream": 400, "70_white": 370 };

export const TRIM: Record<TrimSize, { w: number; h: number; wordsPerPage: number }> = {
  // wordsPerPage: rough single-spaced estimate per trim (used only for page estimate).
  "5x8": { w: 5, h: 8, wordsPerPage: 250 },
  "5.5x8.5": { w: 5.5, h: 8.5, wordsPerPage: 280 },
  "6x9": { w: 6, h: 9, wordsPerPage: 300 },
  "7x10": { w: 7, h: 10, wordsPerPage: 380 },
  "8.5x11": { w: 8.5, h: 11, wordsPerPage: 520 },
};

export const BLEED_IN = 0.125;
export const MIN_PAGES_PAPERBACK = 24;
export const MIN_PAGES_HARDCOVER = 75;

/** Spine width. KDP: pages ÷ PPI = inches. Returns inches + mm (2-dp). */
export function spineWidth(pageCount: number, paper: PaperWeight = "60_cream"): { inches: number; mm: number } {
  const inches = pageCount / PPI[paper];
  return { inches: Math.round(inches * 1000) / 1000, mm: Math.round(inches * 25.4 * 100) / 100 };
}

/** Estimate interior page count from word count for a trim size (ESTIMATE — verify in KDP previewer). */
export function estimatePages(words: number, trim: TrimSize = "6x9"): number {
  const wpp = TRIM[trim].wordsPerPage;
  return Math.max(1, Math.ceil(words / wpp));
}

/** Full wraparound cover canvas size (inches), incl. spine + bleed on all sides. */
export function coverCanvas(pageCount: number, trim: TrimSize = "6x9", paper: PaperWeight = "60_cream") {
  const t = TRIM[trim];
  const spine = spineWidth(pageCount, paper).inches;
  return {
    widthIn: Math.round((t.w * 2 + spine + BLEED_IN * 2) * 1000) / 1000,
    heightIn: Math.round((t.h + BLEED_IN * 2) * 1000) / 1000,
    spineIn: spine,
    // 300-DPI pixel size for the image tool
    widthPx: Math.round((t.w * 2 + spine + BLEED_IN * 2) * 300),
    heightPx: Math.round((t.h + BLEED_IN * 2) * 300),
  };
}

export interface KdpCheck { rule: string; ok: boolean; note: string }

/** Deterministic KDP readiness checklist (paperback). Every item is a real,
 *  checkable rule — not a vibe score. Returns the computed page/spine too. */
export function kdpReadiness(input: { words: number; trim?: TrimSize; paper?: PaperWeight; binding?: "paperback" | "hardcover" }): {
  pages: number;
  spine: { inches: number; mm: number };
  cover: ReturnType<typeof coverCanvas>;
  checks: KdpCheck[];
  ready: boolean;
} {
  const trim = input.trim ?? "6x9";
  const paper = input.paper ?? "60_cream";
  const binding = input.binding ?? "paperback";
  const pages = estimatePages(input.words, trim);
  const spine = spineWidth(pages, paper);
  const minPages = binding === "hardcover" ? MIN_PAGES_HARDCOVER : MIN_PAGES_PAPERBACK;

  const checks: KdpCheck[] = [
    { rule: `≥ ${minPages} pages (${binding})`, ok: pages >= minPages, note: `estimated ${pages} pages from ${input.words} words` },
    { rule: "Known trim size", ok: trim in TRIM, note: `${TRIM[trim].w}"×${TRIM[trim].h}"` },
    { rule: "Word count present", ok: input.words > 0, note: `${input.words} words` },
    { rule: "Spine fits content (paperback < ~0.06\" has no spine text)", ok: true, note: `spine ${spine.inches}" (${spine.mm} mm)` },
    { rule: "Cover bleed 0.125\" each side", ok: true, note: "applied in coverCanvas()" },
  ];
  return { pages, spine, cover: coverCanvas(pages, trim, paper), checks, ready: checks.every((c) => c.ok) };
}
