// ╔══════════════════════════════════════════════════════════════════╗
// ║  DESIGN TOKENS — the canonical palette, and the ONLY hex literals  ║
// ║  allowed in app/bookisdom.                                              ║
// ║                                                                    ║
// ║  THEME: premium dark fintech (deep-navy ground, purple accent),    ║
// ║  migrated from the original gold theme against a mandated palette. ║
// ║  Mandates were ACCEPTED only where they clear WCAG AA — measured   ║
// ║  with this repo's own contrast maths, not assumed:                 ║
// ║   · Accent was mandated #a855f7 → measured 4.39:1 on SURFACE       ║
// ║     (fails AA for text on cards). Nudged to #ab5bf7 (4.61 worst),  ║
// ║     visually indistinguishable, arithmetically compliant.          ║
// ║   · "Text Muted #64748b" was mandated → measured 3.18:1 worst-case ║
// ║     (fails AA badly). REFUSED for text; the faint tier is #8290a6, ║
// ║     the same slate hue recalibrated to clear 4.5:1 on ALL surfaces.║
// ║   · White-on-accent measured 3.96:1 → button text is dark, never   ║
// ║     white (5.31:1 for near-black on accent).                       ║
// ║                                                                    ║
// ║  The companion test (_tokens.test.ts) scans app/bookisdom and FAILS on  ║
// ║  any hex outside this set; _contrast.test.ts recomputes every      ║
// ║  ratio recorded here. Consistency is enforced, not intended.       ║
// ║                                                                    ║
// ║  The gold palette did not die — it belongs to the ORACLE app       ║
// ║  (see LEGACY_ORACLE_HEX below) and is barred from app/bookisdom.        ║
// ╚══════════════════════════════════════════════════════════════════╝

/** Page background — deep navy-black (mandated #0B0E17). */
export const BG = "#0b0e17";

/** Card / primary surface (mandated #151A27). */
export const SURFACE = "#151a27";

/** Elevated card / secondary surface — one step above SURFACE (mandated #1C2233). */
export const ELEVATED = "#1c2233";

/** Hairline border (mandated #1F2535). Most borders remain white/10 utilities. */
export const BORDER = "#1f2535";

/** The brand accent. Mandate #a855f7 nudged +AA (see header). */
export const ACCENT = "#ab5bf7";

/** Brighter accent: hover, active, emphasis on raised surfaces (7.30:1 on BG). */
export const ACCENT_BRIGHT = "#c084fc";

/** Deep accent — gradient stop only, never standalone text (3.38:1 on BG). */
export const ACCENT_DEEP = "#7c3aed";

/** Darker accent shade — theme scale only, never a page fill. */
export const ACCENT_DARK = "#6d28d9";

/** Default foreground (mandated Text Primary #F8FAFC — softer than pure white). */
export const FOREGROUND = "#f8fafc";

/** Print/paper foreground — the manuscript preview only, where the surface is light.
 *  Deliberately outside the dark theme: it previews PAPER. */
export const PAPER = "#f0ece4";

/** Muted foreground (mandated Text Secondary #94A3B8 = slate-400). 7.52:1 on BG. */
export const MUTED = "#94a3b8";

/** Faintest text tier. The mandate's "Text Muted #64748b" measured 3.18:1 on the
 *  lightest surface (white/10 over BG) and 4.05:1 even on the page — below AA for
 *  normal text, which is what 0.62–0.72rem labels are. Same slate hue, recalibrated
 *  against ALL nine surfaces the app draws on (page, SURFACE, ELEVATED, white/0.02–0.10,
 *  accent/0.06–0.15): worst case 4.67:1, still visibly fainter than MUTED. */
export const TEXT_FAINT = "#8290a6";

/** Measured WCAG contrast of each text tier against BG. Recomputed by _contrast.test.ts —
 *  these are recorded so the choice is auditable, not asserted from memory. */
export const TEXT_CONTRAST = {
  "slate-200": 15.64,
  "slate-300": 12.98,
  "slate-400": 7.52,
  TEXT_FAINT: 5.96, // on BG; worst case across all surfaces is 4.67:1
} as const;

// ── Epistemic tier colours ─────────────────────────────────────────────────────
// SEMANTIC, not decorative: each encodes one tier from epistemics.ts. Re-anchored to
// the theme's own semantic hues (positive/chart-blue/negative); each measured ≥5:1 on BG.
/** ประจักษ์ — direct count (theme positive, 8.46:1). */
export const TIER_DIRECT = "#22c55e";
/** อนุมาน — derived by disclosed formula (theme chart blue, 9.00:1). */
export const TIER_DERIVED = "#38bdf8";
/** สัญญา — heuristic label (amber kept: the theme has no caution hue, 11.55:1). */
export const TIER_HEURISTIC = "#fbbf24";
/** อวิสัย — refused (theme negative, 5.12:1). */
export const TIER_REFUSED = "#ef4444";

/** Every hex literal permitted in app/bookisdom. The guard test enforces this list.
 *  Adding a colour means adding it HERE first, with a reason — which is the point:
 *  it makes a new value a deliberate decision instead of an accident. */
export const PALETTE = {
  BG,
  SURFACE,
  ELEVATED,
  BORDER,
  ACCENT,
  ACCENT_BRIGHT,
  ACCENT_DEEP,
  ACCENT_DARK,
  FOREGROUND,
  PAPER,
  MUTED,
  TEXT_FAINT,
  TIER_DIRECT,
  TIER_DERIVED,
  TIER_HEURISTIC,
  TIER_REFUSED,
} as const;

/** Lower-cased hex set for the guard test. */
export const ALLOWED_HEX: ReadonlySet<string> = new Set(
  Object.values(PALETTE).map((h) => h.toLowerCase())
);

/** The gold palette now belongs ONLY to the oracle app (register/login/oracle pages
 *  and their tailwind `gold` utilities + `.gold-gradient`). Named here so the
 *  tailwind guard can allow it there while app/bookisdom remains barred from using it. */
export const LEGACY_ORACLE_HEX: ReadonlySet<string> = new Set([
  "#c9a84c", "#e6c86a", "#a8893d",
]);
