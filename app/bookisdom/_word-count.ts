import type { StoredManuscript } from "./_manuscript-store";

/** Same per-language count the analyzers use (Thai: dictionary segmenter; EN: word regex).
 *  Loaded on demand so the Thai dictionary is not in the caller's first bundle. Lives
 *  outside the page file because a Next.js page may export only its route fields. */
export async function countManuscriptWords(m: Pick<StoredManuscript, "lang" | "text">): Promise<number> {
  if (m.lang === "th") {
    const { tokenizeThai } = await import("@/lib/bookisdom-engine/thai-analyzer");
    return tokenizeThai(m.text).length;
  }
  const { tokenizeProse } = await import("@/lib/bookisdom-engine/prose-analyzer");
  return tokenizeProse(m.text).length;
}
