// ╔══════════════════════════════════════════════════════════════════╗
// ║  RUSH CLI — headless access to the (pure) engine.                  ║
// ║  runCli is itself pure: argv + an injected file reader → text out. ║
// ║  No process / fs here, so it unit-tests without a shell. The thin  ║
// ║  bin (scripts/rush.ts) wires process.argv + node:fs to it.         ║
// ╚══════════════════════════════════════════════════════════════════╝

import { BOOK_TYPES, defaultGroupsFor, generateAllPrompts, type BookConfig, type BookTypeKey, type PromptGroup } from "./engine";
import { analyzeThai } from "./thai-analyzer";
import { analyzeProse } from "./prose-analyzer";
import { sensoryDensity, SENSE_LABEL, type Sense } from "./sensory";
import { consistencyLedger, storyBible } from "./consistency";
import { checkThaiRegister } from "./register";
import { renameTerm } from "./rename";
import { characterGraph } from "./relationships";
import { continuityRadar, sceneReadout } from "./radar";
import { characterArc, pacingProfile, motifTracker, hookSignal } from "./narrative";
import { splitChapters } from "./chapters";
import { parseCodex, codexAudit, codexCanon, formatCodexAudit, codexMermaid } from "./codex";
import { analyzeSaga, formatSaga, type SagaBook } from "./saga";
import { analyzeOpeners, formatOpeners } from "./openers";
import { findRestatements, findNearRestatements } from "./restatement";
import { excessVocabulary, formatExcess } from "./excess";

export interface CliResult { stdout: string; stderr: string; code: number }

/** Minimal flag parser: --key value, --key=value, and boolean --flag. */
function parseFlags(args: string[]): { positional: string[]; flags: Record<string, string | true> } {
  const positional: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq !== -1) flags[a.slice(2, eq)] = a.slice(eq + 1);
      else if (i + 1 < args.length && !args[i + 1].startsWith("--")) flags[a.slice(2)] = args[++i];
      else flags[a.slice(2)] = true;
    } else positional.push(a);
  }
  return { positional, flags };
}

const HELP = `rush — deterministic novel-writing engine (no LLM, no network)

USAGE
  rush prompts  --type <t> --genre <g> [--chapters n] [--words n] [--lang th|en] [--full]
  rush analyze  <file.md> [--lang th|en]
  rush rename   <file.md> --from <name> --to <name> [--lang th|en] [--write]
  rush relations <file.md> --names "A,B,C" [--lang th|en]
  rush radar    <file.md> --canon "A,B,C" [--lang th|en]
  rush codex    <draft.md> --bible <bible.md> [--lang th|en]  (or: --bible <b> --graph)
  rush saga     --books "b1.md,b2.md,..." [--titles "A,B,..."] [--lang th|en]
  rush openers  <file.md> [--lang th|en]   (sentence/clause opener monotony)
  rush excess   <suspect.md> --baseline <human.md> [--lang th|en] [--min n]
  rush scene    <file.md>   (Thai: real per-scene signals — no fake 0–100 scores)
  rush narrative <file.md> [--names "A,B"] [--motifs "x,y"]  (Thai: presence/pacing/motifs)
  rush help

COMMANDS
  prompts   Generate the prompt pack for a book config (lists prompt ids + names).
            --full also prints each prompt body.
  analyze   Run the deterministic analyzers on a manuscript file (word/clause stats,
            sensory density, cross-chapter consistency, story bible, AI-tell clichés,
            and — for Thai — non-standard word/spelling suggestions).
  rename    Rename a character/term across every chapter; prints a per-chapter audit
            and a collision warning. --write outputs the rewritten manuscript.
  relations Character co-occurrence graph: who shares scenes with whom (needs --names).
  radar     Continuity radar: canon names never used + off-canon names that recur
            (drift/rename/typo). Counts vs. your glossary — not a verdict (needs --canon).
  codex     Audit a draft against a declared Story Codex (the --bible file): which
            entities appear, which are misspelled, which aren't referenced, plus the
            radar's off-canon drift. The codex IS the canon. Counts, not a verdict.
  saga      Series continuity across many book codices (--books, ordered): per book,
            who is introduced / carried / dropped, plus the series backbone (entities
            spanning ≥2 books). Counts, not a verdict.
  openers   Sentence/clause opener monotony: how often lines start with the same word
            (He… He… / เขา… เขา…). Counts + share, not a verdict.
  excess    Excess-vocabulary comparison (Kobak et al. 2025 method): which words are
            over-represented in a suspect corpus vs your baseline corpus. The tool for
            BUILDING an evidence-based Thai AI-tell list — ratios are facts, the
            "tell" judgement (and the corpora) are yours.
  scene     Per-scene readout (Thai): words, clauses, rhythm cv, dialogue ratio, telling
            density, sensory/1k, AI-tells — real signals, never a fake 0–100 vibe score.

TYPES     ${Object.keys(BOOK_TYPES).join(", ")}
`;

