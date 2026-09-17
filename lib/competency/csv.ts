import { COMPETENCY_LEVELS, CRITERIA, MANAGEMENT_LEVELS } from "./criteria";
import { toDateInputValue } from "./format";
import { levelInfo, scoreKey, scoreOfPoint } from "./scoring";
import type { NurseDTO } from "./types";

// ╔══════════════════════════════════════════════════════════════════╗
// ║  CSV EXPORT — the workbook's OUTCOME sheet, reproduced.            ║
// ║  Column order follows the sheet (ลำดับ · ชื่อ · ชื่อเล่น · คะแนน · ║
// ║  LEVEL 1-5 with the score placed under its band · LEVEL 6-7 by     ║
// ║  role), then the ten per-criterion scores the sheet keeps on its   ║
// ║  Analysis tab. UTF-8 with BOM and CRLF so Excel on Windows opens   ║
// ║  Thai text correctly without an import wizard.                     ║
// ╚══════════════════════════════════════════════════════════════════╝

export const CSV_BOM = "﻿";

/** RFC 4180 quoting: wrap when the cell holds a comma, quote, CR or LF; double inner quotes. */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvRow(cells: ReadonlyArray<string | number | null | undefined>): string {
  return cells.map(csvCell).join(",");
}

export const OUTCOME_HEADERS: readonly string[] = [
  "ลำดับ",
  "ชื่อ-นามสกุล",
  "ชื่อเล่น",
  "ตำแหน่ง",
  "วันที่ประเมิน",
  "คะแนนประเมิน (เต็ม 100)",
  ...COMPETENCY_LEVELS.map((l) => `LEVEL ${l.level} ${l.thName} (${l.band})`),
  ...MANAGEMENT_LEVELS.map((l) => `LEVEL ${l.level} ${l.thName}`),
  "ระดับ",
  "Competency",
  "จำนวนครั้งที่ประเมิน",
  ...CRITERIA.map((c) => `${c.id}. ${c.name} (เต็ม 10)`),
  "ผู้ประเมิน",
  "หมายเหตุ",
];

/**
 * Build the OUTCOME table from the nurse list (each with its latest assessment).
 * Rows keep the order given — the dashboard ranking, by convention.
 */
export function buildOutcomeCsv(nurses: NurseDTO[]): string {
  const lines: string[] = [csvRow(OUTCOME_HEADERS)];
  nurses.forEach((n, i) => {
    const latest = n.latest;
    const level = latest ? levelInfo(latest.level) : null;
    const levelCells = COMPETENCY_LEVELS.map((l) => (latest && latest.level === l.level ? latest.totalScore : ""));
    const mgmtCells = MANAGEMENT_LEVELS.map((l) => (n.mgmtLevel === l.level ? "✓" : ""));
    const criterionCells = CRITERIA.map((c) => {
      const p = latest?.scores[scoreKey(c.id)];
      return typeof p === "number" ? scoreOfPoint(p) : "";
    });
    lines.push(
      csvRow([
        i + 1,
        n.fullName,
        n.nickname ?? "",
        n.position,
        latest ? toDateInputValue(latest.assessDate) : "",
        latest ? latest.totalScore : "",
        ...levelCells,
        ...mgmtCells,
        level ? `LEVEL ${level.level} ${level.thName}` : "ยังไม่ประเมิน",
        level ? level.enName : "",
        n.assessmentCount,
        ...criterionCells,
        latest?.assessor ?? "",
        latest?.note ?? "",
      ])
    );
  });
  return CSV_BOM + lines.join("\r\n") + "\r\n";
}

/** File name for the download; the date is passed in so the builder stays clock-free. */
export function outcomeCsvFilename(day: string): string {
  return `hd-competency-outcome-${day}.csv`;
}
