// ╔══════════════════════════════════════════════════════════════════╗
// ║  THERAPY ENGINE — shared types.                                   ║
// ║                                                                    ║
// ║  MindBridge is a music-therapy platform, and the whole engine is   ║
// ║  bound by the same rule as lib/rush-engine: it may only report     ║
// ║  what it can actually compute. Concretely, for a health product    ║
// ║  that means three refusals baked into the type system:             ║
// ║                                                                    ║
// ║   1. No invented composite. There is no "wellness score 0–100".    ║
// ║      A score is the sum of a PUBLISHED instrument's items, and it  ║
// ║      carries that instrument's identity (`InstrumentId`) so the    ║
// ║      number can never be read apart from what produced it.         ║
// ║   2. No diagnosis. `SeverityBand` is a SCREENING band with the     ║
// ║      published cut-point that defines it — screening is not        ║
// ║      diagnosis, and `Interpretation.isDiagnosis` is always false.  ║
// ║   3. No unsourced efficacy. Every recommendation is an             ║
// ║      `Intervention` that MUST carry at least one `Citation`; the   ║
// ║      grade is a function of that evidence, not of our enthusiasm.  ║
// ╚══════════════════════════════════════════════════════════════════╝

/** The screening instruments this engine implements. Each is a real, published
 *  questionnaire — we do not invent instruments. */
export type InstrumentId = "gad7" | "phq9";

/** A single item on a screening instrument. */
export interface InstrumentItem {
  /** 1-based position, as printed on the published instrument. */
  n: number;
  /** English wording, as published. */
  en: string;
  /** Thai rendering. See INSTRUMENTS' banner: our own translation, NOT the
   *  separately-validated Thai edition — the distinction matters. */
  th: string;
  /** Items that must trigger a safety check regardless of total score. */
  safetyCritical?: boolean;
}

/** A response option on the instrument's Likert scale. */
export interface ResponseOption {
  value: number;
  en: string;
  th: string;
}

export interface Instrument {
  id: InstrumentId;
  /** Short name as cited in the literature, e.g. "GAD-7". */
  name: string;
  th: string;
  /** The recall window the items ask about, e.g. "the last 2 weeks". */
  windowEn: string;
  windowTh: string;
  /** The stem question every item completes. */
  stemEn: string;
  stemTh: string;
  items: InstrumentItem[];
  options: ResponseOption[];
  /** Lowest and highest possible totals — derived, never hardcoded at call sites. */
  min: number;
  max: number;
  /** Who published it and where. */
  source: Citation;
  /** Copyright / permission status, stated because reproducing an instrument
   *  without the right to do so is a real problem, not a footnote. */
  licence: string;
}

/** One screening band, defined by the published cut-point that opens it. */
export interface SeverityBand {
  id: "minimal" | "mild" | "moderate" | "moderatelySevere" | "severe";
  /** Inclusive lower bound — the published cut-point. */
  from: number;
  /** Inclusive upper bound. */
  to: number;
  en: string;
  th: string;
}

/** The result of scoring one completed instrument. */
export interface ScoreResult {
  instrument: InstrumentId;
  /** Sum of item responses. A direct count: same answers → same total, always. */
  total: number;
  band: SeverityBand;
  /** Items answered above zero, for the "what is driving this" readout. */
  endorsedItems: number[];
  /** True when any safetyCritical item was answered above zero. */
  safetyFlag: boolean;
}

/** What a score does and does not entitle the reader to conclude. */
export interface Interpretation {
  score: ScoreResult;
  /** Always false. A screening questionnaire cannot diagnose; the field exists
   *  so the claim is explicit in the data rather than assumed by the reader. */
  isDiagnosis: false;
  /** Plain-language reading of the band, in Thai. */
  th: string;
  /** The published operating characteristics of the cut-point, where they exist. */
  cutpointNote: string | null;
}

// ── Evidence ──────────────────────────────────────────────────────────────────

/** Strength of evidence behind an intervention, strongest → weakest.
 *  Ordered; `EVIDENCE_GRADES` carries the label and what each grade requires. */
export type EvidenceGrade = "strong" | "good" | "moderate" | "emerging";

/** A quantified effect, quoted from a named source. Null wherever we could not
 *  verify an exact quantity — a qualitative finding is honest, invented
 *  precision is not. */
export interface EffectSize {
  /** e.g. "SMD", "d", "mean difference (STAI)". */
  metric: string;
  value: number;
  /** Confidence interval, when the source reports one. */
  ci?: [number, number];
  /** What the number is measured in, when it is not unitless. */
  unit?: string;
}

export interface Citation {
  authors: string;
  year: number;
  title: string;
  venue: string;
  /** Trial/participant counts, where the source is a synthesis. */
  pooled?: { trials?: number; participants?: number };
  effect?: EffectSize | null;
}

/** How an intervention is delivered — the dose, in the units the studies used. */
export interface Dose {
  /** Minutes per session. A range, because the literature reports ranges. */
  minutesPerSession: [number, number];
  /** Sessions per week. */
  sessionsPerWeek: number;
  /** How long before the studied effect was observed, in weeks. */
  weeksToEffect: number;
  note?: string;
}

export interface Intervention {
  id: string;
  th: string;
  en: string;
  grade: EvidenceGrade;
  /** One sentence: what it is. */
  summaryTh: string;
  /** At least one — enforced by a test. An unsourced recommendation is a bug. */
  citations: Citation[];
  dose: Dose | null;
  /** Cost in THB per session; 0 for self-administered. */
  costThb: [number, number];
  /** Known harms/side-effects. Empty array means "none reported in the cited
   *  sources", which is NOT the same as "none exist" — see `harmsNote`. */
  harms: string[];
  harmsNote: string;
  /** What this engine cannot deliver, stated per-intervention. */
  limitationTh: string;
  /** Can the user do this today, inside this app, unsupervised? */
  selfAdministered: boolean;
}
