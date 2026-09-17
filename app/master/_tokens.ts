// Design tokens for app/master — the only hex literals allowed here, enforced
// by _tokens.test.ts exactly as in app/rush, app/therapy and app/synth.
//
// The base values are the app-wide palette from lib/design/tokens.ts. What this
// file adds is one semantic scale: a colour per stage of the signal chain, so
// the panel reads as an order of operations rather than as a wall of knobs.

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

export { BG, SURFACE, GOLD, GOLD_BRIGHT, GOLD_DEEP, FOREGROUND, MUTED, TEXT_FAINT };

/** The chain, in the order the audio meets it. */
export type MasterGroup = "tone" | "dynamics" | "character" | "stereo" | "output";

export const GROUP_COLOR: Record<MasterGroup, string> = {
  tone: GOLD,
  dynamics: CONFIDENCE_HIGHEST,
  character: CONFIDENCE_MEDIUM,
  stereo: CONFIDENCE_HIGH,
  output: GOLD_BRIGHT,
};

export const GROUP_LABEL: Record<MasterGroup, string> = {
  tone: "โทนเสียง",
  dynamics: "ไดนามิก",
  character: "คาแรกเตอร์",
  stereo: "สเตอริโอ",
  output: "เอาต์พุต",
};

/** The audit face. Three states, and the colours say the same thing the words
 *  do — a green face never appears next to a finding. */
export const AUDIT_COLOR = {
  ok: CONFIDENCE_HIGHEST,
  caution: GOLD,
  problem: CONFIDENCE_LOWEST,
} as const;

/** Every hex literal permitted in app/master. */
export const PALETTE = {
  BG,
  SURFACE,
  GOLD,
  GOLD_BRIGHT,
  GOLD_DEEP,
  FOREGROUND,
  MUTED,
  TEXT_FAINT,
  GROUP_DYNAMICS: GROUP_COLOR.dynamics,
  GROUP_CHARACTER: GROUP_COLOR.character,
  GROUP_STEREO: GROUP_COLOR.stereo,
  AUDIT_PROBLEM: AUDIT_COLOR.problem,
} as const;

export const ALLOWED_HEX: ReadonlySet<string> = new Set(
  Object.values(PALETTE).map((h) => h.toLowerCase())
);
