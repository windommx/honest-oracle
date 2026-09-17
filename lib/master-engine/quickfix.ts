// ╔══════════════════════════════════════════════════════════════════╗
// ║  QUICK FIX — four buttons that nudge, rather than four presets.   ║
// ║                                                                    ║
// ║  Each one applies a small RELATIVE change to whatever is already   ║
// ║  set, so pressing BASS twice does twice as much and pressing it    ║
// ║  on a loaded preset does not throw the preset away. A button that  ║
// ║  silently replaced the whole state would be a preset wearing a     ║
// ║  nudge's clothes, and the operator would lose work to it.          ║
// ║                                                                    ║
// ║  Every step is bounded, so holding a button cannot run a control   ║
// ║  off the end of its range.                                         ║
// ╚══════════════════════════════════════════════════════════════════╝

import { TONE_RANGE_DB, type MasterSettings, type MasterUpdate } from "./types";

export const QUICK_FIX_IDS = ["stereo", "bass", "mid", "high"] as const;
export type QuickFixId = (typeof QUICK_FIX_IDS)[number];

export interface QuickFix {
  id: QuickFixId;
  label: string;
  /** What one press does, in words the operator can check against the knobs. */
  note: string;
}

export const QUICK_FIXES: QuickFix[] = [
  { id: "stereo", label: "STEREO", note: "กว้างขึ้นเล็กน้อย + ดึงเบสเข้ากลางมากขึ้น" },
  { id: "bass", label: "BASS", note: "เพิ่มเบส +1 dB และลดย่านอื้อลง" },
  { id: "mid", label: "MID", note: "เพิ่มย่านกลาง +1 dB" },
  { id: "high", label: "HIGH", note: "เพิ่มเสียงแหลม +1 dB และเติมฮาร์มอนิกคู่" },
];

const STEP_DB = 1;
const STEP_AMOUNT = 0.08;

const clampDb = (v: number) => Math.min(TONE_RANGE_DB, Math.max(-TONE_RANGE_DB, Number(v.toFixed(2))));
const clamp01 = (v: number) => Math.min(1, Math.max(0, Number(v.toFixed(3))));

/** The change one press makes. Returns a partial so the caller can show a diff
 *  rather than only the result. */
export function quickFix(id: QuickFixId, current: MasterSettings): MasterUpdate {
  switch (id) {
    case "stereo":
      return {
        width: clamp01(current.width + STEP_AMOUNT),
        // Widening without tightening the bottom is how a master ends up
        // sounding huge on headphones and thin everywhere else.
        monoLow: clamp01(current.monoLow + STEP_AMOUNT),
      };
    case "bass":
      return {
        bass: clampDb(current.bass + STEP_DB),
        mud: clampDb(current.mud - STEP_DB * 0.5),
      };
    case "mid":
      return { mid: clampDb(current.mid + STEP_DB) };
    case "high":
      return {
        treble: clampDb(current.treble + STEP_DB),
        evenExciter: clamp01(current.evenExciter + STEP_AMOUNT),
      };
  }
}
