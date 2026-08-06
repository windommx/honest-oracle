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

/** Spine width. KDP: pages ÷ PPI = inches. Returns inches + mm (2-dp).
 *  An unknown paper stock falls back to 60_cream rather than dividing by undefined → NaN;
 *  kdpReadiness surfaces the invalid stock as a failed check so the fallback is never silent. */
export function spineWidth(pageCount: number, paper: PaperWeight = "60_cream"): { inches: number; mm: number } {
  const ppi = PPI[paper] ?? PPI["60_cream"];
  const inches = pageCount / ppi;
  return { inches: Math.round(inches * 1000) / 1000, mm: Math.round(inches * 25.4 * 100) / 100 };
}

/** Estimate interior page count from word count for a trim size (ESTIMATE — verify in KDP previewer). */
export function estimatePages(words: number, trim: TrimSize = "6x9"): number {
  // Unknown trim → 6x9 fallback (never dereference undefined); non-finite/≤0 words → 1 page
  // (never propagate NaN). kdpReadiness reports both as failed checks, so neither is silent.
  const wpp = TRIM[trim]?.wordsPerPage ?? TRIM["6x9"].wordsPerPage;
  if (!Number.isFinite(words) || words <= 0) return 1;
  return Math.max(1, Math.ceil(words / wpp));
}