function cmdPrompts(flags: Record<string, string | true>): CliResult {
  const type = String(flags.type ?? "novel");
  if (!(type in BOOK_TYPES)) return { stdout: "", stderr: `unknown --type "${type}". one of: ${Object.keys(BOOK_TYPES).join(", ")}\n`, code: 2 };
  const promptLanguage = flags.lang === "th" ? "th" : "en";
  const config: BookConfig = {
    title: String(flags.title ?? "Untitled"),
    thesis: String(flags.premise ?? flags.thesis ?? ""),
    type: type as BookTypeKey,
    subGenre: String(flags.genre ?? flags.subGenre ?? ""),
    chapters: Number(flags.chapters ?? 12),
    wordsPerChapter: Number(flags.words ?? 2500),
    language: promptLanguage === "th" ? "thai" : "english",
    promptLanguage,
  } as unknown as BookConfig;

  const groups = typeof flags.groups === "string"
    ? (flags.groups.split(",").map((g) => g.trim()).filter(Boolean) as Exclude<PromptGroup, "core">[])
    : defaultGroupsFor(type as BookTypeKey);

  const pack = generateAllPrompts(config, groups);
  const lines = [`# ${pack.length} prompts · ${type}/${config.subGenre || "—"} · groups: ${groups.join(", ") || "core only"}`, ""];
  for (const p of pack) {
    lines.push(`[${p.group}] ${p.id} — ${p.name}`);
    if (flags.full) lines.push("", p.prompt, "\n" + "─".repeat(60) + "\n");
  }
  return { stdout: lines.join("\n") + "\n", stderr: "", code: 0 };
}

