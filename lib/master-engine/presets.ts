// Starting points. Each one says what it is FOR and what it does — a preset
// whose description is an adjective is a preset nobody can choose between.

import { DEFAULT_MASTER, NEUTRAL, defaultEqBands, type MasterSettings } from "./types";

export interface MasterPreset {
  id: string;
  name: string;
  /** What it is for, and what it actually changes. */
  note: string;
  settings: MasterSettings;
}

const from = (over: Partial<MasterSettings>): MasterSettings => ({
  ...DEFAULT_MASTER,
  ...over,
  eq: (over.eq ?? defaultEqBands()).map((b) => ({ ...b })),
});

export const MASTER_PRESETS: MasterPreset[] = [
  {
    id: "bypass",
    name: "Bypass",
    note: "ทุกชั้นปิด — ใช้เทียบว่าอะไรคือเสียงต้นฉบับจริง ๆ",
    settings: { ...NEUTRAL, eq: defaultEqBands() },
  },
  {
    id: "transparent",
    name: "Transparent",
    note: "ตัดเสียงต่ำ จำกัดยอดคลื่น แล้วหยุด — ไม่แต่งโทนเลย",
    settings: from({
      bass: 0, mud: 0, mid: 0, treble: 0,
      punch: 0, warmth: 0, analogLife: 0,
      deChirp: 0, deEsser: 0, oddExciter: 0, evenExciter: 0,
      consoleModel: "clean", monoLow: 0.3, monoHigh: 0, width: 0.5,
      masterVolDb: 0,
    }),
  },
  {
    id: "streaming",
    name: "Streaming",
    note: "เล็งที่ -14 LUFS เพดาน -1 dB ตามที่แพลตฟอร์มปรับระดับ",
    settings: from({
      bass: 0.8, mud: -1.2, mid: 0.3, treble: 1.2,
      punch: 0.5, warmth: 0.5, analogLife: 0.3,
      deEsser: 0.3, deChirp: 0.2, oddExciter: 0.2, evenExciter: 0.35,
      consoleModel: "console", monoLow: 0.4, monoHigh: 0.3, width: 0.55,
      masterVolDb: 2, ceilingDb: -1,
    }),
  },
  {
    id: "club",
    name: "Club",
    note: "เบสโมโนแน่น ทรานเซียนต์ชัด ดังแบบระบบเสียงใหญ่",
    settings: from({
      bass: 2, mud: -2, mid: 0, treble: 1,
      punch: 0.75, warmth: 0.55, analogLife: 0.2,
      deEsser: 0.25, deChirp: 0.15, oddExciter: 0.35, evenExciter: 0.3,
      consoleModel: "console", monoLow: 0.85, monoHigh: 0.2, width: 0.6,
      masterVolDb: 4.5, ceilingDb: -0.3,
    }),
  },
  {
    id: "tape",
    name: "Tape",
    note: "ฮาร์มอนิกคี่ ปลายเสียงสูงนุ่มลง และเสียงวืดวาดของเครื่องจริง",
    settings: from({
      bass: 1.5, mud: -1, mid: 0.4, treble: 0.5,
      punch: 0.35, warmth: 0.85, analogLife: 0.75, tapeHiss: 0.25,
      deEsser: 0.3, deChirp: 0.3, oddExciter: 0.15, evenExciter: 0.2,
      consoleModel: "tape", monoLow: 0.5, monoHigh: 0.35, width: 0.55,
      masterVolDb: 2,
    }),
  },
  {
    id: "vocal",
    name: "Vocal Forward",
    note: "ดันย่านกลาง กด ess แรงขึ้น สำหรับงานที่เสียงร้องเป็นพระเอก",
    settings: from({
      bass: 0.5, mud: -2.5, mid: 2, treble: 1,
      punch: 0.4, warmth: 0.5, analogLife: 0.3,
      deEsser: 0.6, deChirp: 0.25, oddExciter: 0.15, evenExciter: 0.45,
      consoleModel: "tube", monoLow: 0.35, monoHigh: 0.25, width: 0.5,
      masterVolDb: 2,
    }),
  },
  {
    id: "warm",
    name: "Warm",
    note: "หลอดกับหม้อแปลง — ฮาร์มอนิกคู่ ปลายบนไม่แข็ง",
    settings: from({
      bass: 2, mud: -0.5, mid: 0.5, treble: -0.5,
      punch: 0.3, warmth: 0.9, analogLife: 0.55,
      deEsser: 0.35, deChirp: 0.35, oddExciter: 0.05, evenExciter: 0.7,
      consoleModel: "transformer", monoLow: 0.45, monoHigh: 0.5, width: 0.5,
      masterVolDb: 2,
    }),
  },
  {
    id: "restore",
    name: "Restore",
    note: "สำหรับไฟล์ที่ผ่านการบีบมาแล้ว — ลดเสียงจิ๊บและ ess ก่อนอย่างอื่น",
    settings: from({
      bass: 1, mud: -1.5, mid: 0.5, treble: 0.5,
      punch: 0.6, warmth: 0.3, analogLife: 0.15,
      deEsser: 0.55, deChirp: 0.7, oddExciter: 0.1, evenExciter: 0.5,
      consoleModel: "tube", monoLow: 0.5, monoHigh: 0.4, width: 0.5,
      masterVolDb: 1.5,
    }),
  },
  {
    id: "broadcast",
    name: "Broadcast",
    note: "เล็งที่ -23 LUFS ตาม EBU R128 ความกว้างระวังการฟังแบบโมโน",
    settings: from({
      bass: 0, mud: -1, mid: 1, treble: 0.5,
      punch: 0.3, warmth: 0.2, analogLife: 0,
      deEsser: 0.45, deChirp: 0.25, oddExciter: 0, evenExciter: 0.2,
      consoleModel: "clean", monoLow: 0.6, monoHigh: 0.5, width: 0.45,
      masterVolDb: -2, ceilingDb: -1,
    }),
  },
];

export function getMasterPreset(id: string): MasterPreset | undefined {
  return MASTER_PRESETS.find((p) => p.id === id);
}
