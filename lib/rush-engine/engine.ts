// ╔══════════════════════════════════════════════════════════════════╗
// ║  RUSH ENGINE — public barrel                                      ║
// ║  Re-exports the split modules and defines the pack orchestrator.  ║
// ║  Import everything from "@/lib/rush-engine/engine".               ║
// ╚══════════════════════════════════════════════════════════════════╝

export * from "./types";
export * from "./book-types";
export * from "./standards";
export * from "./context";
export * from "./architecture";
export * from "./core-prompts";
export * from "./modules";
export * from "./kdp";
export * from "./epub";
export * from "./consistency";
export * from "./sensory";
export * from "./starter";
export * from "./translation";
export * from "./register";
export * from "./rename";
export * from "./relationships";
export * from "./radar";
export * from "./narrative";
export * from "./thai-structures";
export * from "./bootstraps";
export * from "./codex";
export * from "./saga";
export * from "./openers";
export * from "./restatement";
export * from "./excess";
export * from "./epistemics";
export { estimateTokens } from "./text-util";
export * from "./config-diff";
export { TH_GROUP_LABEL } from "./th";

import { buildArchitecture } from "./architecture";
import {
  generateAnalysisPrompt,
  generateBackMatterPrompt,
  generateChapterPrompt,
  generateFeedbackChainPrompt,
  generateFrontMatterPrompt,
  generateMasterSystemPrompt,
  generateOverviewPrompt,
  generateRevisionPrompt,
} from "./core-prompts";
import { MODULE_CATALOG } from "./modules";
import {
  TH_META,
  TH_MODULES,
  thAnalysis,
  thBackMatter,
  thChapter,
  thChapterMeta,
  thFeedback,
  thFrontMatter,
  thMaster,
  thOverview,
  thRevision,
} from "./th";
import type { BookConfig, GeneratedPrompt, PromptGroup } from "./types";

/** Build the complete prompt pack. Core writing prompts are always included;
 *  optional module `groups` append their modules. When promptLanguage === "th",
 *  native Thai builders are used (no regex post-processing). Pure / client-safe. */
export function generateAllPrompts(config: BookConfig, groups: Exclude<PromptGroup, "core">[] = []): GeneratedPrompt[] {
  const th = config.promptLanguage === "th";
  const architecture = buildArchitecture(config);
  const prompts: GeneratedPrompt[] = [];
  const core = (id: string, name: string, description: string, usage: string, prompt: string): GeneratedPrompt => ({
    id, group: "core", name, description, usage, prompt,
  });

  prompts.push(core("MASTER", "Master System Prompt", "Use this as the system prompt for ALL writing sessions.", "Set as the system prompt before any chapter writing.",
    th ? thMaster(config, architecture) : generateMasterSystemPrompt(config, architecture)));
  prompts.push(core("OVERVIEW", "Book Overview / Plan", "Establishes the complete book plan.", "Send once before writing Chapter 1.",
    th ? thOverview(config, architecture) : generateOverviewPrompt(config, architecture)));
  architecture.chapters.forEach((ch, idx) => {
    prompts.push(core(`CH_${ch.number}`, `Chapter ${ch.number}`, ch.purpose, `Send to write Chapter ${ch.number} (${ch.type ?? ch.sceneType ?? "section"}).`,
      th ? thChapter(config, architecture, idx, config.storyBible) : generateChapterPrompt(config, architecture, idx, { storyBible: config.storyBible })));
  });
  prompts.push(core("ANALYSIS", "Quality Analysis Prompt", "Analyze each chapter draft for quality.", "Send after each chapter draft with the draft text.",
    th ? thAnalysis(config) : generateAnalysisPrompt(config)));
  prompts.push(core("REVISION", "Revision Prompt", "Revise a chapter based on analysis feedback.", "Send with the draft + analysis report to revise.",
    th ? thRevision(config) : generateRevisionPrompt(config)));
  prompts.push(core("FRONT_MATTER", "Front Matter", "Title page, dedication, table of contents, preface.", "Generate after all chapters are written.",
    th ? thFrontMatter(config) : generateFrontMatterPrompt(config)));
  prompts.push(core("BACK_MATTER", "Back Matter", "Appendices, bibliography, index, about the author.", "Generate after the front matter.",
    th ? thBackMatter(config) : generateBackMatterPrompt(config)));
  prompts.push(core("FEEDBACK", "Inter-Chapter Feedback", "Analyze a finished chapter and brief the next one.", "Send after each chapter to generate feedback for the next.",
    th ? thFeedback(config) : generateFeedbackChainPrompt(config)));

  const wanted = new Set(groups);
  for (const m of MODULE_CATALOG) {
    if (m.group !== "core" && wanted.has(m.group)) {
      const body = th && TH_MODULES[m.id] ? TH_MODULES[m.id](config) : m.build(config);
      prompts.push({ id: m.id, group: m.group, name: m.name, description: m.description, usage: m.usage, prompt: body });
    }
  }

  // Localize card metadata (description/usage) in Thai mode.
  if (th) {
    return prompts.map((p) => {
      if (p.id.startsWith("CH_")) {
        const ch = architecture.chapters[parseInt(p.id.slice(3), 10) - 1];
        const meta = thChapterMeta(ch);
        return { ...p, description: meta.description, usage: meta.usage };
      }
      const meta = TH_META[p.id];
      return meta ? { ...p, description: meta.description, usage: meta.usage } : p;
    });
  }

  return prompts;
}