function cmdAnalyze(file: string | undefined, flags: Record<string, string | true>, read?: (p: string) => string): CliResult {
  if (!file) return { stdout: "", stderr: "analyze needs a file: rush analyze <file.md>\n", code: 2 };
  if (!read) return { stdout: "", stderr: "no file reader available\n", code: 1 };
  let text: string;
  try {
    text = read(file);
  } catch {
    return { stdout: "", stderr: `cannot read "${file}"\n`, code: 1 };
  }
  const lang: "th" | "en" = flags.lang === "en" ? "en" : flags.lang === "th" ? "th" : /[฀-๿]/.test(text) ? "th" : "en";
  const L: string[] = [`# rush analyze — ${file} (${lang})`, ""];

  if (lang === "th") {
    const a = analyzeThai(text);
    L.push(`words ${a.wordCount} · unique ${a.uniqueWords} · clauses ${a.sentences.count} · rhythm cv ${a.rhythm.cv}`);
    if (a.aiTells.length) L.push(`AI-tell clichés: ${a.aiTells.map((t) => t.phrase + "×" + t.count).join(", ")}`);
  } else {
    const a = analyzeProse(text);
    L.push(`words ${a.wordCount} · unique ${a.uniqueWords} · sentences ${a.sentences.count}`);
  }

  const sd = sensoryDensity(text, lang);
  if (sd.words >= 20 && sd.total > 0) {
    L.push("", "sensory density (per 1k words):");
    for (const s of sd.senses) L.push(`  ${SENSE_LABEL[s.sense as Sense].en.padEnd(6)} ${String(s.count).padStart(3)}×  ${s.per1k}/1k`);
    if (sd.unused.length) L.push(`  never used: ${sd.unused.map((u) => SENSE_LABEL[u].en).join(", ")}`);
  }

  // Verbatim restatements — the countable slice of "redundant exposition"
  // (the #3 human-editor fix in AI prose per the LAMP corpus, CHI 2025).
  const restated = findRestatements(text, lang);
  if (restated.found.length) {
    L.push("", `verbatim restatements (≥${restated.window} tokens, word-for-word):`);
    for (const r of restated.found.slice(0, 8)) {
      const loc = r.chapters.length > 1 ? ` (ch ${r.chapters.join(",")})` : "";
      L.push(`  ×${r.count}${loc}  "${r.phrase.length > 70 ? r.phrase.slice(0, 70) + "…" : r.phrase}"`);
    }
    L.push("  (verbatim only — paraphrased redundancy needs a human read)");
  }

  // Near-verbatim repeats: winnowing fingerprints nominate candidate pairs; every
  // pair is verified with an exact token diff before it can appear here.
  const near = findNearRestatements(text, lang);
  if (near.found.length) {
    L.push("", "near-verbatim repeats (winnowed candidates, exact-verified):");
    for (const r of near.found.slice(0, 5)) {
      const loc = r.chaptersA !== r.chaptersB ? ` (ch ${r.chaptersA}→${r.chaptersB})` : "";
      L.push(`  ${r.sharedTokens}/${r.totalTokens}${loc}  "${r.b.length > 60 ? r.b.slice(0, 60) + "…" : r.b}"`);
      if (r.changed.length) L.push(`     changed: ${r.changed.join(", ")}`);
    }
  }

  const led = consistencyLedger(text, lang);
  if (led.chapters > 1) {
    L.push("", `consistency across ${led.chapters} chapters:`);
    if (led.variantClusters.length) L.push("  spelling variants: " + led.variantClusters.slice(0, 8).map((c) => c.map((t) => t.term).join("≈")).join(" · "));
    if (led.dropped.length) L.push("  introduced then dropped: " + led.dropped.slice(0, 8).map((t) => `${t.term}×${t.count}`).join(", "));
    if (!led.variantClusters.length && !led.dropped.length) L.push("  (no variants or dropped terms flagged)");
  }

  const bible = storyBible(text, lang, 3);
  if (bible.entries.length) {
    L.push("", "story bible (top recurring entities):");
    for (const e of bible.entries.slice(0, 10)) L.push(`  ${e.term} ×${e.count} · ch ${e.firstChapter}–${e.lastChapter}`);
  }

  if (lang === "th") {
    const reg = checkThaiRegister(text);
    if (reg.length) {
      L.push("", "word/spelling suggestions (standard Thai — not errors):");
      for (const r of reg.slice(0, 10)) L.push(`  ${r.term} ×${r.count} → ${r.suggest}${r.note ? ` (${r.note})` : ""}`);
    }
  }

  L.push("", "counts, not a verdict · deterministic · Thai bounded by segmentation");
  return { stdout: L.join("\n") + "\n", stderr: "", code: 0 };
}

function readFile(file: string | undefined, read?: (p: string) => string): { text: string } | CliResult {
  if (!file) return { stdout: "", stderr: "needs a file argument\n", code: 2 };
  if (!read) return { stdout: "", stderr: "no file reader available\n", code: 1 };
  try {
    return { text: read(file) };
  } catch {
    return { stdout: "", stderr: `cannot read "${file}"\n`, code: 1 };
  }
}

function cmdRename(file: string | undefined, flags: Record<string, string | true>, read?: (p: string) => string): CliResult {
  const from = typeof flags.from === "string" ? flags.from : "";
  const to = typeof flags.to === "string" ? flags.to : "";
  if (!from || !to) return { stdout: "", stderr: "rename needs --from <name> --to <name>\n", code: 2 };
  const r = readFile(file, read);
  if ("code" in r) return r;
  const lang: "th" | "en" = flags.lang === "en" ? "en" : /[฀-๿]/.test(r.text) ? "th" : "en";
  const res = renameTerm(r.text, from, to, lang);
  if (flags.write) return { stdout: res.text, stderr: "", code: 0 };
  const L = [`# rename "${from}" → "${to}" — ${res.total} hit(s)`];
  for (const p of res.perChapter) L.push(`  chapter ${p.chapter}: ${p.count}`);
  if (res.targetPreexisting > 0) L.push(`  ⚠ "${to}" already appears ${res.targetPreexisting}× (possible collision)`);
  L.push("", "run again with --write to output the rewritten manuscript.");
  return { stdout: L.join("\n") + "\n", stderr: "", code: 0 };
}

