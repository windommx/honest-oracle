// ╔══════════════════════════════════════════════════════════════════╗
// ║  EPUB3 builder — pure, client-side, ZERO dependencies.            ║
// ║  Writes a valid (store-only / uncompressed) .epub: mimetype +     ║
// ║  container + OPF package + nav + per-chapter XHTML + CSS.          ║
// ║  Deterministic (no Date/random) so the same book → the same bytes. ║
// ╚══════════════════════════════════════════════════════════════════╝

const enc = (s: string) => new TextEncoder().encode(s);

function crc32(buf: Uint8Array): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}

interface ZEntry { name: string; data: Uint8Array }

/** Minimal store-only (no compression) ZIP — enough for a spec-valid EPUB. */
function zipStore(entries: ZEntry[]): Uint8Array {
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = enc(e.name);
    const crc = crc32(e.data);
    const size = e.data.length;
    const lh = new Uint8Array(30 + name.length);
    const dv = new DataView(lh.buffer);
    dv.setUint32(0, 0x04034b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint32(14, crc, true);
    dv.setUint32(18, size, true);
    dv.setUint32(22, size, true);
    dv.setUint16(26, name.length, true);
    lh.set(name, 30);
    local.push(lh, e.data);

    const ch = new Uint8Array(46 + name.length);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    ch.set(name, 46);
    central.push(ch);
    offset += lh.length + size;
  }
  const centralSize = central.reduce((s, c) => s + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const parts = [...local, ...central, eocd];
  const total = parts.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of parts) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Stable id from the title (no random/Date → reproducible builds).
function stableId(s: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return "rush-" + (h >>> 0).toString(16);
}

function chapterXhtml(title: string, text: string): string {
  const body = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => `<p>${esc(l)}</p>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="utf-8"/><title>${esc(title)}</title><link rel="stylesheet" type="text/css" href="styles.css"/></head><body><h1>${esc(title)}</h1>
${body}
</body></html>`;
}

export interface EpubInput {
  title: string;
  author?: string;
  language?: string;
  chapters: { title: string; text: string }[];
  /** Last-modified stamp, XML Schema dateTime in UTC with a trailing Z
   *  (e.g. "2026-08-05T09:30:00Z"). EPUB 3 requires exactly one of these in the
   *  package metadata, and it is what a reading system uses to build the Release
   *  Identifier. Anything not matching the required shape is ignored in favour of
   *  EPUB_FALLBACK_MODIFIED — a malformed date is an EPUBCheck error too. */
  modified?: string;
}

/** The stamp used when the caller supplies none.
 *
 *  buildEpub is pure: it has no clock, and a byte-determinism test pins that (same
 *  book in → identical bytes out). So the default cannot be "now". A fixed epoch is
 *  the standard resolution for reproducible builds — the same trade the SOURCE_DATE_EPOCH
 *  convention makes — and it is honest as long as it is not mistaken for a real edit time.
 *  Pass `modified` to stamp the actual one. */
export const EPUB_FALLBACK_MODIFIED = "1970-01-01T00:00:00Z";

/** XML Schema dateTime restricted to UTC, which is what EPUB 3 mandates. */
const MODIFIED_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

/** Normalize a caller-supplied stamp, falling back rather than emitting an invalid one. */
export function epubModified(value?: string): string {
  return value && MODIFIED_RE.test(value) ? value : EPUB_FALLBACK_MODIFIED;
}

/** Build a spec-valid EPUB3 as raw bytes. Pure & deterministic. */
export function buildEpub(input: EpubInput): Uint8Array {
  const lang = input.language || "en";
  const author = input.author || "Unknown";
  const modified = epubModified(input.modified);
  const uid = stableId(input.title + "|" + input.chapters.map((c) => c.title).join("|"));
  const chs = input.chapters.length ? input.chapters : [{ title: input.title, text: "" }];

  const files = chs.map((c, i) => ({
    id: `ch${i + 1}`,
    href: `ch${String(i + 1).padStart(3, "0")}.xhtml`,
    title: c.title,
    xhtml: chapterXhtml(c.title, c.text),
  }));

  const manifest = files.map((f) => `<item id="${f.id}" href="${f.href}" media-type="application/xhtml+xml"/>`).join("");
  const spine = files.map((f) => `<itemref idref="${f.id}"/>`).join("");
  const navLis = files.map((f) => `<li><a href="${f.href}">${esc(f.title)}</a></li>`).join("");

  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="bookid">urn:uuid:${uid}</dc:identifier><dc:title>${esc(input.title)}</dc:title><dc:creator>${esc(author)}</dc:creator><dc:language>${esc(lang)}</dc:language><meta property="dcterms:modified">${modified}</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="css" href="styles.css" media-type="text/css"/>${manifest}</manifest><spine>${spine}</spine></package>`;

  const nav = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><meta charset="utf-8"/><title>Contents</title></head><body><nav epub:type="toc" id="toc"><h1>Contents</h1><ol>${navLis}</ol></nav></body></html>`;

  const container = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`;

  const css = `body{font-family:Georgia,serif;line-height:1.6}h1{text-align:center;margin:2em 0 1em}p{text-indent:1.5em;margin:0}p:first-of-type{text-indent:0}`;

  return zipStore([
    { name: "mimetype", data: enc("application/epub+zip") }, // MUST be the first entry
    { name: "META-INF/container.xml", data: enc(container) },
    { name: "OEBPS/content.opf", data: enc(opf) },
    { name: "OEBPS/nav.xhtml", data: enc(nav) },
    { name: "OEBPS/styles.css", data: enc(css) },
    ...files.map((f) => ({ name: `OEBPS/${f.href}`, data: enc(f.xhtml) })),
  ]);
}
