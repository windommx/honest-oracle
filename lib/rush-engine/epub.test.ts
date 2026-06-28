import { describe, it, expect } from "vitest";
import { buildEpub } from "./epub";

// UTF-8 (lenient): binary ZIP header bytes become replacement chars, but the
// embedded text (incl. Thai) is contiguous valid UTF-8 and decodes correctly.
const latin1 = (b: Uint8Array) => new TextDecoder().decode(b);

describe("buildEpub", () => {
  const epub = buildEpub({
    title: "My Book",
    author: "เอ",
    language: "th",
    chapters: [
      { title: "บทที่ 1", text: "เปิดเรื่อง\n\nย่อหน้าสอง" },
      { title: "Chapter 2", text: "the end" },
    ],
  });

  it("returns a ZIP starting with the PK signature, mimetype first", () => {
    expect(epub[0]).toBe(0x50); // P
    expect(epub[1]).toBe(0x4b); // K
    const s = latin1(epub);
    // mimetype must be the first entry, stored verbatim
    expect(s.indexOf("mimetype")).toBeLessThan(s.indexOf("application/epub+zip"));
    expect(s).toContain("application/epub+zip");
  });

  it("includes the OPF package, nav, and per-chapter XHTML", () => {
    const s = latin1(epub);
    expect(s).toContain("OEBPS/content.opf");
    expect(s).toContain("<dc:title>My Book</dc:title>");
    expect(s).toContain("OEBPS/ch001.xhtml");
    expect(s).toContain("OEBPS/ch002.xhtml");
    expect(s).toContain("<h1>บทที่ 1</h1>");
    expect(s).toContain("the end");
  });

  it("is deterministic — same book yields identical bytes", () => {
    const a = buildEpub({ title: "T", chapters: [{ title: "C", text: "x" }] });
    const b = buildEpub({ title: "T", chapters: [{ title: "C", text: "x" }] });
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("escapes XML metacharacters in titles/text", () => {
    const s = latin1(buildEpub({ title: "A & B <x>", chapters: [{ title: "C", text: "1 < 2 & 3" }] }));
    expect(s).toContain("A &amp; B &lt;x&gt;");
    expect(s).toContain("1 &lt; 2 &amp; 3");
  });
});