function cmdRelations(file: string | undefined, flags: Record<string, string | true>, read?: (p: string) => string): CliResult {
  const names = (typeof flags.names === "string" ? flags.names : "").split(",").map((n) => n.trim()).filter(Boolean);
  if (!names.length) return { stdout: "", stderr: 'relations needs --names "A,B,C"\n', code: 2 };
  const r = readFile(file, read);
  if ("code" in r) return r;
  const lang: "th" | "en" = flags.lang === "en" ? "en" : /[฀-๿]/.test(r.text) ? "th" : "en";
  const g = characterGraph(r.text, names, lang);
  const L = [`# relationship graph — ${g.chapters} chapters`, "", "characters (by mentions):"];
  for (const n of g.nodes) L.push(`  ${n.name} ×${n.mentions} · ch ${n.chapters.join(",")}`);
  L.push("", "shares scenes (edge = shared chapters):");
  if (!g.edges.length) L.push("  (no shared-chapter connections)");
  for (const e of g.edges.slice(0, 20)) L.push(`  ${e.a} ↔ ${e.b} · ${e.weight}× (ch ${e.chapters.join(",")})`);
  L.push("", "structure is a real count · labels (mentor/rival) are the writer's call");
  return { stdout: L.join("\n") + "\n", stderr: "", code: 0 };
}

function cmdRadar(file: string | undefined, flags: Record<string, string | true>, read?: (p: string) => string): CliResult {
  const canon = (typeof flags.canon === "string" ? flags.canon : "").split(",").map((n) => n.trim()).filter(Boolean);
  if (!canon.length) return { stdout: "", stderr: 'radar needs --canon "A,B,C" (the declared cast)\n', code: 2 };
  const r = readFile(file, read);
  if ("code" in r) return r;
  const lang: "th" | "en" = flags.lang === "en" ? "en" : /[฀-๿]/.test(r.text) ? "th" : "en";
  const findings = continuityRadar(r.text, canon, lang);
  const L = [`# continuity radar — canon of ${canon.length}`];
  const unused = findings.filter((f) => f.kind === "unused-canon");
  const off = findings.filter((f) => f.kind === "off-canon");
  if (unused.length) { L.push("", "canon names not used:"); for (const f of unused) L.push(`  ${f.term}`); }
  if (off.length) { L.push("", "off-canon (used but not declared — drift/typo?):"); for (const f of off) L.push(`  ${f.term} ×${f.count}`); }
  if (!findings.length) L.push("", "no drift — every canon name is used and no undeclared name recurs.");
  L.push("", "counts, not a verdict · declare renames in your glossary to clear them");
  return { stdout: L.join("\n") + "\n", stderr: "", code: 0 };
}

function cmdCodex(file: string | undefined, flags: Record<string, string | true>, read?: (p: string) => string): CliResult {
  const bibleFile = typeof flags.bible === "string" ? flags.bible : "";
  if (!bibleFile) return { stdout: "", stderr: 'codex needs --bible <bible.md> (the declared Story Codex)\n', code: 2 };
  const bible = readFile(bibleFile, read);
  if ("code" in bible) return bible;
  const codex = parseCodex(bible.text);
  if (!codex.entities.length) {
    return { stdout: "", stderr: `no entities declared in "${bibleFile}" — use [ตัวละคร]/[CHARACTERS] etc. sections\n`, code: 2 };
  }
  // --graph draws the declared cast as a Mermaid graph (no draft needed).
  if (flags.graph) return { stdout: codexMermaid(codex) + "\n", stderr: "", code: 0 };

  const draft = readFile(file, read);
  if ("code" in draft) return draft;
  const lang: "th" | "en" = flags.lang === "en" ? "en" : /[฀-๿]/.test(draft.text) ? "th" : "en";
  const audit = codexAudit(codex, draft.text, lang);
  let out = formatCodexAudit(audit, lang);

  // The codex IS the canon — layer the radar's off-canon drift on top.
  const off = continuityRadar(draft.text, codexCanon(codex), lang).filter((f) => f.kind === "off-canon");
  if (off.length) {
    out += (lang === "th" ? "\noff-canon (ใช้แต่ไม่ได้ประกาศ — drift/typo?):\n" : "\noff-canon (used but not declared — drift/typo?):\n");
    for (const f of off.slice(0, 20)) out += `  ${f.term} ×${f.count}\n`;
  }
  return { stdout: out, stderr: "", code: 0 };
}

