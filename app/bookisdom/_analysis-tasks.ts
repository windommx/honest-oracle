// The analyzer task registry — ONE table shared by the web worker and the
// synchronous fallback, so both paths run byte-identical pure functions.
//
// Only passes MEASURED over the 50ms long-task threshold belong here
// (benchmarked at ~140k chars, 40 chapters, Node 22): analyzeThai 215ms ·
// scanThaiManuscript 202ms · findRestatements 140ms · analyzeOpeners 92ms ·
// (analyzeProse/scanManuscript are the EN twins of the Thai passes).
// sensoryDensity (54ms) and consistencyLedger (50ms) sit AT the threshold,
// not over it — they stay as plain useMemo until a measurement says otherwise.
//
// Everything in and out must be structured-cloneable (plain data, no functions).

import { analyzeThai, scanThaiManuscript, thaiDeltas } from "@/lib/bookisdom-engine/thai-analyzer";
import { analyzeProse, scanManuscript, proseDeltas } from "@/lib/bookisdom-engine/prose-analyzer";
import { findRestatements } from "@/lib/bookisdom-engine/restatement";
import { analyzeOpeners } from "@/lib/bookisdom-engine/openers";

export const ANALYSIS_TASKS = {
  analyzeThai: (text: string) => analyzeThai(text),
  thaiDeltas: (draft: string, revised: string) => thaiDeltas(analyzeThai(draft), analyzeThai(revised)),
  scanThai: (text: string) => scanThaiManuscript(text),
  analyzeProse: (text: string) => analyzeProse(text),
  proseDeltas: (draft: string, revised: string) => proseDeltas(analyzeProse(draft), analyzeProse(revised)),
  scanProse: (text: string) => scanManuscript(text),
  restatements: (text: string, lang: "th" | "en") => findRestatements(text, lang),
  openers: (text: string, lang: "th" | "en") => analyzeOpeners(text, lang),
} as const;

export type AnalysisTaskName = keyof typeof ANALYSIS_TASKS;
export type AnalysisTaskArgs<K extends AnalysisTaskName> = Parameters<(typeof ANALYSIS_TASKS)[K]>;
export type AnalysisTaskResult<K extends AnalysisTaskName> = ReturnType<(typeof ANALYSIS_TASKS)[K]>;
