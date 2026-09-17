// ╔══════════════════════════════════════════════════════════════════╗
// ║  DESIGN TOKENS — HD Competency is the suite's one LIGHT module:    ║
// ║  a ward tool that gets printed and read on hospital PCs, not a    ║
// ║  dark marketing surface. Every colour a text can take here was    ║
// ║  measured against every surface it lands on (see _contrast.test)  ║
// ║  before it was chosen — recorded, not asserted:                   ║
// ║   · slate-500 (#64748b) reads 4.34:1 on the tinted cards → NOT    ║
// ║     used for normal text; slate-600 (6.9:1 worst case) is the     ║
// ║     secondary tier.                                               ║
// ║   · white on teal-600 is 3.74:1 → primary buttons use teal-700    ║
// ║     (5.47:1).                                                     ║
// ║   · badge text is the -800 shade of its hue on the -50 tint       ║
// ║     (orange-700 on orange-50 was 4.88:1 — fine, but -800 gives    ║
// ║     headroom for the small 12px badge type).                      ║
// ╚══════════════════════════════════════════════════════════════════╝

/** Page background (slate-50) and the raised card (white). */
export const PAGE_BG = "#f8fafc";
export const CARD_BG = "#ffffff";

/** Brand accent for this module — teal-700, the darkest teal that still reads as teal. */
export const ACCENT = "#0f766e";
export const ACCENT_DEEP = "#115e59"; // teal-800, hover
export const ACCENT_TINT = "#f0fdfa"; // teal-50, selected surfaces

/** Text tiers (hex, for SVG fills; the Tailwind names are used in markup). */
export const TEXT_PRIMARY = "#0f172a"; // slate-900
export const TEXT_BODY = "#334155"; // slate-700
export const TEXT_SECONDARY = "#475569"; // slate-600

/** Chart chrome. */
export const GRID = "#e2e8f0"; // slate-200
export const TEAM_SERIES = "#b45309"; // amber-700 — the "team average" overlay on the radar

/** Level badge classes. Text is the -800 shade on the -50 tint of the same hue. */
export const LEVEL_BADGE: Record<number, string> = {
  1: "bg-red-50 text-red-800 border-red-200",
  2: "bg-orange-50 text-orange-800 border-orange-200",
  3: "bg-teal-50 text-teal-800 border-teal-200",
  4: "bg-emerald-50 text-emerald-800 border-emerald-200",
  5: "bg-violet-50 text-violet-800 border-violet-200",
};

/** Solid fills for the per-criterion "pips" and progress bars. */
export const LEVEL_SOLID: Record<number, string> = {
  1: "bg-red-600",
  2: "bg-orange-600",
  3: "bg-teal-600",
  4: "bg-emerald-600",
  5: "bg-violet-600",
};

/** Management-tier badge (amber, so it never reads as a scored level). */
export const MGMT_BADGE = "bg-amber-50 text-amber-800 border-amber-200";

/** Tinted surfaces the badges and callouts draw on — enumerated for the contrast test. */
export const TINTS: Record<string, string> = {
  "slate-50": PAGE_BG,
  "slate-100": "#f1f5f9",
  "teal-50": ACCENT_TINT,
  "red-50": "#fef2f2",
  "orange-50": "#fff7ed",
  "emerald-50": "#ecfdf5",
  "violet-50": "#f5f3ff",
  "amber-50": "#fffbeb",
  white: CARD_BG,
};

/** Text colours used in app/competency markup, by Tailwind name → hex. */
export const TEXT_COLORS: Record<string, string> = {
  "slate-900": TEXT_PRIMARY,
  "slate-700": TEXT_BODY,
  "slate-600": TEXT_SECONDARY,
  "teal-700": ACCENT,
  "teal-800": ACCENT_DEEP,
  "red-700": "#b91c1c",
  "red-800": "#991b1b",
  "orange-800": "#9a3412",
  "emerald-800": "#065f46",
  "violet-800": "#5b21b6",
  "amber-800": "#92400e",
};

/** Solid button surfaces that carry WHITE text. */
export const SOLID_WITH_WHITE_TEXT: Record<string, string> = {
  "teal-700": ACCENT,
  "red-700": "#b91c1c",
  "slate-900": TEXT_PRIMARY,
};
