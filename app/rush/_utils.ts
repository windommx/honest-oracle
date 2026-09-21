// Rush Engine UI — pure & DOM helper utilities

export function titleCase(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
}
export function slug(s: string) {
  return (s || "book").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "book";
}
/**
 * Hand the user a file.
 *
 * Takes any BlobPart, not just a string: /synth and /master export WAV bytes,
 * and before this they each open-coded the same six lines — a fifth and sixth
 * copy of a helper that already existed here, which is how the improvement
 * below ended up living in only one of them.
 *
 * The charset is only appended for text types. Adding it to audio/wav makes a
 * mime type no player recognises.
 *
 * The URL is revoked a turn later rather than immediately: a synchronous
 * revoke races the browser's own handling of the click and cancels the
 * download outright in some of them.
 */
export function downloadBlob(filename: string, content: BlobPart, mime: string) {
  const type = mime.startsWith("text/") || mime === "application/json" ? `${mime};charset=utf-8` : mime;
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
