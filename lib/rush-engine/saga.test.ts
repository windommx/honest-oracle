import { describe, it, expect } from "vitest";
import { analyzeSaga, formatSaga, type SagaBook } from "./saga";
import { parseCodex } from "./codex";

const book = (title: string, chars: string[]): SagaBook => ({
  title,
  codex: parseCodex(`[ตัวละคร]\n${chars.map((c) => `${c}: บทบาท`).join("\n")}`),
});

// A 3-book series: อนันต์ spans all; มาลี appears in 1&3; เสือ only book 2; ฟ้า new in 3.
const SERIES = [
  book("เล่ม 1", ["อนันต์", "มาลี"]),
  book("เล่ม 2", ["อนันต์", "เสือ"]),
  book("เล่ม 3", ["อนันต์", "มาลี", "ฟ้า"]),
];

describe("analyzeSaga", () => {
  const r = analyzeSaga(SERIES);

  it("marks first appearances as introduced (cumulative across the series)", () => {
    expect(r.books[0].introduced.map((e) => e.name).sort()).toEqual(["มาลี", "อนันต์"]);
    expect(r.books[1].introduced.map((e) => e.name)).toEqual(["เสือ"]); // อนันต์ carried
    expect(r.books[2].introduced.map((e) => e.name)).toEqual(["ฟ้า"]);  // มาลี already seen in bk1
  });

  it("marks entities seen earlier as carried", () => {
    expect(r.books[1].carried).toContain("อนันต์");
    expect(r.books[2].carried).toEqual(expect.arrayContaining(["อนันต์", "มาลี"]));
  });

  it("drops = present in the immediately-previous book, absent here", () => {
    // bk1 had มาลี; bk2 doesn't → dropped. bk2 had เสือ; bk3 doesn't → dropped.
    expect(r.books[1].dropped).toContain("มาลี");
    expect(r.books[2].dropped).toContain("เสือ");
    expect(r.books[0].dropped).toEqual([]); // nothing before book 1
  });

  it("computes the series backbone (≥2 books) vs single-book entities", () => {
    expect(r.recurring.sort()).toEqual(["มาลี", "อนันต์"]);
    expect(r.standalone.sort()).toEqual(["เสือ", "ฟ้า"].sort());
    expect(r.totalEntities).toBe(4);
  });

  it("is case-insensitive but preserves first-seen casing", () => {
    const s = analyzeSaga([book("A", ["Anan"]), book("B", ["anan"])]);
    expect(s.recurring).toEqual(["Anan"]);
    expect(s.books[1].carried).toEqual(["Anan"]);
  });
});

describe("formatSaga", () => {
  it("reports counts and frames dropped as a question, never a verdict", () => {
    const out = formatSaga(analyzeSaga(SERIES), "th");
    expect(out).toContain("นับได้ ไม่ใช่คำตัดสิน");
    expect(out).toContain("แกนซีรีส์");
    expect(out).toContain("ตั้งใจ หรือลืม?");
    expect(out).not.toMatch(/\b\d{1,3}\/100\b/);
  });
});
