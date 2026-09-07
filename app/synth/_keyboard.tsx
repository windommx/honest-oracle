"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GOLD, KEY_BLACK, KEY_WHITE, TEXT_FAINT } from "./_tokens";

// A playable keyboard: mouse/touch on the keys, and the QWERTY row mapped the
// way trackers and soft synths have mapped it for decades.
//
// Accessibility note: the keys are buttons, so they are tabbable and operable
// with Enter/Space. A 36-key keyboard is a lot of tab stops, so the whole
// instrument is also playable from the computer keyboard without tabbing at all.

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const BLACK = new Set([1, 3, 6, 8, 10]);

/** QWERTY → semitone offset. Two rows, an octave apart, as on a tracker. */
const KEY_MAP: Record<string, number> = {
  a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11,
  k: 12, o: 13, l: 14, p: 15, ";": 16, "'": 17,
};

export interface KeyboardProps {
  octave: number;
  onOctaveChange: (o: number) => void;
  onNoteOn: (note: number, velocity: number) => void;
  onNoteOff: (note: number) => void;
  /** Notes currently sounding, so the display matches what is heard. */
  held: ReadonlySet<number>;
  octaves?: number;
}

export function Keyboard({ octave, onOctaveChange, onNoteOn, onNoteOff, held, octaves = 3 }: KeyboardProps) {
  const [pointerDown, setPointerDown] = useState(false);
  // Which notes THIS component started, so a computer-key release cannot stop a
  // note the mouse is still holding and vice versa.
  const fromKeyboard = useRef(new Set<string>());

  const first = octave * 12;
  const count = octaves * 12;
  const notes = Array.from({ length: count }, (_, i) => first + i);
  const whiteNotes = notes.filter((n) => !BLACK.has(n % 12));

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      // Never swallow keys aimed at a control — the knobs use arrows, and a
      // text field would otherwise play notes instead of typing.
      if (target && (target.tagName === "INPUT" || target.tagName === "SELECT" || target.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const key = e.key.toLowerCase();
      if (key === "z") {
        e.preventDefault();
        onOctaveChange(Math.max(0, octave - 1));
        return;
      }
      if (key === "x") {
        e.preventDefault();
        onOctaveChange(Math.min(8, octave + 1));
        return;
      }
      const offset = KEY_MAP[key];
      if (offset === undefined || e.repeat || fromKeyboard.current.has(key)) return;
      e.preventDefault();
      fromKeyboard.current.add(key);
      onNoteOn(first + offset, 0.85);
    };

    const up = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const offset = KEY_MAP[key];
      if (offset === undefined || !fromKeyboard.current.has(key)) return;
      fromKeyboard.current.delete(key);
      onNoteOff(first + offset);
    };

    // A held key whose keyup lands on another window (alt-tab) would otherwise
    // sound forever.
    const blur = () => {
      fromKeyboard.current.forEach((key) => onNoteOff(first + KEY_MAP[key]));
      fromKeyboard.current.clear();
    };

    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      blur();
    };
  }, [first, octave, onNoteOn, onNoteOff, onOctaveChange]);

  useEffect(() => {
    const up = () => setPointerDown(false);
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, []);

  const press = useCallback(
    (note: number, e: React.PointerEvent) => {
      // Velocity from where the key was struck: near the pivot is quieter, as
      // on a weighted keyboard. A tiny thing that makes it feel less like a
      // grid of buttons.
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const depth = (e.clientY - rect.top) / rect.height;
      onNoteOn(note, 0.55 + Math.min(Math.max(depth, 0), 1) * 0.45);
    },
    [onNoteOn]
  );

  const whiteWidth = 100 / whiteNotes.length;

  return (
    <div>
      <div className="flex items-center justify-between mb-2 text-[0.7rem]" style={{ color: TEXT_FAINT }}>
        <span>
          อ็อกเทฟ {octave} — เล่นด้วยแถว <kbd>A</kbd>–<kbd>L</kbd> · <kbd>Z</kbd>/<kbd>X</kbd> เปลี่ยนอ็อกเทฟ
        </span>
        <span className="tabular-nums">{held.size > 0 ? `${held.size} โน้ต` : "—"}</span>
      </div>

      <div className="relative h-28 select-none rounded-lg overflow-hidden border border-white/10">
        {/* White keys lay out the row; black keys are positioned over the seams. */}
        <div className="flex h-full">
          {whiteNotes.map((note) => {
            const on = held.has(note);
            return (
              <button
                key={note}
                type="button"
                aria-label={`${NOTE_NAMES[note % 12]}${Math.floor(note / 12) - 1}`}
                aria-pressed={on}
                onPointerDown={(e) => {
                  setPointerDown(true);
                  press(note, e);
                }}
                onPointerUp={() => onNoteOff(note)}
                onPointerEnter={(e) => pointerDown && press(note, e)}
                onPointerLeave={() => held.has(note) && onNoteOff(note)}
                className="flex-1 border-r border-black/30 last:border-r-0 transition-colors flex items-end justify-center pb-1"
                style={{ backgroundColor: on ? GOLD : KEY_WHITE }}
              >
                <span className="text-[0.55rem] text-black/40">
                  {note % 12 === 0 ? `C${Math.floor(note / 12) - 1}` : ""}
                </span>
              </button>
            );
          })}
        </div>

        <div className="absolute inset-0 pointer-events-none">
          {notes.map((note) => {
            if (!BLACK.has(note % 12)) return null;
            const whitesBefore = notes.filter((n) => n < note && !BLACK.has(n % 12)).length;
            const on = held.has(note);
            return (
              <button
                key={note}
                type="button"
                aria-label={`${NOTE_NAMES[note % 12]}${Math.floor(note / 12) - 1}`}
                aria-pressed={on}
                onPointerDown={(e) => {
                  setPointerDown(true);
                  press(note, e);
                }}
                onPointerUp={() => onNoteOff(note)}
                onPointerEnter={(e) => pointerDown && press(note, e)}
                onPointerLeave={() => held.has(note) && onNoteOff(note)}
                className="absolute top-0 h-[62%] rounded-b pointer-events-auto border border-black/40 transition-colors"
                style={{
                  left: `calc(${whitesBefore * whiteWidth}% - ${whiteWidth * 0.3}%)`,
                  width: `${whiteWidth * 0.6}%`,
                  backgroundColor: on ? GOLD : KEY_BLACK,
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
