// Note naming, shared by the keyboard and the piano roll so a note is called
// the same thing in both places.

export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

/** The top of MIDI. Both the keyboard and the piano roll drew past it — the
 *  keyboard's highest octave spanned 96..131 — which puts keys on screen that
 *  no pattern can name. */
export const MAX_MIDI_NOTE = 127;

/** Highest octave either view will scroll to. Chosen so the piano roll's
 *  13-row window can still reach note 127, which is what makes
 *  octaveContaining() able to keep its promise for every note. */
export const MAX_OCTAVE = 10;

const BLACK = new Set([1, 3, 6, 8, 10]);

export function isBlackKey(note: number): boolean {
  return BLACK.has(((note % 12) + 12) % 12);
}

/** Scientific pitch notation: MIDI 60 is C4, the convention every DAW shows. */
export function noteName(note: number): string {
  return `${NOTE_NAMES[((note % 12) + 12) % 12]}${Math.floor(note / 12) - 1}`;
}
