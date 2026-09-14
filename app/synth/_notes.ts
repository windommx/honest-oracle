// Note naming, shared by the keyboard and the piano roll so a note is called
// the same thing in both places.

export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

const BLACK = new Set([1, 3, 6, 8, 10]);

export function isBlackKey(note: number): boolean {
  return BLACK.has(((note % 12) + 12) % 12);
}

/** Scientific pitch notation: MIDI 60 is C4, the convention every DAW shows. */
export function noteName(note: number): string {
  return `${NOTE_NAMES[((note % 12) + 12) % 12]}${Math.floor(note / 12) - 1}`;
}
