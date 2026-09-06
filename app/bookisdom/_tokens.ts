// ╔══════════════════════════════════════════════════════════════════╗
// ║  DESIGN TOKENS — the canonical palette, and the ONLY hex literals  ║
// ║  allowed in app/bookisdom.                                         ║
// ║                                                                    ║
// ║  THEME (2026-09, third pass): "InkStudio Light Blue" — a 1:1      ║
// ║  reference scale (brand #3c74d4 / #2563eb / #1d4ed8, ink #111827, ║
// ║  gray 600/700, border #e5e7eb) on a pastel MESH ground (mint       ║
// ║  #b6ddc1 top-left → white → orchid #f3d9f0 bottom-right on #f8f8f8)║
// ║  — one look for the whole platform. It replaces the gold theme.    ║
// ║                                                                    ║
// ║  Mandates were ACCEPTED only where they clear WCAG AA — measured   ║
// ║  with this repo's own contrast maths (_contrast.test.ts), and the  ║
// ║  mesh corners are counted as surfaces because text does land on   ║
// ║  them (eyebrows, section labels, page intros):                     ║
// ║   · reference link blue #2563eb measures 3.47:1 on the mint corner ║
// ║     and 3.88:1 on a black/10 overlay — REFUSED for text. Accent    ║
// ║     TEXT is #1d4ed8 (blue-700): 6.31:1 on the ground, worst case   ║
// ║     4.50:1 on mint.                                                ║
// ║   · the reference button #3c74d4 is kept as the FILL — WHITE text  ║
// ║     on it is 4.52:1, ink on it 3.92:1, so button text is white     ║
// ║     (the inverse of the gold theme, for the same arithmetic).      ║
// ║   · reference muted gray-500 #6b7280 measures 3.25:1 on mint —     ║
// ║     REFUSED; faint text is gray-600 #4b5563 (worst 5.07:1) and     ║
// ║     muted is gray-700 #374151, still visibly two tiers.            ║
// ║   · TIER_DERIVED leaves blue-700 (now the brand) for sky-800.      ║
// ║                                                                    ║
// ║  The companion test (_tokens.test.ts) scans app/bookisdom and FAILS║
// ║  on any hex outside this set; _contrast.test.ts recomputes every   ║
// ║  ratio recorded here. Consistency is enforced, not intended.       ║
// ╚══════════════════════════════════════════════════════════════════╝

/** Page ground — the mesh base. The body paints the mint/orchid glows over it (globals.css);
 *  MESH_GREEN and MESH_PINK below are measured as surfaces in their own right. */
export const BG = "#f8f8f8";

/** Card / primary surface — white. */
export const SURFACE = "#ffffff";

/** Elevated / secondary surface: nav bars, search pills, inset panels (gray-100). */
export const ELEVATED = "#f3f4f6";

/** Hairline border (gray-200, the reference's border-default). */
export const BORDER = "#e5e7eb";

/** Accent for TEXT, icons and borders — blue-700. See header for why not #2563eb. */
export const ACCENT = "#1d4ed8";

/** Accent FILL for buttons, badges, chips — the reference's button blue. WHITE text on it
 *  (4.52:1); never dark text (3.92:1). */
export const ACCENT_BRIGHT = "#3c74d4";

/** Fill hover / far gradient stop (white text 5.54:1). */
export const ACCENT_DEEP = "#3366bf";

/** Darkest accent — hover state for accent TEXT (blue-800, 8.21:1 on the ground). */
export const ACCENT_DARK = "#1e40af";

/** Pale accent tint — chip backgrounds (the reference's blue-50 "bg-blue-accent"). */
export const ACCENT_TINT = "#eff6ff";

/** Default foreground — ink (gray-900, 16.7:1 on the ground). */
export const FOREGROUND = "#111827";

/** Print/paper foreground — the manuscript preview, which previews PAPER. */
export const PAPER = "#f0ece4";

/** Muted foreground (gray-700). 9.71:1 on the ground, ≥6.9:1 on every surface. */
export const MUTED = "#374151";

/** Faintest text tier (gray-600). Worst case 5.07:1 on the mint corner; the reference's
 *  gray-500 was refused (3.25:1 there). Still visibly fainter than MUTED. */
export const TEXT_FAINT = "#4b5563";

/** Mesh glow colours — measured from the reference image; drawn only by the body. */
export const MESH_GREEN = "#b6ddc1";
export const MESH_PINK = "#f3d9f0";

/** Measured WCAG contrast of each text tier against BG. Recomputed by _contrast.test.ts —
 *  these are recorded so the choice is auditable, not asserted from memory. */
export const TEXT_CONTRAST = {
  "slate-600": 7.14,
  "slate-700": 9.75,
  "slate-800": 13.77,
  TEXT_FAINT: 7.12, // on BG; worst case across all surfaces is 5.07:1 (mint)
} as const;

// ── Epistemic tier colours ─────────────────────────────────────────────────────
// SEMANTIC, not decorative: each encodes one tier from epistemics.ts. Blue-700 became the
// brand, so the derived tier moved to sky-800; each measured ≥6:1 on the ground.
/** ประจักษ์ — direct count (green-800, 6.71:1 on the ground). */
export const TIER_DIRECT = "#166534";
/** อนุมาน — derived by disclosed formula (sky-800, 7.12:1). */
export const TIER_DERIVED = "#075985";
/** สัญญา — heuristic label (amber-800, 6.68:1). */
export const TIER_HEURISTIC = "#92400e";
/** อวิสัย — refused (red-700, 6.09:1). */
export const TIER_REFUSED = "#b91c1c";

/** Every hex literal permitted in app/bookisdom. The guard test enforces this list.
 *  Adding a colour means adding it HERE first, with a reason — which is the point:
 *  it makes a new value a deliberate decision instead of an accident. */
export const PALETTE = {
  BG, SURFACE, ELEVATED, BORDER,
  ACCENT, ACCENT_BRIGHT, ACCENT_DEEP, ACCENT_DARK, ACCENT_TINT,
  FOREGROUND, PAPER, MUTED, TEXT_FAINT,
  MESH_GREEN, MESH_PINK,
  TIER_DIRECT, TIER_DERIVED, TIER_HEURISTIC, TIER_REFUSED,
} as const;

/** Lower-cased hex set for the guard test. */
export const ALLOWED_HEX: ReadonlySet<string> = new Set(
  Object.values(PALETTE).map((h) => h.toLowerCase())
);
