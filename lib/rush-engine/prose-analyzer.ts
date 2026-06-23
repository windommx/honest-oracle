// ╔══════════════════════════════════════════════════════════════════╗
// ║  PROSE ANALYZER — deterministic, client-side English prose checks  ║
// ║  No LLM. Word-matches & statistics only — the user sees what was   ║
// ║  counted. Mirrors the Thai Analyzer for English/bilingual books.   ║
// ╚══════════════════════════════════════════════════════════════════╝

// AI-slop words & hollow formulas (substring match on lowercased text).
export const SLOP_TERMS = [
  // overused single words
  "delve", "tapestry", "testament", "realm", "navigate", "foster", "underscore",
  "crucial", "vibrant", "meticulous", "bustling", "whimsical", "nestled", "boasts",
  "embark", "unleash", "elevate", "seamless", "robust", "leverage", "myriad",
  // hollow formulas / phrases
  "it's not just", "in a world where", "more than ever", "it's worth noting",
  "needless to say", "at the end of the day", "game changer", "a testament to",
  "in today's", "when it comes to", "the fact that",
];

// Filter / crutch words that weaken prose (whole-token match).
const FILTER_WORDS = new Set([
  "just", "really", "very", "quite", "rather", "somewhat", "actually", "simply",
  "basically", "literally", "totally", "perhaps", "maybe", "kind", "sort", "almost",
  "even", "stuff", "things", "very",
  // deep-POV distancing verbs
  "saw", "felt", "heard", "noticed", "realized", "watched", "wondered", "knew",
  "thought", "seemed", "looked",
]);

// Directly-named emotions (telling rather than showing).
const EMOTION_WORDS = new Set([
  "angry", "sad", "happy", "afraid", "scared", "nervous", "excited", "jealous",
  "embarrassed", "furious", "anxious", "lonely", "proud", "ashamed", "confused",
  "frustrated", "terrified", "delighted", "miserable", "worried", "joy", "fear",
  "anger", "sadness", "happiness", "love", "hatred", "grief", "rage",
]);

// -ly tokens that are NOT manner adverbs (so we don't over-flag).
const LY_FALSE_FRIENDS = new Set([
  "only", "family", "reply", "apply", "supply", "ugly", "early", "italy", "july",
  "holy", "ally", "rely", "fly", "july", "belly", "rally", "jelly", "lily", "ply",
  "imply", "comply", "multiply", "assembly", "anomaly", "monopoly", "melancholy",
]);

// Common irregular past participles (the -ed/-en regex misses these).
const IRREGULAR_PP = new Set([
  "done", "gone", "made", "seen", "given", "taken", "written", "shown", "known",
  "found", "held", "kept", "left", "told", "brought", "bought", "caught", "taught",
  "thought", "built", "sent", "spent", "lost", "meant", "felt", "dealt", "met", "set",
  "put", "cut", "hit", "read", "led", "fed", "hidden", "broken", "chosen", "frozen",
  "spoken", "stolen", "driven", "ridden", "risen", "fallen", "eaten", "beaten",
  "forgotten", "gotten", "bitten", "torn", "worn", "born", "sworn", "drawn", "thrown",
  "grown", "blown", "flown", "struck", "bound", "wound", "shot", "split", "spread",
]);

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "at", "for", "with",
  "as", "by", "from", "is", "are", "was", "were", "be", "been", "being", "it", "its",
  "he", "she", "they", "them", "his", "her", "their", "i", "you", "we", "me", "my",
  "this", "that", "these", "those", "then", "than", "so", "if", "not", "no", "yes",
  "had", "has", "have", "do", "does", "did", "will", "would", "could", "should",
  "can", "may", "might", "out", "up", "down", "off", "over", "into", "all", "one",
  "his", "him", "who", "what", "when", "where", "which", "there", "here", "about",
]);

