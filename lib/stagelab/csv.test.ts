import { describe, it, expect } from "vitest";
import { UTF8_BOM, csvCell, csvFilename, csvRow, toCsv } from "./csv";

describe("csv escaping", () => {
  it("quotes only what RFC 4180 requires", () => {
    expect(csvCell("DELTA")).toBe("DELTA");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('he said "no"')).toBe('"he said ""no"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
    expect(csvCell("carriage\rreturn")).toBe('"carriage\rreturn"');
  });

  it("renders the empty cases as empty rather than as the word 'null'", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell(NaN)).toBe("");
    expect(csvCell(Infinity)).toBe("");
  });

  it("writes numbers unquoted so a spreadsheet reads them as numbers", () => {
    expect(csvCell(148.5)).toBe("148.5");
    expect(csvCell(-7)).toBe("-7");
    expect(csvCell(0)).toBe("0");
  });

  it("serialises dates as ISO, which sorts and parses everywhere", () => {
    expect(csvCell(new Date("2026-09-16T10:00:00.000Z"))).toBe("2026-09-16T10:00:00.000Z");
  });
});

describe("formula injection", () => {
  // A note field is free text typed by a user and opened in Excel by that user
  // or whoever they forward the file to. These are working attacks, not theory.
  const attacks = [
    '=HYPERLINK("http://evil.test","ดูรายงาน")',
    "+1+1",
    "-1+1",
    "@SUM(A1:A9)",
    "\t=cmd|'/c calc'!A1",
    "\r=1+1",
  ];

  it("neutralises every formula lead", () => {
    for (const attack of attacks) {
      const cell = csvCell(attack);
      // The payload survives as readable text, but not as a leading operator.
      const unquoted = cell.startsWith('"') ? cell.slice(1, -1).replace(/""/g, '"') : cell;
      expect(unquoted.startsWith("'"), attack).toBe(true);
      expect(unquoted.slice(1)).toBe(attack);
    }
  });

  it("leaves an ordinary negative number alone", () => {
    // Numbers go through the number path, which never sees the guard.
    expect(csvCell(-13.4)).toBe("-13.4");
  });

  it("still quotes a neutralised cell that also contains a comma", () => {
    expect(csvCell("=A1,B2")).toBe(`"'=A1,B2"`);
  });
});

describe("document assembly", () => {
  interface Row {
    symbol: string;
    price: number;
    notes: string | null;
  }
  const columns = [
    { header: "หุ้น", value: (r: Row) => r.symbol },
    { header: "ราคา", value: (r: Row) => r.price },
    { header: "บันทึก", value: (r: Row) => r.notes },
  ];

  it("starts with a UTF-8 BOM so Excel does not mangle Thai", () => {
    const doc = toCsv<Row>([], columns);
    expect(doc.startsWith(UTF8_BOM)).toBe(true);
  });

  it("writes a header even with no rows", () => {
    expect(toCsv<Row>([], columns)).toBe(`${UTF8_BOM}หุ้น,ราคา,บันทึก\r\n`);
  });

  it("uses CRLF line endings", () => {
    const doc = toCsv<Row>([{ symbol: "DELTA", price: 148.5, notes: null }], columns);
    expect(doc).toBe(`${UTF8_BOM}หุ้น,ราคา,บันทึก\r\nDELTA,148.5,\r\n`);
  });

  it("round-trips a row with every hazard in it at once", () => {
    const doc = toCsv<Row>(
      [{ symbol: "KCE", price: -7, notes: '=BAD(), he said "hi"\nnew line' }],
      columns,
    );
    const body = doc.slice(UTF8_BOM.length).split("\r\n")[1];
    expect(body).toBe(`KCE,-7,"'=BAD(), he said ""hi""\nnew line"`);
  });
});

describe("filename", () => {
  it("is dated so exports sort chronologically", () => {
    expect(csvFilename("watchlist", new Date("2026-09-16T10:00:00Z"))).toBe(
      "stagelab-watchlist-2026-09-16.csv",
    );
  });
});
