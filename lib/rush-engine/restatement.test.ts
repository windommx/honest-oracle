import { describe, it, expect } from "vitest";
import { findRestatements, formatRestatements } from "./restatement";

describe("findRestatements — English", () => {
  it("finds a long verbatim repeat and extends it to the maximal run", () => {
    const dup = "she knew she should stand up and find him right now";
    const text = `Opening scene. ${dup} before dawn. Later that night, ${dup} again.`;
    const r = findRestatements(text, "en");
    expect(r.found.length).toBeGreaterThan(0);
    expect(r.found[0].count).toBe(2);
    expect(r.found[0].phrase).toContain("she knew she should stand up and find him right now");
  });

  it("does not report short/common collocations", () => {
    const text = "He walked to the door. She walked to the window. They walked to the car.";
    const r = findRestatements(text, "en");
    expect(r.found).toEqual([]); // repeats are under the 6-token/24-char floor
  });

  it("reports each maximal repeat once, not every sub-window", () => {
    const dup = "the golden key opened the hidden warehouse beneath the old pier";
    const text = `${dup}. Chapter later: ${dup}.`;
    const r = findRestatements(text, "en");
    expect(r.found).toHaveLength(1); // sub-6-grams inside the run are consumed
  });
});

describe("findRestatements — Thai + chapters", () => {
  it("locates a verbatim repeat across chapters (no space-splitting needed)", () => {
    const dup = "อนันต์รู้ดีว่าความลับใต้ท่าเรือจะเปลี่ยนทุกอย่างที่เขาเชื่อ";
    const text = `## บทที่ 1\nเปิดเรื่อง ${dup} ในคืนฝนตก\n\n## บทที่ 2\nต่อมา ${dup} อีกครั้ง`;
    const r = findRestatements(text, "th");
    expect(r.found.length).toBeGreaterThan(0);
    expect(r.found[0].chapters).toEqual([1, 2]);
  });

  it("never fabricates a repeat spanning a chapter boundary", () => {
    // Ending of ch1 + start of ch2 forms a sequence that also appears inside ch3;
    // the boundary sentinel must prevent the spanning window from matching.
    const a = "ประโยคท้ายบทหนึ่งยาวพอสมควร";
    const b = "ประโยคเปิดบทสองยาวพอสมควร";
    const text = `## บทที่ 1\n${a}\n\n## บทที่ 2\n${b}\n\n## บทที่ 3\nกลางบท ${a}${b} กลางบท`;
    const r = findRestatements(text, "th");
    for (const f of r.found) expect(f.count).toBeGreaterThanOrEqual(2);
    // the concatenated a+b appears once in ch3 and "once" across the 1|2 boundary —
    // sentinel makes the boundary occurrence unmatchable, so no repeat is reported
    expect(r.found.some((f) => f.phrase.includes("ท้ายบทหนึ่ง") && f.phrase.includes("เปิดบทสอง"))).toBe(false);
  });
});

describe("formatRestatements", () => {
  it("is framed as counts and admits paraphrase is out of reach", () => {
    const out = formatRestatements(findRestatements("สั้นเกินไป", "th"), "th");
    expect(out).toContain("นับได้ ไม่ใช่คำตัดสิน");
    expect(out).toContain("paraphrase");
    expect(out).toContain("ไม่พบวลียาวที่ซ้ำคำต่อคำ");
  });
});
