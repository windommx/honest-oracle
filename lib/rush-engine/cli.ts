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
  rush prompts --type <t> --genre <g> [--chapters n] [--words n] [--lang th|en] [--full]
  rush analyze <file.md> [--lang th|en]
  rush help

COMMANDS
  prompts   Generate the prompt pack for a book config (lists prompt ids + names).
            --full also prints each prompt body.
  analyze   Run the deterministic analyzers on a manuscript file (word/clause stats,
            sensory density, cross-chapter consistency, story bible, AI-tell clichés).

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
  L.push("", "counts, not a verdict · deterministic · Thai bounded by segmentation");
  return { stdout: L.join("\n") + "\n", stderr: "", code: 0 };
}

export function runCli(argv: string[], io?: { read?: (path: string) => string }): CliResult {
  const { positional, flags } = parseFlags(argv);
  const cmd = positional[0];
  if (!cmd || cmd === "help" || flags.help || flags.h) return { stdout: HELP, stderr: "", code: 0 };
  if (cmd === "prompts") return cmdPrompts(flags);
  if (cmd === "analyze") return cmdAnalyze(positional[1], flags, io?.read);
  return { stdout: "", stderr: `unknown command "${cmd}". try: rush help\n`, code: 2 };
}
