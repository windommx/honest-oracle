import { describe, it, expect } from "vitest";
import { SaxesParser } from "saxes";
import { buildEpub , EPUB_FALLBACK_MODIFIED } from "./epub";

// UTF-8 (lenient): binary ZIP header bytes become replacement chars, but the
// embedded text (incl. Thai) is contiguous valid UTF-8 and decodes correctly.
const latin1 = (b: Uint8Array) => new TextDecoder().decode(b);

// The EPUB entries are STORED uncompressed, so each XML document is a contiguous
// substring of the decoded blob. Slice one out by its root element and confirm a
// strict XML parser accepts it — the real "well-formed" bar, not a string match.
function xmlDocs(epub: Uint8Array): { name: string; xml: string }[] {
  const whole = latin1(epub);
  const docs: { name: string; xml: string }[] = [];
  for (const [name, close] of [["content.opf", "</package>"], ["ch001.xhtml", "</html>"]] as const) {
    const anchor = whole.indexOf("OEBPS/" + name);
    if (anchor < 0) continue;
    const start = whole.indexOf("<?xml", anchor);
    const end = whole.indexOf(close, start);
    if (start >= 0 && end >= 0) docs.push({ name, xml: whole.slice(start, end + close.length) });
  }
  return docs;
}
function wellFormedError(xml: string): string {
  let err = "";
  const p = new SaxesParser({ xmlns: true });
  p.on("error", (e) => { if (!err) err = e.message; });
  p.write(xml).close();
  return err;
}

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

  it("stays well-formed XML when title/text carry XML-illegal control characters", () => {
    // U+000C (form feed) rides in from PDF/Word paste as a page break; U+000B, U+0000 etc.
    // likewise. XML 1.0 cannot carry these even as entities, so esc must strip them. Before
    // the fix the raw byte landed in content.opf and the chapter XHTML and a strict parser
    // rejected the document — a fatal EPUBCheck error under the module's "spec-valid" claim.
    const epub = buildEpub({
      title: "Ti\ftle\x0b",
      author: "Au\x00thor",
      chapters: [{ title: "Ch\fapter", text: "line one\fbroken\x0bhere\x00end" }],
    });
    const docs = xmlDocs(epub);
    expect(docs.map((d) => d.name)).toEqual(["content.opf", "ch001.xhtml"]);
    for (const d of docs) {
      expect(wellFormedError(d.xml), `${d.name} not well-formed`).toBe("");
      for (const bad of ["\f", "\x0b", "\x00"]) {
        expect(d.xml.includes(bad), `${d.name} still carries a control char`).toBe(false);
      }
    }
  });

  it("the well-formedness harness actually rejects a control character (guards the guard)", () => {
    // Prove the saxes check has teeth: a raw form feed inside an element IS a parse error,
    // so the passing test above reflects the fix, not a lenient parser.
    expect(wellFormedError("<p>a\fb</p>")).not.toBe("");
    expect(wellFormedError("<p>ok</p>")).toBe("");
  });
});

describe("dcterms:modified (EPUB 3 required metadata)", () => {
  // Regression: the OPF shipped dc:identifier/title/creator/language and nothing else.
  // EPUB 3 requires the metadata section to carry exactly one dcterms:modified property
  // — it is what a reading system uses to build the Release Identifier — so every file
  // Bookisdom exported would draw an EPUBCheck error while the function's own doc comment
  // claimed "spec-valid EPUB3".
  it("emits exactly one dcterms:modified", () => {
    const s = latin1(buildEpub({ title: "T", chapters: [{ title: "C", text: "x" }] }));
    expect(s.match(/property="dcterms:modified"/g) ?? []).toHaveLength(1);
  });

  it("uses the caller's stamp when it is valid UTC", () => {
    const s = latin1(buildEpub({ title: "T", chapters: [{ title: "C", text: "x" }], modified: "2026-08-05T09:30:00Z" }));
    expect(s).toContain("<meta property=\"dcterms:modified\">2026-08-05T09:30:00Z</meta>");
  });

  it("falls back rather than emitting a malformed date", () => {
    // A bad date is an EPUBCheck error just like a missing one, so garbage in must not
    // become garbage out. Local time without Z is the most likely mistake.
    for (const bad of ["not-a-date", "2026-08-05", "2026-08-05T09:30:00", "2026-08-05T09:30:00+07:00", ""]) {
      const s = latin1(buildEpub({ title: "T", chapters: [{ title: "C", text: "x" }], modified: bad }));
      expect(s).toContain(`<meta property="dcterms:modified">${EPUB_FALLBACK_MODIFIED}</meta>`);
    }
  });

  it("stays byte-deterministic — the stamp is an input, never a clock read", () => {
    const mk = () => buildEpub({ title: "T", chapters: [{ title: "C", text: "x" }], modified: "2026-08-05T09:30:00Z" });
    expect(latin1(mk())).toBe(latin1(mk()));
    // and a different stamp really does change the bytes (the field is live, not cosmetic)
    const other = buildEpub({ title: "T", chapters: [{ title: "C", text: "x" }], modified: "2026-08-06T09:30:00Z" });
    expect(latin1(other)).not.toBe(latin1(mk()));
  });
});
