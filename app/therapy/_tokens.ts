// ╔══════════════════════════════════════════════════════════════════╗
// ║  DESIGN TOKENS for app/therapy — the ONLY hex literals allowed    ║
// ║  here, enforced by _tokens.test.ts exactly as in app/rush.        ║
// ║                                                                    ║
// ║  The base values come from lib/design/tokens.ts, shared with the   ║
// ║  rest of the app. What this file adds is SEMANTIC: two ladders     ║
// ║  that carry meaning a reader has to be able to decode at a glance. ║
// ║                                                                    ║
// ║  A note on reusing the confidence ladder for both. Evidence grade  ║
// ║  and symptom severity are different quantities, but they share a   ║
// ║  valence — green reads "this is solid / this is fine", rose reads  ║
// ║  "look closer" — and a health UI that used a different green for   ║
// ║  each would be teaching the reader two colour languages for no     ║
// ║  gain. What a palette must never do is the inverse: one meaning    ║
// ║  rendered as two values. That is the drift the guard tests catch.  ║
// ╚══════════════════════════════════════════════════════════════════╝

import {
  BG,
  SURFACE,
  GOLD,
  GOLD_BRIGHT,
  GOLD_DEEP,
  FOREGROUND,
  MUTED,
  TEXT_FAINT,
  CONFIDENCE_HIGHEST,
  CONFIDENCE_HIGH,
  CONFIDENCE_MEDIUM,
  CONFIDENCE_LOWEST,
} from "@/lib/design/tokens";
import type { EvidenceGrade, SeverityBand } from "@/lib/therapy-engine/types";

export { BG, SURFACE, GOLD, GOLD_BRIGHT, GOLD_DEEP, FOREGROUND, MUTED, TEXT_FAINT };

/** Crisis. Deliberately NOT the rose that marks weak evidence: the banner that
 *  carries a suicide hotline has to dominate the page, and a colour the eye has
 *  already learned to read as "minor footnote" would bury it. One shade deeper,
 *  used for exactly one thing. */
export const CRISIS = "#f43f5e";

/** Severity of a screening score. Five rungs because PHQ-9 has five bands; four
 *  of them reuse the shared ladder, and the fifth (moderately severe) needs its
 *  own step between amber and rose or the top of the scale flattens. */
export const SEVERITY_COLOR: Record<SeverityBand["id"], string> = {
  minimal: CONFIDENCE_HIGHEST,
  mild: CONFIDENCE_HIGH,
  moderate: CONFIDENCE_MEDIUM,
  moderatelySevere: "#fb923c",
  severe: CONFIDENCE_LOWEST,
};

/** Strength of the evidence behind an intervention. The same four rungs as
 *  Rush's epistemic tiers, because they encode the same idea: how much weight
 *  this claim can bear. */
export const GRADE_COLOR: Record<EvidenceGrade, string> = {
  strong: CONFIDENCE_HIGHEST,
  good: CONFIDENCE_HIGH,
  moderate: CONFIDENCE_MEDIUM,
  emerging: CONFIDENCE_LOWEST,
};

/** Every hex literal permitted in app/therapy. Adding a colour means adding it
 *  HERE first, with a reason — which makes it a decision instead of an accident. */
export const PALETTE = {
  BG,
  SURFACE,
  GOLD,
  GOLD_BRIGHT,
  GOLD_DEEP,
  FOREGROUND,
  MUTED,
  TEXT_FAINT,
  CRISIS,
  SEVERITY_MINIMAL: SEVERITY_COLOR.minimal,
  SEVERITY_MILD: SEVERITY_COLOR.mild,
  SEVERITY_MODERATE: SEVERITY_COLOR.moderate,
  SEVERITY_MODERATELY_SEVERE: SEVERITY_COLOR.moderatelySevere,
  SEVERITY_SEVERE: SEVERITY_COLOR.severe,
} as const;

/** Lower-cased hex set for the guard test. */
export const ALLOWED_HEX: ReadonlySet<string> = new Set(
  Object.values(PALETTE).map((h) => h.toLowerCase())
);
