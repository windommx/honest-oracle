import { describe, it, expect } from "vitest";
import { renameTerm } from "./rename";

describe("renameTerm (Thai)", () => {
  it("renames a character everywhere and audits per chapter", () => {
    const text = "## บทที่ 1\nวิกกี้เดินมา วิกกี้ยิ้ม\n## บทที่ 2\nเธอเรียกวิกกี้";
    const r = renameTerm(text, "วิกกี้", "อาโน่", "th");
    expect(r.total).toBe(3);
    expect(r.text).not.toContain("วิกกี้");
    expect(r.text.split("อาโน่").length - 1).toBe(3);
    expect(r.perChapter).toEqual([{ chapter: 1, count: 2 }, { chapter: 2, count: 1 }]);
  });

  it("warns when the new name already exists (collision)", () => {
    const text = "## 1\nวิกกี้กับอาโน่คุยกัน";
    const r = renameTerm(text, "วิกกี้", "อาโน่", "th");
    expect(r.targetPreexisting).toBe(1); // อาโน่ was already in use
  });

  it("does nothing for an absent name", () => {
    const r = renameTerm("## 1\nไม่มีใครชื่อนี้", "โซระ", "ลูมิน", "th");
    expect(r.total).toBe(0);
    expect(r.perChapter).toHaveLength(0);
  });
});

describe("renameTerm (English word boundaries)", () => {
  it("renames whole words only — never inside another word", () => {
    const text = "## 1\nAna ate a banana. Ana smiled.";
    const r = renameTerm(text, "Ana", "Mira", "en");
    expect(r.total).toBe(2); // the two "Ana"s, not the "ana" in banana
    expect(r.text).toContain("banana"); // untouched
    expect(r.text).toContain("Mira ate");
  });
});