function cmdSaga(flags: Record<string, string | true>, read?: (p: string) => string): CliResult {
  const files = (typeof flags.books === "string" ? flags.books : "").split(",").map((s) => s.trim()).filter(Boolean);
  if (files.length < 2) return { stdout: "", stderr: 'saga needs --books "b1.md,b2.md,..." (≥2, in series order)\n', code: 2 };
  const titles = (typeof flags.titles === "string" ? flags.titles : "").split(",").map((s) => s.trim());

  const books: SagaBook[] = [];
  let anyThai = false;
  for (let i = 0; i < files.length; i++) {
    const r = readFile(files[i], read);
    if ("code" in r) return r;
    if (/[฀-๿]/.test(r.text)) anyThai = true;
    const codex = parseCodex(r.text);
    if (!codex.entities.length) return { stdout: "", stderr: `no entities declared in "${files[i]}" — use [ตัวละคร]/[CHARACTERS] etc. sections\n`, code: 2 };
    books.push({ title: titles[i] || files[i], codex });
  }
  const lang: "th" | "en" = flags.lang === "en" ? "en" : flags.lang === "th" ? "th" : anyThai ? "th" : "en";
  return { stdout: formatSaga(analyzeSaga(books), lang), stderr: "", code: 0 };
}

function cmdOpeners(file: string | undefined, flags: Record<string, string | true>, read?: (p: string) => string): CliResult {
  const r = readFile(file, read);
  if ("code" in r) return r;
  const lang: "th" | "en" = flags.lang === "en" ? "en" : flags.lang === "th" ? "th" : /[฀-๿]/.test(r.text) ? "th" : "en";
  return { stdout: formatOpeners(analyzeOpeners(r.text, lang), lang), stderr: "", code: 0 };
}

function cmdExcess(file: string | undefined, flags: Record<string, string | true>, read?: (p: string) => string): CliResult {
  const baseFile = typeof flags.baseline === "string" ? flags.baseline : "";
  if (!baseFile) return { stdout: "", stderr: 'excess needs --baseline <human.md> (the reference corpus)\n', code: 2 };
  const suspect = readFile(file, read);
  if ("code" in suspect) return suspect;
  const base = readFile(baseFile, read);
  if ("code" in base) return base;
  const lang: "th" | "en" = flags.lang === "en" ? "en" : flags.lang === "th" ? "th" : /[฀-๿]/.test(suspect.text) ? "th" : "en";
  const min = Math.max(2, parseInt(String(flags.min ?? ""), 10) || 5);
  return { stdout: formatExcess(excessVocabulary(base.text, suspect.text, lang, min), lang), stderr: "", code: 0 };
}

function cmdScene(file: string | undefined, flags: Record<string, string | true>, read?: (p: string) => string): CliResult {
  const r = readFile(file, read);
  if ("code" in r) return r;
  if (!/[฀-๿]/.test(r.text) && flags.lang !== "th") return { stdout: "", stderr: "scene readout is Thai-only for now\n", code: 2 };
  const sens = sensoryDensity(r.text, "th");
  const s = sceneReadout(r.text, analyzeThai, sens.per1k);
  const L = [
    "# scene readout — measured signals (NOT 0–100 vibe scores)",
    "",
    `  words            ${s.words}`,
    `  clauses          ${s.clauses}`,
    `  rhythm cv        ${s.rhythmCv}   (variation in clause length — flat prose reads low)`,
    `  dialogue ratio   ${s.dialogueRatio}%`,
    `  telling /100     ${s.tellingPer100}   (named-emotion / filter-verb density)`,
    `  sensory /1k      ${s.sensoryPer1k}`,
    `  AI-tell clichés  ${s.aiTells}`,
    "",
    "every number is a real count you can re-derive — no subjective momentum/clarity/tension.",
  ];
  return { stdout: L.join("\n") + "\n", stderr: "", code: 0 };
}