/** Full wraparound cover canvas size (inches), incl. spine + bleed on all sides. */
export function coverCanvas(pageCount: number, trim: TrimSize = "6x9", paper: PaperWeight = "60_cream") {
  const t = TRIM[trim] ?? TRIM["6x9"]; // unknown trim → fallback, never read undefined.w
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

// Amazon KDP metadata field limits (real, published).
export const KDP_LIMITS = { title: 200, subtitle: 200, description: 4000, descriptionMin: 100, keywords: 7, keywordLen: 50, categories: 3 };

export interface KdpMeta {
  title?: string;
  subtitle?: string;
  author?: string;
  description?: string;
  keywords?: string[];
  categories?: string[];
}

/** Deterministic KDP metadata-compliance checks against real field limits. Only the
 *  fields the writer supplied are checked — a missing field is reported as "provide it",
 *  never silently passed. */
export function kdpMetadataChecks(meta: KdpMeta): KdpCheck[] {
  const kw = (meta.keywords ?? []).map((k) => k.trim()).filter(Boolean);
  const cats = (meta.categories ?? []).map((c) => c.trim()).filter(Boolean);
  const desc = (meta.description ?? "").trim();
  return [
    { rule: `Title ≤ ${KDP_LIMITS.title} chars`, ok: !!meta.title && meta.title.length <= KDP_LIMITS.title, note: meta.title ? `${meta.title.length} chars` : "ยังไม่ใส่ชื่อเรื่อง" },
    { rule: `Description ${KDP_LIMITS.descriptionMin}–${KDP_LIMITS.description} chars`, ok: desc.length >= KDP_LIMITS.descriptionMin && desc.length <= KDP_LIMITS.description, note: desc ? `${desc.length} chars` : "ยังไม่ใส่คำโปรย" },
    { rule: `≤ ${KDP_LIMITS.keywords} keywords, each ≤ ${KDP_LIMITS.keywordLen} chars`, ok: kw.length > 0 && kw.length <= KDP_LIMITS.keywords && kw.every((k) => k.length <= KDP_LIMITS.keywordLen), note: `${kw.length} keywords` },
    { rule: `1–${KDP_LIMITS.categories} categories`, ok: cats.length >= 1 && cats.length <= KDP_LIMITS.categories, note: `${cats.length} categories` },
  ];
}

/** Deterministic KDP readiness checklist (paperback). Every item is a real,
 *  checkable rule — not a vibe score. When `meta` is supplied, metadata-compliance
 *  checks are included so this is a full pre-publish gate, not just print math. */
export function kdpReadiness(input: { words: number; trim?: TrimSize; paper?: PaperWeight; binding?: "paperback" | "hardcover"; meta?: KdpMeta }): {
  pages: number;
  spine: { inches: number; mm: number };
  cover: ReturnType<typeof coverCanvas>;
  checks: KdpCheck[];
  ready: boolean;
} {
  const trim = input.trim ?? "6x9";
  const paper = input.paper ?? "60_cream";
  const binding = input.binding ?? "paperback";
  // Validate BEFORE the math (which now falls back safely) so an invalid trim/paper/word
  // count fails a real check and drops `ready` to false — instead of crashing (old: trim
  // deref before the trim check ran) or reporting a NaN spine as publish-ready.
  const trimOk = trim in TRIM;
  const paperOk = paper in PPI;
  const wordsOk = Number.isFinite(input.words) && input.words > 0;
  const pages = estimatePages(input.words, trim);
  const spine = spineWidth(pages, paper);
  const minPages = binding === "hardcover" ? MIN_PAGES_HARDCOVER : MIN_PAGES_PAPERBACK;

  const checks: KdpCheck[] = [
    { rule: "Known trim size", ok: trimOk, note: trimOk ? `${TRIM[trim].w}"×${TRIM[trim].h}"` : `unknown trim "${trim}" — using 6x9 to estimate` },
    { rule: "Known paper stock", ok: paperOk, note: paperOk ? `${PPI[paper]} PPI` : `unknown paper "${paper}" — using 60_cream to estimate` },
    { rule: "Word count present", ok: wordsOk, note: wordsOk ? `${input.words} words` : `invalid word count (${input.words})` },
    { rule: `≥ ${minPages} pages (${binding})`, ok: wordsOk && pages >= minPages, note: `estimated ${pages} pages from ${input.words} words` },
    { rule: "Spine fits content (paperback < ~0.06\" has no spine text)", ok: trimOk && paperOk && wordsOk, note: `spine ${spine.inches}" (${spine.mm} mm)` },
    { rule: "Cover bleed 0.125\" each side", ok: true, note: "applied in coverCanvas()" },
  ];
  if (input.meta) checks.push(...kdpMetadataChecks(input.meta));
  return { pages, spine, cover: coverCanvas(pages, trim, paper), checks, ready: checks.every((c) => c.ok) };
}

/** Paste-ready KDP submission package as Markdown: computed print specs + the metadata
 *  checklist. Honest about the one thing a browser can't do (print-ready interior PDF). */
/** Amazon KDP's AI-content DISCLOSURE guidance — the honest inverse of "detection evasion".
 *
 *  Amazon does not ban AI content; it requires DISCLOSURE of AI-GENERATED text/images/
 *  translations that appear in the book, and requires NO disclosure for AI-ASSISTED workflow
 *  tasks (brainstorm, grammar, research, refining human-written text). The disclosure is for
 *  Amazon's internal use, is not shown on the product page, and per Amazon does not affect
 *  royalties or ranking. This is guidance toward complying honestly — never toward evading a
 *  detector, which is both against KDP terms and the opposite of this engine's whole point.
 *
 *  Source: Amazon KDP "Artificial Intelligence (AI) Content" guidelines, cross-checked
 *  against multiple 2026 summaries (as of 2026-08). Verify the live KDP Help page before
 *  publishing — the policy has tightened through 2025–2026 and can change. */
export const KDP_AI_DISCLOSURE = {
  asOf: "2026-08",
  source: "Amazon KDP AI Content guidelines + 2026 secondary summaries (verify live KDP Help)",
  /** Appears IN the book → you must declare it during the upload interview. */
  mustDisclose: [
    "ข้อความที่ AI สร้าง (แม้คุณจะแก้ไขภายหลัง) — AI-generated text",
    "ปก/ภาพประกอบที่ AI สร้าง — AI-generated images",
    "คำแปลที่ AI แปล — AI translation",
  ],
  /** Workflow help that never becomes book content → no disclosure. */
  noDisclosure: [
    "ใช้ AI ระดมไอเดีย/วางโครง (brainstorm, outline)",
    "ตรวจแก้ไวยากรณ์/สะกด (grammar, spell-check)",
    "ให้ AI แนะนำการแก้ข้อความที่คุณเขียนเอง",
    "ใช้ AI ค้นข้อมูล (ถ้าคุณตรวจแหล่งเอง)",
  ],
  /** How Rush's OWN output maps onto the line — stated plainly, not hidden. */
  rushNote:
    "Rush สร้าง prompt + วิเคราะห์แบบนับได้ ตัวมันเองไม่ได้เขียนเนื้อในเล่ม: ถ้าคุณเอา prompt ไปให้ LLM " +
    "เขียนข้อความแล้วใช้เป็นเนื้อในเล่ม = AI-generated ต้อง disclose; ถ้าคุณเขียนเองแล้วใช้ Rush ช่วยวิเคราะห์/แก้ = AI-assisted ไม่ต้อง disclose. " +
    "ไม่ว่าทางไหน ให้ประกาศตามจริง — Rush ไม่สอนวิธีหลบเครื่องตรวจ (ผิดกฎ KDP และขัดกับหลักการทั้งหมดของเครื่องมือนี้).",
} as const;

export function formatKdpPackage(input: { words: number; trim?: TrimSize; paper?: PaperWeight; binding?: "paperback" | "hardcover"; meta?: KdpMeta }): string {
  const r = kdpReadiness(input);
  const trim = input.trim ?? "6x9";
  const paper = input.paper ?? "60_cream";
  const L: string[] = [];
  L.push("# KDP Submission Package", "");
  L.push(`- Trim: ${TRIM[trim].w}"×${TRIM[trim].h}" · Paper: ${paper.replace("_", " ")}`);
  L.push(`- Est. pages: ${r.pages} (ตรวจซ้ำใน KDP previewer)`);
  L.push(`- Spine: ${r.spine.inches}" (${r.spine.mm} mm)`);
  L.push(`- Full cover canvas: ${r.cover.widthIn}"×${r.cover.heightIn}" · ${r.cover.widthPx}×${r.cover.heightPx}px @300dpi`, "");
  L.push("## Readiness checklist");
  for (const c of r.checks) L.push(`- [${c.ok ? "x" : " "}] ${c.rule} — ${c.note}`);
  L.push("", `**${r.ready ? "พร้อมส่ง (ตามที่ตรวจได้)" : "ยังไม่พร้อม — ดูข้อที่ยังไม่ติ๊ก"}**`);
  L.push("", "## การเปิดเผยเนื้อหา AI (นโยบาย Amazon จริง — ไม่ใช่การหลบเครื่องตรวจ)");
  L.push(`_อ้างอิง: ${KDP_AI_DISCLOSURE.source} (ณ ${KDP_AI_DISCLOSURE.asOf}) — ตรวจหน้า KDP Help สดก่อนตีพิมพ์_`);
  L.push("", "**ต้องเปิดเผย (อยู่ในเล่ม):**");
  for (const x of KDP_AI_DISCLOSURE.mustDisclose) L.push(`- ${x}`);
  L.push("", "**ไม่ต้องเปิดเผย (งานช่วยเบื้องหลัง):**");
  for (const x of KDP_AI_DISCLOSURE.noDisclosure) L.push(`- ${x}`);
  L.push("", `> ${KDP_AI_DISCLOSURE.rushNote}`);
  L.push("", "> ข้อจำกัดที่ซื่อสัตย์: หน้านี้คำนวณสเปกและตรวจ metadata แบบ deterministic แต่ **ไฟล์เนื้อในพร้อมพิมพ์ (PDF/CMYK)** ต้องทำในโปรแกรมจัดหน้า/เดสก์ท็อป — เบราว์เซอร์ทำ CMYK ที่แม่นยำไม่ได้");
  return L.join("\n");
}
