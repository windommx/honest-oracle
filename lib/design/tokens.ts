// ╔══════════════════════════════════════════════════════════════════╗
// ║  DESIGN TOKENS — the app-wide palette. One value per concept.     ║
// ║                                                                    ║
// ║  These began life in app/rush/_tokens.ts, written to end a         ║
// ║  measured drift within one product (counted, not guessed):         ║
// ║   · TWO page backgrounds — #0a0a0f on 5 pages, #08080e on 4 files, ║
// ║     while :root already declared --background as the latter. The   ║
// ║     background visibly shifted when navigating between them.       ║
// ║   · TWO "bright gold" values used for the SAME hover — fix/page    ║
// ║     had hover:bg-[#d8b45a], explore/page had hover:bg-[#e6c86a].   ║
// ║                                                                    ║
// ║  They live here now because a SECOND product (app/therapy) needs   ║
// ║  the same palette, and copying the hexes into it would have        ║
// ║  recreated exactly the drift the original pass removed — one       ║
// ║  concept rendered as two values, this time across two folders.     ║
// ║  globals.css :root mirrors these for plain CSS; guard tests in     ║
// ║  each product keep the three in sync.                              ║
// ║                                                                    ║
// ║  Tailwind arbitrary values need a literal hex, so these are        ║
// ║  strings rather than CSS vars at the call site.                    ║
// ╚══════════════════════════════════════════════════════════════════╝

/** Page background. Canonical: the value the majority of pages already used;
 *  globals.css :root --background is set to match, so body and pages agree. */
export const BG = "#0a0a0f";

/** Raised surface (toast, popover, card) — one step lighter than the page. */
export const SURFACE = "#12121a";

/** The brand accent. */
export const GOLD = "#c9a84c";

/** Brighter accent: hover, active, emphasis. Consolidates the former #d8b45a. */
export const GOLD_BRIGHT = "#e6c86a";

/** Deep accent — gradient stop only (never a standalone fill). */
export const GOLD_DEEP = "#a08030";

/** Darker accent shade — theme scale only (tailwind gold.dark), never a page fill. */
export const GOLD_DARK = "#a8893d";

/** Default foreground on the dark surface. */
export const FOREGROUND = "#ffffff";

/** Muted foreground (Tailwind gray-400). 7.78:1 on BG — passes WCAG AA. */
export const MUTED = "#9ca3af";

/** Faintest text tier. Tailwind gray-500 (#6b7280) measured 4.09:1 on BG — it FAILS AA for
 *  normal text, and it was the app's most-used text colour (116 uses) on 0.62-0.72rem type,
 *  which is normal text by any reading. gray-600 (2.61:1) and gray-700 (1.92:1) failed even
 *  the 3:1 large-text floor.
 *
 *  Calibrated against the LIGHTEST surface a faint label can land on, not just the page
 *  background. The first attempt (#757d8c) cleared 4.77:1 on BG but fell to 4.35:1 on
 *  bg-white/5 and 3.78:1 on bg-white/10 — a value tuned for one background silently fails
 *  on every card and chip drawn over it. This one clears 4.5:1 on ALL nine surfaces the app
 *  actually uses (page, raised, white/0.02-0.10, gold/0.06-0.15), worst case 4.51:1, and is
 *  still visibly fainter than gray-400. */
export const TEXT_FAINT = "#828a99";

/** Measured WCAG contrast of each text tier against BG. Recomputed by the contrast
 *  tests — recorded so the choice is auditable, not asserted from memory. */
export const TEXT_CONTRAST = {
  "gray-200": 15.95,
  "gray-300": 13.40,
  "gray-400": 7.78,
  TEXT_FAINT: 5.69, // on BG; worst case across all surfaces is 4.51:1
} as const;

// ── The confidence ladder ─────────────────────────────────────────────────────
// SEMANTIC, not decorative: four steps from "you can rely on this" down to
// "treat this as a prompt to look closer". Both products have a four-step ladder
// of exactly this shape — Rush grades KINDS OF KNOWING (direct count → derived →
// heuristic → refused), MindBridge grades STRENGTH OF EVIDENCE (systematic
// review → meta-analysis → few RCTs → associational). Same meaning, so the same
// four colours, named once here instead of twice with different names.

/** Strongest rung — verifiable, relied upon directly. */
export const CONFIDENCE_HIGHEST = "#34d399";
/** Second rung — sound, with a disclosed derivation or a stated limitation. */
export const CONFIDENCE_HIGH = "#38bdf8";
/** Third rung — usable, but provisional. */
export const CONFIDENCE_MEDIUM = "#fbbf24";
/** Weakest rung — flagged, never presented as settled. */
export const CONFIDENCE_LOWEST = "#fb7185";

/** The values every product shares. A product adds to this set in its own
 *  `_tokens.ts` (with a reason), never silently at a call site. */
export const BASE_PALETTE = {
  BG,
  SURFACE,
  GOLD,
  GOLD_BRIGHT,
  GOLD_DEEP,
  GOLD_DARK,
  FOREGROUND,
  MUTED,
  TEXT_FAINT,
  CONFIDENCE_HIGHEST,
  CONFIDENCE_HIGH,
  CONFIDENCE_MEDIUM,
  CONFIDENCE_LOWEST,
} as const;
