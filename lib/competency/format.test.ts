import { describe, it, expect } from "vitest";
import { formatThaiDate, parseAssessDate, toDateInputValue } from "./format";

describe("formatThaiDate", () => {
  it("prints day, abbreviated Thai month and the Buddhist year", () => {
    expect(formatThaiDate("2019-12-20T00:00:00.000Z")).toBe("20 ธ.ค. 2562");
    expect(formatThaiDate(new Date(Date.UTC(2026, 0, 5)))).toBe("5 ม.ค. 2569");
  });

  it("has a long form and a safe fallback", () => {
    expect(formatThaiDate("2019-12-20T00:00:00.000Z", "long")).toBe("20 ธันวาคม 2562");
    expect(formatThaiDate("nonsense")).toBe("-");
  });

  it("reads the UTC day, so a UTC-midnight date never slips to the previous day", () => {
    expect(formatThaiDate("2024-03-01T00:00:00.000Z")).toBe("1 มี.ค. 2567");
  });
});

describe("toDateInputValue", () => {
  it("formats YYYY-MM-DD in UTC with zero padding", () => {
    expect(toDateInputValue("2024-03-01T00:00:00.000Z")).toBe("2024-03-01");
    expect(toDateInputValue("bad")).toBe("");
  });
});

describe("parseAssessDate", () => {
  it("turns a calendar day into UTC midnight", () => {
    expect(parseAssessDate("2019-12-20")?.toISOString()).toBe("2019-12-20T00:00:00.000Z");
  });

  it("rejects days that do not exist on the calendar", () => {
    expect(parseAssessDate("2023-02-30")).toBeNull();
    expect(parseAssessDate("2023-13-01")).toBeNull();
  });

  it("passes a full ISO instant through unchanged and rejects everything else", () => {
    expect(parseAssessDate("2019-12-20T07:30:00.000Z")?.toISOString()).toBe("2019-12-20T07:30:00.000Z");
    expect(parseAssessDate("20/12/2562")).toBeNull();
    expect(parseAssessDate(12345)).toBeNull();
    expect(parseAssessDate(new Date("x"))).toBeNull();
  });
});
