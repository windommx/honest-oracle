// The control surface, declared rather than laid out by hand.
//
// Every knob names the settings key it writes, so a control that does nothing
// is impossible to add: _panels.test.ts checks each key exists on
// MasterSettings and that nothing settable is missing from the page.

import { TONE_RANGE_DB, type MasterSettings } from "@/lib/master-engine/types";
import type { MasterGroup } from "./_tokens";

/** Keys a knob can drive: the numeric ones. */
export type KnobKey = {
  [K in keyof MasterSettings]: MasterSettings[K] extends number ? K : never;
}[keyof MasterSettings];

export interface KnobSpec {
  key: KnobKey;
  label: string;
  min: number;
  max: number;
  unit?: string;
  log?: boolean;
  precision?: number;
  /** One line on what it does, shown on hover and to a screen reader. */
  hint: string;
}

export interface MasterPanel {
  title: string;
  group: MasterGroup;
  knobs: KnobSpec[];
}

export const PANELS: MasterPanel[] = [
  {
    title: "TONE",
    group: "tone",
    knobs: [
      { key: "bass", label: "Bass", min: -TONE_RANGE_DB, max: TONE_RANGE_DB, unit: "dB", hint: "ชั้นเสียงต่ำที่ 90 Hz" },
      { key: "mud", label: "Mud", min: -TONE_RANGE_DB, max: TONE_RANGE_DB, unit: "dB", hint: "ย่าน 320 Hz ที่ทำให้มิกซ์ทึบ — ส่วนใหญ่ใช้ลด" },
      { key: "mid", label: "Mid", min: -TONE_RANGE_DB, max: TONE_RANGE_DB, unit: "dB", hint: "ย่านกลาง 1.4 kHz ที่หูไวที่สุด" },
      { key: "treble", label: "Treble", min: -TONE_RANGE_DB, max: TONE_RANGE_DB, unit: "dB", hint: "ชั้นเสียงสูงที่ 8 kHz" },
    ],
  },
  {
    title: "DYNAMICS",
    group: "dynamics",
    knobs: [
      { key: "punch", label: "Punch", min: 0, max: 1, precision: 2, hint: "ยกหัวเสียงโดยไม่แตะส่วนที่ลากยาว — ตรงข้ามกับคอมเพรสเซอร์" },
      { key: "deEsser", label: "De-Esser", min: 0, max: 1, precision: 2, hint: "กดเฉพาะเสียง ส. ที่ 4.5–11 kHz ผ่านชั้นเสียงสูงแบบไดนามิก" },
      { key: "deChirp", label: "De-Chirp", min: 0, max: 1, precision: 2, hint: "กดเสียงแหลมสั้น ๆ ที่โผล่ขึ้นมาเหนือค่าเฉลี่ยของตัวเอง เหนือ 6 kHz" },
    ],
  },
  {
    title: "CHARACTER",
    group: "character",
    knobs: [
      { key: "warmth", label: "Warmth", min: 0, max: 1, precision: 2, hint: "ปริมาณการอิ่มตัวตามรุ่นคอนโซลที่เลือก" },
      { key: "analogLife", label: "Analog Life", min: 0, max: 1, precision: 2, hint: "ความเพี้ยนของความเร็วและระดับแบบเครื่องจริง" },
      { key: "evenExciter", label: "Even Exciter", min: 0, max: 1, precision: 2, hint: "สร้างฮาร์มอนิกที่สองจากย่านเหนือ 3 kHz — ฟังเป็นประกาย" },
      { key: "oddExciter", label: "Odd Exciter", min: 0, max: 1, precision: 2, hint: "สร้างฮาร์มอนิกที่สาม — ฟังเป็นความคม" },
      { key: "tapeHiss", label: "Tape Hiss", min: 0, max: 1, precision: 2, hint: "พื้นเสียงซ่าแบบเทป สูงสุด -55 dBFS" },
    ],
  },
  {
    title: "STEREO",
    group: "stereo",
    knobs: [
      { key: "monoLow", label: "Mono Low", min: 0, max: 1, precision: 2, hint: "รวมเสียงต่ำเป็นโมโน ถึง 300 Hz ที่สุดทาง" },
      { key: "monoHigh", label: "Mono High", min: 0, max: 1, precision: 2, hint: "รวมเสียงสูงเป็นโมโน ลงมาถึง 4 kHz ที่สุดทาง" },
      { key: "width", label: "Width", min: 0, max: 1, precision: 2, hint: "0.5 คือไม่แตะ ต่ำกว่านั้นแคบลง สูงกว่ากว้างขึ้น — ผลรวมโมโนไม่เปลี่ยน" },
    ],
  },
  {
    title: "OUTPUT",
    group: "output",
    knobs: [
      { key: "masterVolDb", label: "Master Vol", min: -24, max: 12, unit: "dB", precision: 1, hint: "เกนก่อนเข้าลิมิเตอร์" },
      { key: "ceilingDb", label: "Ceiling", min: -3, max: 0, unit: "dB", precision: 1, hint: "เพดานที่ลิมิเตอร์รับประกัน (ต่อแซมเปิล)" },
      { key: "fadeInSeconds", label: "Fade In", min: 0, max: 30, unit: "s", precision: 2, hint: "ใส่ตอนบันทึกไฟล์ ไม่ใช่ตอนเล่น" },
      { key: "fadeOutSeconds", label: "Fade Out", min: 0, max: 30, unit: "s", precision: 2, hint: "โค้งยกกำลังเท่า ไม่ใช่เส้นตรง" },
    ],
  },
];

export const ALL_KNOBS: KnobSpec[] = PANELS.flatMap((p) => p.knobs);