export interface ProseAnalysis {
  wordCount: number;
  charCount: number;
  uniqueWords: number;
  sentences: { count: number; avgWords: number; longest: number };
  /** Sentence-length variation — low cv / long monotonyRun = flat prose. */
  rhythm: { stdev: number; cv: number; monotonyRun: number };
  /** Readability via the standard Flesch formulas (estimate; syllables are heuristic). */
  readability: { fleschEase: number; fkGrade: number; syllablesPerWord: number; wordsPerSentence: number };
  /** AI-slop words & hollow formulas found. */
  slop: { phrase: string; count: number }[];
  /** Filter / crutch words (just, really, felt…). */
  filterWords: { word: string; count: number }[];
  /** -ly manner adverbs (density signals weak verbs). */
  adverbs: { count: number; ratio: number; words: { word: string; count: number }[] };
  /** Directly-named emotions — telling rather than showing. */
  telling: { count: number; ratio: number; words: { word: string; count: number }[] };
  /** Content words repeated unusually often (≥4). */
  echoes: { word: string; count: number }[];
  /** Possible passive voice (heuristic: be-verb + past participle). Some false positives. */
  passive: { count: number; ratio: number; samples: string[] };
}

/** Heuristic passive-voice finder: be-verb (+ optional adverb) + a past participle. */
export function detectPassive(text: string): { count: number; samples: string[] } {
  const re = /\b(am|is|are|was|were|be|been|being|gets?|got)\b((?:\s+\w+ly)?\s+)([a-z]+)/gi;
  const samples: string[] = [];
  let count = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const pp = m[3].toLowerCase();
    if (/(?:ed|en)$/.test(pp) || IRREGULAR_PP.has(pp)) {
      count++;
      if (samples.length < 10) samples.push(`${m[1]}${m[2]}${m[3]}`.replace(/\s+/g, " ").trim());
    }
  }
  return { count, samples };
}

