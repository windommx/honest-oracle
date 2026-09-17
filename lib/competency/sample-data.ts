import type { Scores } from "./scoring";

// ╔══════════════════════════════════════════════════════════════════╗
// ║  SAMPLE DATA — the seven nurses on the workbook's Analysis sheet,  ║
// ║  assessed 20 Dec 2019 (วันที่ 20/12/62 on the OUTCOME sheet).       ║
// ║  Points are the sheet's per-criterion scores ÷ 2.                  ║
// ║                                                                    ║
// ║  Provenance notes (kept so nobody "fixes" the data to match the    ║
// ║  wrong sheet):                                                     ║
// ║   · OUTCOME lists ชินภัทร์ at 44 but Analysis sums to 46 — we keep  ║
// ║     the per-criterion Analysis values, which are the primary data. ║
// ║   · OUTCOME leaves จารุวรรณ's total blank; Analysis gives 68.       ║
// ║   · พัลลภา and พรชัย appear on Analysis only (no nickname there).   ║
// ║   · The sheet does not name the assessor, so none is invented.     ║
// ╚══════════════════════════════════════════════════════════════════╝

export interface SampleNurse {
  fullName: string;
  nickname: string | null;
  position: string;
  /** Points 1-5 for criteria 1..10, in order. */
  points: [number, number, number, number, number, number, number, number, number, number];
}

export const SAMPLE_ASSESS_DATE = "2019-12-20";
export const SAMPLE_NOTE = "นำเข้าจากไฟล์ต้นฉบับ (แผ่น Analysis, ประเมิน 20 ธ.ค. 2562)";

export const SAMPLE_NURSES: readonly SampleNurse[] = [
  { fullName: "คุณจารุวรรณ พันธ์ยาง", nickname: "ตั๊ก", position: "พยาบาลวิชาชีพ", points: [3, 4, 3, 3, 2, 3, 4, 4, 4, 4] }, // 68
  { fullName: "คุณศิรินิรันดร์ รวมธรรม", nickname: "มอส", position: "พยาบาลวิชาชีพ", points: [3, 3, 2, 3, 2, 3, 2, 2, 2, 2] }, // 48
  { fullName: "คุณชินภัทร์ อินธิโส", nickname: "อ้น", position: "พยาบาลวิชาชีพ", points: [3, 3, 2, 2, 2, 3, 2, 2, 2, 2] }, // 46
  { fullName: "คุณชุณหกาญจน์ ประหุน", nickname: "ฟิล์ม", position: "พยาบาลวิชาชีพ", points: [1, 1, 4, 3, 1, 2, 2, 2, 3, 2] }, // 42
  { fullName: "คุณสุดารัตน์ ฦาชา", nickname: "เบียร์", position: "พยาบาลวิชาชีพ", points: [3, 2, 3, 3, 1, 1, 2, 1, 2, 2] }, // 40
  { fullName: "คุณพัลลภา", nickname: null, position: "พยาบาลวิชาชีพ", points: [4, 4, 4, 4, 3, 4, 5, 4, 4, 4] }, // 80
  { fullName: "คุณพรชัย", nickname: null, position: "พยาบาลวิชาชีพ", points: [5, 5, 5, 5, 5, 5, 5, 5, 5, 4] }, // 98
];

export function sampleScores(s: SampleNurse): Scores {
  const out: Scores = {};
  s.points.forEach((p, i) => {
    out[String(i + 1)] = p;
  });
  return out;
}
