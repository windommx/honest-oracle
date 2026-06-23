// Count phrase occurrences with substring-overlap correction. When a longer
// phrase matches (e.g. "หัวใจสลาย" or "a testament to"), its shorter substring
// phrases ("ใจสลาย", "testament") would otherwise double-count the same span, so
// we subtract the longer phrase's occurrences from the shorter one's raw count.
// `text.split(phrase)` is a literal string split (no regex), so phrase contents
// are matched verbatim.
export function countPhrases(text: string, phrases: string[]): { phrase: string; count: number }[] {
  const raw = phrases.map((phrase) => ({ phrase, count: text.split(phrase).length - 1 }));
  return raw
    .map(({ phrase, count }) => {
      const overlap = raw.reduce(
        (sum, o) => (o.phrase !== phrase && o.phrase.length > phrase.length && o.phrase.includes(phrase) ? sum + o.count : sum),
        0
      );
      return { phrase, count: Math.max(0, count - overlap) };
    })
    .filter((p) => p.count > 0);
}