export function tokenizeProse(text: string): string[] {
  return (text.toLowerCase().match(/[a-z']+/g) ?? []).map((w) => w.replace(/^'+|'+$/g, "")).filter(Boolean);
}

/** Heuristic English syllable count (vowel-group method; the standard approximation). */
export function countSyllables(word: string): number {
  let w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  if (w.length <= 3) return 1;
  w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  const groups = w.match(/[aeiouy]{1,2}/g);
  return groups ? groups.length : 1;
}

function countTop(map: Map<string, number>): { word: string; count: number }[] {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([word, count]) => ({ word, count }));
}

export function analyzeProse(text: string): ProseAnalysis {
  const lower = text.toLowerCase();
  const words = tokenizeProse(text);

  const freq = new Map<string, number>();
  words.forEach((w) => freq.set(w, (freq.get(w) ?? 0) + 1));

  // Slop: substring match (covers multi-word formulas).
  const slop = SLOP_TERMS.map((phrase) => ({ phrase, count: lower.split(phrase).length - 1 }))
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count);

  // Filter words.
  const filterMap = new Map<string, number>();
  words.forEach((w) => {
    if (FILTER_WORDS.has(w)) filterMap.set(w, (filterMap.get(w) ?? 0) + 1);
  });
  const filterWords = countTop(filterMap);

  // -ly adverbs (excluding false friends).
  const advMap = new Map<string, number>();
  words.forEach((w) => {
    if (w.length > 3 && w.endsWith("ly") && !LY_FALSE_FRIENDS.has(w)) {
      advMap.set(w, (advMap.get(w) ?? 0) + 1);
    }
  });
  const advList = countTop(advMap);
  const advCount = advList.reduce((s, a) => s + a.count, 0);
  const adverbs = {
    count: advCount,
    ratio: words.length ? Math.round((advCount / words.length) * 1000) / 10 : 0,
    words: advList,
  };

  // Telling: named emotions (+ "felt").
  const tellMap = new Map<string, number>();
  words.forEach((w) => {
    if (EMOTION_WORDS.has(w)) tellMap.set(w, (tellMap.get(w) ?? 0) + 1);
  });
  const tellList = countTop(tellMap);
  const tellCount = tellList.reduce((s, t) => s + t.count, 0);
  const telling = {
    count: tellCount,
    ratio: words.length ? Math.round((tellCount / words.length) * 1000) / 10 : 0,
    words: tellList,
  };

  // Possible passive voice (heuristic).
  const pv = detectPassive(text);
  const passive = {
    count: pv.count,
    ratio: words.length ? Math.round((pv.count / words.length) * 1000) / 10 : 0,
    samples: pv.samples,
  };

  // Echoes: content words repeated ≥4 times.
  const echoes = Array.from(freq.entries())
    .filter(([w, c]) => c >= 4 && w.length >= 3 && !STOPWORDS.has(w))
    .sort((a, b) => b[1] - a[1])
    .map(([word, count]) => ({ word, count }));

  // Sentence + rhythm stats.
  const sentenceLens = text
    .split(/[.!?…]+|\n+/)
    .map((s) => tokenizeProse(s).length)
    .filter((n) => n > 0);
  const sentences = {
    count: sentenceLens.length,
    avgWords: sentenceLens.length ? Math.round(words.length / sentenceLens.length) : 0,
    longest: sentenceLens.length ? Math.max(...sentenceLens) : 0,
  };
  const mean = sentenceLens.length ? sentenceLens.reduce((s, n) => s + n, 0) / sentenceLens.length : 0;
  const variance = sentenceLens.length
    ? sentenceLens.reduce((s, n) => s + (n - mean) ** 2, 0) / sentenceLens.length
    : 0;
  const stdev = Math.sqrt(variance);
  let flatRun = 1;
  let maxFlatRun = sentenceLens.length ? 1 : 0;
  for (let i = 1; i < sentenceLens.length; i++) {
    if (Math.abs(sentenceLens[i] - sentenceLens[i - 1]) <= 2) {
      flatRun++;
      if (flatRun > maxFlatRun) maxFlatRun = flatRun;
    } else {
      flatRun = 1;
    }
  }
  const rhythm = {
    stdev: Math.round(stdev * 10) / 10,
    cv: mean ? Math.round((stdev / mean) * 100) : 0,
    monotonyRun: maxFlatRun,
  };

  // Readability — standard Flesch formulas (an estimate; syllable count is heuristic).
  const syllables = words.reduce((s, w) => s + countSyllables(w), 0);
  const wps = sentences.count ? words.length / sentences.count : 0;
  const spw = words.length ? syllables / words.length : 0;
  const have = words.length > 0 && sentences.count > 0;
  const readability = {
    fleschEase: have ? Math.round((206.835 - 1.015 * wps - 84.6 * spw) * 10) / 10 : 0,
    fkGrade: have ? Math.round((0.39 * wps + 11.8 * spw - 15.59) * 10) / 10 : 0,
    syllablesPerWord: Math.round(spw * 100) / 100,
    wordsPerSentence: Math.round(wps * 10) / 10,
  };

  return {
    wordCount: words.length,
    charCount: text.replace(/\s/g, "").length,
    uniqueWords: freq.size,
    sentences,
    rhythm,
    readability,
    slop,
    filterWords,
    adverbs,
    telling,
    echoes,
    passive,
  };
}

export interface MetricDelta {
  label: string;
  before: number;
  after: number;
  delta: number;
  /** Which direction counts as an improvement (for colouring); "neutral" = no judgement. */
  good: "lower" | "higher" | "neutral";
}

/** Compare two analyses metric-by-metric so a writer can see if a revision measurably improved. */
export function proseDeltas(before: ProseAnalysis, after: ProseAnalysis): MetricDelta[] {
  const filt = (a: ProseAnalysis) => a.filterWords.reduce((s, w) => s + w.count, 0);
  const slopN = (a: ProseAnalysis) => a.slop.reduce((s, w) => s + w.count, 0);
  const row = (label: string, b: number, af: number, good: MetricDelta["good"]): MetricDelta => ({
    label,
    before: b,
    after: af,
    delta: Math.round((af - b) * 10) / 10,
    good,
  });
  return [
    row("Words", before.wordCount, after.wordCount, "neutral"),
    row("Flesch Reading Ease", before.readability.fleschEase, after.readability.fleschEase, "higher"),
    row("Grade level (FK)", before.readability.fkGrade, after.readability.fkGrade, "neutral"),
    row("Rhythm variation (CV%)", before.rhythm.cv, after.rhythm.cv, "higher"),
    row("AI-slop terms", slopN(before), slopN(after), "lower"),
    row("Told emotions", before.telling.count, after.telling.count, "lower"),
    row("Filter / crutch words", filt(before), filt(after), "lower"),
    row("-ly adverbs", before.adverbs.count, after.adverbs.count, "lower"),
    row("Possible passive", before.passive.count, after.passive.count, "lower"),
  ];
}

export interface ChapterScan {
  title: string;
  words: number;
  fleschEase: number;
  cv: number;
  slop: number;
  telling: number;
  passive: number;
}

const HEADING = /^\s*(?:#{1,3}\s+\S|(?:chapter|ch\.?|part|บทที่|บท|ตอนที่|ตอน)\s+[\dIVXLivxl]+)/i;

/** Split a manuscript into chapters on Markdown headings or "Chapter N" / "บทที่ N" lines. */
export function splitChapters(text: string): { title: string; body: string }[] {
  const lines = text.split(/\r?\n/);
  const heads = lines.map((l, i) => (HEADING.test(l) ? i : -1)).filter((i) => i >= 0);
  if (heads.length === 0) return [{ title: "Full text", body: text }];

  const chunks: { title: string; body: string }[] = [];
  const preamble = lines.slice(0, heads[0]).join("\n").trim();
  if (preamble) chunks.push({ title: "(intro)", body: preamble });
  heads.forEach((start, h) => {
    const end = h + 1 < heads.length ? heads[h + 1] : lines.length;
    const title = lines[start].replace(/^\s*#{1,3}\s*/, "").trim() || `Section ${h + 1}`;
    chunks.push({ title, body: lines.slice(start + 1, end).join("\n") });
  });
  return chunks;
}

/** Per-chapter deterministic scorecard — find the weakest chapters at a glance. */
export function scanManuscript(text: string): ChapterScan[] {
  return splitChapters(text).map(({ title, body }) => {
    const a = analyzeProse(body);
    return {
      title,
      words: a.wordCount,
      fleschEase: a.readability.fleschEase,
      cv: a.rhythm.cv,
      slop: a.slop.reduce((s, w) => s + w.count, 0),
      telling: a.telling.count,
      passive: a.passive.count,
    };
  });
}

const joinCounts = (items: { word?: string; phrase?: string; count: number }[]) =>
  items.length ? items.map((i) => `${i.word ?? i.phrase} ×${i.count}`).join(", ") : "—";

/** Render a deterministic Prose Analysis as a portable Markdown report. */
export function formatProseReport(a: ProseAnalysis): string {
  const filterTotal = a.filterWords.reduce((s, w) => s + w.count, 0);
  return [
    "# Prose Analysis Report",
    "",
    `- Words: ${a.wordCount} · Unique: ${a.uniqueWords} · Sentences: ${a.sentences.count}`,
    `- Avg words/sentence: ${a.sentences.avgWords} · Longest: ${a.sentences.longest}`,
    `- Rhythm: CV ${a.rhythm.cv}% · stdev ${a.rhythm.stdev} · longest same-length run ${a.rhythm.monotonyRun}`,
    `- Readability (estimate): Flesch Ease ${a.readability.fleschEase} · FK grade ${a.readability.fkGrade} · ${a.readability.syllablesPerWord} syllables/word`,
    "",
    `## AI-slop / formulas (${a.slop.length})`,
    joinCounts(a.slop),
    "",
    `## Told emotions (${a.telling.count} · ${a.telling.ratio}/100 words)`,
    joinCounts(a.telling.words),
    "",
    `## Filter / crutch words (${filterTotal})`,
    joinCounts(a.filterWords),
    "",
    `## -ly adverbs (${a.adverbs.count} · ${a.adverbs.ratio}/100 words)`,
    joinCounts(a.adverbs.words),
    "",
    `## Possible passive voice (${a.passive.count}, heuristic)`,
    a.passive.samples.length ? a.passive.samples.join("; ") : "—",
    "",
    `## Repeated words / echoes (${a.echoes.length})`,
    joinCounts(a.echoes),
    "",
    "_Deterministic, client-side — counts and statistics, not quality scores._",
  ].join("\n");
}
