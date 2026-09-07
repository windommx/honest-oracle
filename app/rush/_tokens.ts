// ╔══════════════════════════════════════════════════════════════════╗
// ║  DESIGN TOKENS for app/rush — the ONLY hex literals allowed here. ║
// ║                                                                    ║
// ║  The values themselves moved to lib/design/tokens.ts once a second ║
// ║  product (app/therapy) needed the same palette: copying the hexes  ║
// ║  across folders would have recreated the very drift this file was  ║
// ║  written to end. That file carries the reasoning behind each       ║
// ║  value (the WCAG measurements, the two-backgrounds bug); this one  ║
// ║  keeps what is Rush-specific and, crucially, keeps the GUARD.      ║
// ║                                                                    ║
// ║  The companion test (_tokens.test.ts) scans app/rush and FAILS on  ║
// ║  any hex outside PALETTE below, so consistency is enforced rather  ║
// ║  than merely intended — the same move as every other guard here.   ║
// ╚══════════════════════════════════════════════════════════════════╝

import {
  BG,
  SURFACE,
  GOLD,
  GOLD_BRIGHT,
  GOLD_DEEP,
  GOLD_DARK,
  FOREGROUND,
  MUTED,
  TEXT_FAINT,
  TEXT_CONTRAST,
  CONFIDENCE_HIGHEST,
  CONFIDENCE_HIGH,
  CONFIDENCE_MEDIUM,
  CONFIDENCE_LOWEST,
} from "@/lib/design/tokens";

export { BG, SURFACE, GOLD, GOLD_BRIGHT, GOLD_DEEP, GOLD_DARK, FOREGROUND, MUTED, TEXT_FAINT, TEXT_CONTRAST };

/** Print/paper foreground — the manuscript preview only, where the surface is light.
 *  Rush-specific: no other product renders a page of prose on paper. */
export const PAPER = "#f0ece4";

// ── Epistemic tier colours ─────────────────────────────────────────────────────
// One rung each of the shared confidence ladder (lib/design/tokens.ts), named for
// the tier in epistemics.ts that it encodes. They were once duplicated verbatim
// across _components.tsx and honesty/page.tsx — two copies of a meaning is exactly
// how a palette rots.
/** ประจักษ์ — direct count. */
export const TIER_DIRECT = CONFIDENCE_HIGHEST;
/** อนุมาน — derived by disclosed formula. */
export const TIER_DERIVED = CONFIDENCE_HIGH;
/** สัญญา — heuristic label. */
export const TIER_HEURISTIC = CONFIDENCE_MEDIUM;
/** อวิสัย — refused. */
export const TIER_REFUSED = CONFIDENCE_LOWEST;

/** Every hex literal permitted in app/rush. The guard test enforces this list.
 *  Adding a colour means adding it HERE first, with a reason — which is the point:
 *  it makes a new value a deliberate decision instead of an accident. */
export const PALETTE = {
  BG,
  SURFACE,
  GOLD,
  GOLD_BRIGHT,
  GOLD_DEEP,
  GOLD_DARK,
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