function cmdNarrative(file: string | undefined, flags: Record<string, string | true>, read?: (p: string) => string): CliResult {
  const r = readFile(file, read);
  if ("code" in r) return r;
  if (!/[฀-๿]/.test(r.text) && flags.lang !== "th") return { stdout: "", stderr: "narrative intelligence is Thai-only for now\n", code: 2 };
  const names = (typeof flags.names === "string" ? flags.names : "").split(",").map((n) => n.trim()).filter(Boolean);
  const motifs = (typeof flags.motifs === "string" ? flags.motifs : "").split(",").map((m) => m.trim()).filter(Boolean);
  const signals = splitChapters(r.text).map((c) => {
    const a = analyzeThai(c.body);
    return {
      words: a.wordCount,
      dialogueRatio: a.dialogue.ratio,
      tellingPer100: a.wordCount ? Math.round((a.telling.count / a.wordCount) * 1000) / 10 : 0,
      sensoryPer1k: sensoryDensity(c.body, "th").per1k,
    };
  });
  const L: string[] = ["# narrative intelligence — counts & flags, never a 0–100 score", ""];

  if (names.length) {
    const arcs = characterArc(r.text, names, "th");
    L.push("character presence (mentions per chapter):");
    for (const c of arcs.characters.filter((x) => x.total > 0)) {
      const bar = c.perChapter.map((n) => (n === 0 ? "·" : String(Math.min(n, 9)))).join("");
      const warn = [c.gaps.length ? `gap ch ${c.gaps.map((g) => `${g.from}-${g.to}`).join(",")}` : "", c.exitsEarly ? "exits-early" : ""].filter(Boolean).join(" · ");
      L.push(`  ${c.name.padEnd(10)} [${bar}] ch ${c.firstChapter}–${c.lastChapter}${warn ? "  ⚠ " + warn : ""}`);
    }
    L.push("");
  }

  const pacing = pacingProfile(signals);
  if (pacing.acts.length) {
    L.push("pacing by act (measured averages):");
    for (const a of pacing.acts) L.push(`  ${a.act.padEnd(9)} ch ${a.chapters[0]}–${a.chapters[a.chapters.length - 1]}: words ${a.avgWords} · dialogue ${a.avgDialogue}% · telling/100 ${a.avgTelling} · sensory/1k ${a.avgSensory}`);
    for (const f of pacing.flags) L.push(`  ⚠ ${f}`);
    L.push("");
  }

  if (motifs.length) {
    const m = motifTracker(r.text, motifs, "th");
    L.push("motif / theme distribution:");
    for (const t of m.motifs) L.push(`  ${t.term.padEnd(12)} ${t.total}× · in ${t.chaptersPresent}/${m.chapters} ch${t.longestAbsentRun >= 3 ? `  ⚠ silent ${t.longestAbsentRun} ch` : ""}`);
    L.push("");
  }

  // Ending-hook devices per chapter — presence facts, not a "hook strength" score.
  const chapterList = splitChapters(r.text);
  if (chapterList.length) {
    L.push("ending-hook devices (last ~400 chars of each chapter):");
    chapterList.forEach((c, i) => {
      const h = hookSignal(c.body, "th");
      const found = [h.hasQuestion ? "คำถาม" : "", h.hasEllipsis ? "จุดไข่ปลา" : "", h.tensionWords.length ? `คำตึง: ${h.tensionWords.slice(0, 3).join("/")}` : ""].filter(Boolean);
      L.push(`  ch ${i + 1}: ${found.length ? found.join(" · ") : "— ไม่พบ device (จบเงียบอาจตั้งใจ — ผู้เขียนตัดสิน)"}`);
    });
    L.push("");
  }

  L.push("every number is a re-derivable count · gaps/flags fire at a disclosed threshold · no invented arc/pacing/resonance score.");
  return { stdout: L.join("\n") + "\n", stderr: "", code: 0 };
}

export function runCli(argv: string[], io?: { read?: (path: string) => string }): CliResult {
  const { positional, flags } = parseFlags(argv);
  const cmd = positional[0];
  if (!cmd || cmd === "help" || flags.help || flags.h) return { stdout: HELP, stderr: "", code: 0 };
  if (cmd === "prompts") return cmdPrompts(flags);
  if (cmd === "analyze") return cmdAnalyze(positional[1], flags, io?.read);
  if (cmd === "rename") return cmdRename(positional[1], flags, io?.read);
  if (cmd === "relations") return cmdRelations(positional[1], flags, io?.read);
  if (cmd === "radar") return cmdRadar(positional[1], flags, io?.read);
  if (cmd === "codex") return cmdCodex(positional[1], flags, io?.read);
  if (cmd === "saga") return cmdSaga(flags, io?.read);
  if (cmd === "openers") return cmdOpeners(positional[1], flags, io?.read);
  if (cmd === "excess") return cmdExcess(positional[1], flags, io?.read);
  if (cmd === "scene") return cmdScene(positional[1], flags, io?.read);
  if (cmd === "narrative") return cmdNarrative(positional[1], flags, io?.read);
  return { stdout: "", stderr: `unknown command "${cmd}". try: rush help\n`, code: 2 };
}
