// ╔══════════════════════════════════════════════════════════════════╗
// ║  DESIGN TOKENS — the canonical palette, and the ONLY hex literals  ║
// ║  allowed in app/rush.                                              ║
// ║                                                                    ║
// ║  Measured drift that motivated this (counted, not guessed):        ║
// ║   · TWO page backgrounds — #0a0a0f on 5 pages, #08080e on 4 files, ║
// ║     while :root already declared --background as the latter. The   ║
// ║     background visibly shifted when navigating between them.       ║
// ║   · TWO "bright gold" values used for the SAME hover — fix/page    ║
// ║     had hover:bg-[#d8b45a], explore/page had hover:bg-[#e6c86a].   ║
// ║                                                                    ║
// ║  That is drift, not taste: one concept rendered as two values. The ║
// ║  companion test (_tokens.test.ts) scans app/rush and FAILS on any  ║
// ║  hex outside this set, so consistency is enforced rather than       ║
// ║  merely intended — the same move as every other guard in this repo.║
// ║                                                                    ║
// ║  Tailwind arbitrary values need a literal hex, so these are strings ║
// ║  rather than CSS vars at the call site; globals.css mirrors them as ║
// ║  :root vars for plain CSS. Keep the two in sync (a test checks).    ║
// ╚══════════════════════════════════════════════════════════════════╝

/** Page background. Canonical: the value the majority of pages already used;
 *  globals.css :root --background is set to match, so body and pages agree. */
export const BG = "#0a0a0f";

/** Raised surface (toast, popover) — one step lighter than the page. */
export const SURFACE = "#12121a";

/** The brand accent. */
export const GOLD = "#c9a84c";

/** Brighter accent: hover, active, emphasis. Consolidates the former #d8b45a. */
export const GOLD_BRIGHT = "#e6c86a";

/** Deep accent — gradient stop only (never a standalone fill). */
export const GOLD_DEEP = "#a08030";

/** Print/paper foreground — the manuscript preview only, where the surface is light. */
export const PAPER = "#f0ece4";

/** Muted foreground fallback (Tailwind gray-400) for an unmapped tier badge. */
export const MUTED = "#9ca3af";

// ── Epistemic tier colours ─────────────────────────────────────────────────────
// SEMANTIC, not decorative: each encodes one tier from epistemics.ts, and they were
// duplicated verbatim across _components.tsx (EpistemicPanel) and honesty/page.tsx —
// two copies of a meaning is exactly how a palette rots. Named once here.
/** ประจักษ์ — direct count. */
export const TIER_DIRECT = "#34d399";
/** อนุมาน — derived by disclosed formula. */
export const TIER_DERIVED = "#38bdf8";
/** สัญญา — heuristic label. */
export const TIER_HEURISTIC = "#fbbf24";
/** อวิสัย — refused. */
export const TIER_REFUSED = "#fb7185";

/** Every hex literal permitted in app/rush. The guard test enforces this list.
 *  Adding a colour means adding it HERE first, with a reason — which is the point:
 *  it makes a new value a deliberate decision instead of an accident. */
export const PALETTE = {
  BG,
  SURFACE,
  GOLD,
  GOLD_BRIGHT,
  GOLD_DEEP,
  PAPER,
  MUTED,
  TIER_DIRECT,
  TIER_DERIVED,
  TIER_HEURISTIC,
  TIER_REFUSED,
} as const;

/** Lower-cased hex set for the guard test. */
export const ALLOWED_HEX: ReadonlySet<string> = new Set(
  Object.values(PALETTE).map((h) => h.toLowerCase())
);
