// Design tokens for app/synth — the only hex literals allowed here, enforced by
// _tokens.test.ts exactly as in app/rush and app/therapy.
//
// The base values are the app-wide palette from lib/design/tokens.ts. What this
// file adds is one semantic scale: a colour per control group, so a reader can
// tell an oscillator knob from a filter knob at a glance without reading labels.

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

/** A piano's white keys. The app palette is entirely dark and has no light
 *  surface — and this one cannot be approximated, because the note labels are
 *  printed on it in black and need real contrast against it. Black keys reuse
 *  SURFACE, the app's existing raised-dark value, rather than inventing a
 *  second near-black. */
export const KEY_WHITE = "#e8e4dc";
export const KEY_BLACK = SURFACE;

/** The instrument's signal path, in order. Each group is coloured so the panel
 *  reads as a chain rather than as a wall of identical knobs. */
export type SynthGroup = "source" | "filter" | "envelope" | "modulation" | "effects" | "master";

export const GROUP_COLOR: Record<SynthGroup, string> = {
  source: CONFIDENCE_HIGH,
  filter: GOLD,
  envelope: CONFIDENCE_HIGHEST,
  modulation: CONFIDENCE_LOWEST,
  effects: CONFIDENCE_MEDIUM,
  master: GOLD_BRIGHT,
};

export const GROUP_LABEL: Record<SynthGroup, string> = {
  source: "แหล่งกำเนิดเสียง",
  filter: "ฟิลเตอร์",
  envelope: "เอนเวโลป",
  modulation: "มอดูเลชัน",
  effects: "เอฟเฟกต์",
  master: "มาสเตอร์",
};

/** Every hex literal permitted in app/synth. */
export const PALETTE = {
  BG,
  SURFACE,
  GOLD,
  GOLD_BRIGHT,
  GOLD_DEEP,
  FOREGROUND,
  MUTED,
  TEXT_FAINT,
  GROUP_SOURCE: GROUP_COLOR.source,
  GROUP_ENVELOPE: GROUP_COLOR.envelope,
  GROUP_MODULATION: GROUP_COLOR.modulation,
  GROUP_EFFECTS: GROUP_COLOR.effects,
  KEY_WHITE,
} as const;

export const ALLOWED_HEX: ReadonlySet<string> = new Set(
  Object.values(PALETTE).map((h) => h.toLowerCase())
);
