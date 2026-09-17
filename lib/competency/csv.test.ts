import { describe, it, expect } from "vitest";
import { buildOutcomeCsv, CSV_BOM, csvCell, csvRow, OUTCOME_HEADERS, outcomeCsvFilename } from "./csv";
import type { NurseDTO } from "./types";

const nurse = (over: Partial<NurseDTO> & Pick<NurseDTO, "id" | "fullName">): NurseDTO => ({
  nickname: null,
  position: "พยาบาลวิชาชีพ",
  mgmtLevel: null,
  createdAt: "2020-01-01T00:00:00.000Z",
  updatedAt: "2020-01-01T00:00:00.000Z",
  assessmentCount: 0,
  latest: null,
  ...over,
});

describe("csvCell / csvRow", () => {
  it("quotes only when needed and doubles inner quotes", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell('he said "hi", then left')).toBe('"he said ""hi"", then left"');
    expect(csvCell("line\nbreak")).toBe('"line\nbreak"');
    expect(csvCell(null)).toBe("");
    expect(csvRow([1, "a,b", null])).toBe('1,"a,b",');
  });
});

describe("buildOutcomeCsv", () => {
  const rows: NurseDTO[] = [
    nurse({
      id: "n1",
      fullName: "คุณจารุวรรณ พันธ์ยาง",
      nickname: "ตั๊ก",
      assessmentCount: 2,
      latest: {
        id: "a1",
        nurseId: "n1",
        assessDate: "2019-12-20T00:00:00.000Z",
        assessor: "หัวหน้าหน่วย",
        note: 'สังเกต: "ดีขึ้น", ต่อเนื่อง',
        scores: { "1": 3, "2": 4, "3": 3, "4": 3, "5": 2, "6": 3, "7": 4, "8": 4, "9": 4, "10": 4 },
        totalScore: 68,
        level: 3,
        createdAt: "2019-12-20T00:00:00.000Z",
        updatedAt: "2019-12-20T00:00:00.000Z",
      },
    }),
    nurse({ id: "n2", fullName: "คุณใหม่", mgmtLevel: 7 }),
  ];

  it("starts with a BOM, uses CRLF, and every row has exactly as many cells as the header", () => {
    const csv = buildOutcomeCsv(rows);
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    const lines = csv.slice(1).split("\r\n").filter(Boolean);
    expect(lines).toHaveLength(3);
    // A small RFC 4180 reader: quoted cells may hold commas and doubled quotes.
    const count = (line: string) => {
      let n = 1;
      let quoted = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (quoted && line[i + 1] === '"') i++;
          else quoted = !quoted;
        } else if (ch === "," && !quoted) n++;
      }
      return n;
    };
    expect(count(lines[0])).toBe(OUTCOME_HEADERS.length);
    expect(count(lines[1])).toBe(OUTCOME_HEADERS.length);
    expect(count(lines[2])).toBe(OUTCOME_HEADERS.length);
  });

  it("places the total under its LEVEL column like the OUTCOME sheet, and writes per-criterion scores", () => {
    const csv = buildOutcomeCsv(rows);
    const row1 = csv.slice(1).split("\r\n")[1];
    // ลำดับ, ชื่อ, ชื่อเล่น, ตำแหน่ง, วันที่, คะแนน, L1, L2, L3, L4, L5, L6, L7, ระดับ, Competency, ครั้ง, c1..c10, ผู้ประเมิน, หมายเหตุ
    expect(row1.startsWith("1,คุณจารุวรรณ พันธ์ยาง,ตั๊ก,พยาบาลวิชาชีพ,2019-12-20,68,,,68,,,,,LEVEL 3 ผู้ปฏิบัติ,Competent,2,6,8,6,6,4,6,8,8,8,8,หัวหน้าหน่วย,")).toBe(true);
    expect(row1.endsWith('"สังเกต: ""ดีขึ้น"", ต่อเนื่อง"')).toBe(true);
  });

  it("marks a management tier and says ยังไม่ประเมิน for a nurse without a result", () => {
    const row2 = buildOutcomeCsv(rows).slice(1).split("\r\n")[2];
    expect(row2).toBe("2,คุณใหม่,,พยาบาลวิชาชีพ,,,,,,,,,✓,ยังไม่ประเมิน,,0,,,,,,,,,,,,");
  });

  it("names the file by the day it is exported", () => {
    expect(outcomeCsvFilename("2026-09-17")).toBe("hd-competency-outcome-2026-09-17.csv");
  });
});
