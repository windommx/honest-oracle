// ╔══════════════════════════════════════════════════════════════════╗
// ║  DESIGN TOKENS — the canonical palette, and the ONLY hex literals  ║
// ║  allowed in app/bookisdom.                                         ║
// ║                                                                    ║
// ║  THEME (2026-09): light, warm, gold-accented — one look for the    ║
// ║  WHOLE platform (Bookisdom and the lifemap/naming apps alike),     ║
// ║  adopted from a mandated reference screen: pale blue-grey ground   ║
// ║  with a warm glow, white rounded cards, near-black ink, bronze-    ║
// ║  gold accent, green "live" pills. It replaces both the dark        ║
// ║  fintech palette and the dark gold one.                            ║
// ║                                                                    ║
// ║  Mandates were ACCEPTED only where they clear WCAG AA — measured   ║
// ║  with this repo's own contrast maths (_contrast.test.ts):          ║
// ║   · The reference's eyebrow gold (~#9a7418) measures 3.94:1 on the ║
// ║     ground and 4.30:1 on white — REFUSED for text. Accent TEXT is  ║
// ║     #7a5c12: 5.71:1 on the ground, worst case 4.58:1 on the        ║
// ║     darkest overlay in use (black/10).                             ║
// ║   · The reference's badge gold (~#d9a63a) is kept as the FILL for  ║
// ║     buttons and badges — dark ink on it is 8.15:1, white on it     ║
// ║     is 2.22:1, so button text is dark, never white (same rule the  ║
// ║     purple theme had, for the same arithmetic reason).             ║
// ║   · Faint text is #566174: worst case 4.60:1 across the nine       ║
// ║     surfaces the app draws (ground, white, elevated, black/0.02–   ║
// ║     0.10 overlays, gold tints at 15–25 %).                          ║
// ║                                                                    ║
// ║  The companion test (_tokens.test.ts) scans app/bookisdom and FAILS║
// ║  on any hex outside this set; _contrast.test.ts recomputes every   ║
// ║  ratio recorded here. Consistency is enforced, not intended.       ║
// ╚══════════════════════════════════════════════════════════════════╝

/** Page ground — pale blue-grey. The body adds a warm radial glow on top (globals.css)
 *  at ≤16 % gold, which is lighter than the gold tints measured below. */
export const BG = "#f3f5f9";

/** Card / primary surface — white. */
export const SURFACE = "#ffffff";

/** Elevated / secondary surface: nav bars, search pills, inset panels. */
export const ELEVATED = "#eaedf3";

/** Hairline border. Most borders remain black/5–black/15 utilities. */
export const BORDER = "#e2e6ee";

/** Accent for TEXT, icons and borders — bronze gold. See header for why not brighter. */
export const ACCENT = "#7a5c12";

/** Accent FILL for buttons, badges, chips (dark text on it: 8.15:1). Never used as text. */
export const ACCENT_BRIGHT = "#d9a63a";

/** Deeper fill — button hover and the far gradient stop (dark text: 6.43:1). */
export const ACCENT_DEEP = "#c8901f";

/** Darkest accent — hover state for accent TEXT (6.92:1 on the ground). */
export const ACCENT_DARK = "#6b5010";

/** Default foreground — near-black ink (16.6:1 on the ground). */
export const FOREGROUND = "#14161c";

/** Print/paper foreground — the manuscript preview, which previews PAPER. */
export const PAPER = "#f0ece4";

/** Muted foreground (gray-600). 6.92:1 on the ground, ≥5.5:1 on every surface. */
export const MUTED = "#4b5563";

/** Faintest text tier. Recalibrated against ALL surfaces in use — worst case 4.60:1 on a
 *  black/10 overlay — and still visibly fainter than MUTED. */
export const TEXT_FAINT = "#566174";

/** Measured WCAG contrast of each text tier against BG. Recomputed by _contrast.test.ts —
 *  these are recorded so the choice is auditable, not asserted from memory. */
export const TEXT_CONTRAST = {
  "slate-600": 6.94,
  "slate-700": 9.49,
  "slate-800": 13.4,
  TEXT_FAINT: 5.73, // on BG; worst case across all surfaces is 4.60:1
} as const;

// ── Epistemic tier colours ─────────────────────────────────────────────────────
// SEMANTIC, not decorative: each encodes one tier from epistemics.ts. Re-anchored to
// shades that clear AA on a LIGHT ground; each measured ≥4.75:1 on every surface.
/** ประจักษ์ — direct count (green-800, 6.53:1 on the ground). */
export const TIER_DIRECT = "#166534";
/** อนุมาน — derived by disclosed formula (blue-700, 6.14:1). */
export const TIER_DERIVED = "#1d4ed8";
/** สัญญา — heuristic label (amber-800, 6.50:1). */
export const TIER_HEURISTIC = "#92400e";
/** อวิสัย — refused (red-700, 5.93:1). */
export const TIER_REFUSED = "#b91c1c";

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
