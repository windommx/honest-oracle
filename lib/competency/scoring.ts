import {
  COMPETENCY_LEVELS,
  CRITERIA,
  CRITERION_COUNT,
  MANAGEMENT_LEVELS,
  MAX_POINT,
  MIN_POINT,
  POINT_MULTIPLIER,
  type CompetencyLevel,
  type Criterion,
  type CriterionLevel,
  type ManagementLevel,
} from "./criteria";

// ╔══════════════════════════════════════════════════════════════════╗
// ║  SCORING — pure, deterministic, and the ONLY place a total or a    ║
// ║  level is computed. The API stores what these return; the UI       ║
// ║  previews with the same functions, so screen and database can      ║
// ║  never disagree. No clock, no randomness.                          ║
// ╚══════════════════════════════════════════════════════════════════╝

/** criterionId (as a string key, "1".."10") → point 1-5. The stored JSON shape. */
export type Scores = Record<string, number>;

export const scoreKey = (criterionId: number): string => String(criterionId);

/** A criterion's score from its point: 1-5 → 2-10. */
export const scoreOfPoint = (point: number): number => point * POINT_MULTIPLIER;

/** Sum of point × 2 over whatever keys are present (a partial map previews a partial total). */
export function totalFromLevels(levels: Partial<Scores>): number {
  let total = 0;
  for (const c of CRITERIA) {
    const p = levels[scoreKey(c.id)];
    if (typeof p === "number" && Number.isFinite(p)) total += scoreOfPoint(p);
  }
  return total;
}

/** The scored competency band (1-5) of a total out of 100. See criteria.ts for the 50 case. */
export function bandOf(total: number): number {
  for (const l of COMPETENCY_LEVELS) {
    if (total >= l.min && total <= l.max) return l.level;
  }
  // Out of range: below 0 is not producible; above 100 is not either. Clamp honestly.
  return total < 0 ? 1 : 5;
}

export function levelInfo(level: number): CompetencyLevel {
  return COMPETENCY_LEVELS.find((l) => l.level === level) ?? COMPETENCY_LEVELS[0];
}

export function managementInfo(level: number | null | undefined): ManagementLevel | null {
  if (level == null) return null;
  return MANAGEMENT_LEVELS.find((l) => l.level === level) ?? null;
}

export function criterionById(id: number): Criterion | undefined {
  return CRITERIA.find((c) => c.id === id);
}

export function criterionLevel(criterion: Criterion, point: number): CriterionLevel | undefined {
  return criterion.levels.find((l) => l.point === point);
}

/**
 * Parse a stored scores value (Prisma Json / a string / anything) into a clean map.
 * Unknown keys and out-of-range values are DROPPED rather than tolerated, so a
 * corrupted row degrades to "incomplete" instead of producing a wrong total.
 */
export function parseScores(raw: unknown): Scores {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const out: Scores = {};
  for (const c of CRITERIA) {
    const p = (value as Record<string, unknown>)[scoreKey(c.id)];
    const n = typeof p === "string" ? Number(p) : p;
    if (typeof n === "number" && Number.isInteger(n) && n >= MIN_POINT && n <= MAX_POINT) {
      out[scoreKey(c.id)] = n;
    }
  }
  return out;
}

export interface ScoresValidation {
  ok: boolean;
  /** Criteria (in id order) that are missing or out of range. Empty when ok. */
  missing: Criterion[];
  /** Thai message naming the first problem, ready for a 400 response or a toast. */
  message: string | null;
}

/** Every criterion present and 1-5 — the rule the API enforces and the form previews. */
export function validateScores(levels: Partial<Scores> | null | undefined): ScoresValidation {
  const missing: Criterion[] = [];
  for (const c of CRITERIA) {
    const p = levels?.[scoreKey(c.id)];
    if (!(typeof p === "number" && Number.isInteger(p) && p >= MIN_POINT && p <= MAX_POINT)) missing.push(c);
  }
  if (missing.length === 0) return { ok: true, missing, message: null };
  const first = missing[0];
  return {
    ok: false,
    missing,
    message: `กรุณาเลือกระดับคะแนนของเกณฑ์ที่ ${first.id} (${first.name})`,
  };
}

export const isComplete = (levels: Partial<Scores>): boolean => validateScores(levels).ok;

/** Total + band in one call, for the API's create/update paths. Throws on incomplete scores. */
export function evaluate(levels: Scores): { totalScore: number; level: number } {
  const v = validateScores(levels);
  if (!v.ok) throw new Error(v.message ?? "incomplete scores");
  const totalScore = totalFromLevels(levels);
  return { totalScore, level: bandOf(totalScore) };
}

// ── Progress toward the next band ─────────────────────────────────────────────

export interface NextBand {
  level: CompetencyLevel;
  /** Points still needed to enter that band (its `min` minus the total). Always ≥ 1. */
  pointsNeeded: number;
}

/** The band above the current one, or null at LEVEL 5. */
export function nextBand(total: number): NextBand | null {
  const current = bandOf(total);
  const next = COMPETENCY_LEVELS.find((l) => l.level === current + 1);
  if (!next) return null;
  return { level: next, pointsNeeded: Math.max(1, next.min - total) };
}

// ── Development plan (gap analysis) ───────────────────────────────────────────
// For a head nurse the useful output of an assessment is not the number but "what
// does she need to do next". This is derived ENTIRELY from the rubric text the
// assessor already agreed to: the level chosen, and the level above it. Nothing is
// invented — it is a re-reading of the form, sorted so the weakest criteria come
// first.

export interface DevelopmentItem {
  criterion: Criterion;
  point: number;
  current: CriterionLevel;
  /** The next rung on this criterion; null when already at point 5. */
  next: CriterionLevel | null;
  /** Score gained on the total if the next rung is reached (always 2). */
  gain: number;
}

export interface DevelopmentPlan {
  /** Criteria below the maximum, weakest first (ties by criterion id). */
  items: DevelopmentItem[];
  /** Criteria already at point 5. */
  mastered: Criterion[];
  /** Criteria at the lowest point — the "urgent" tier. */
  urgent: Criterion[];
  total: number;
  level: CompetencyLevel;
  next: NextBand | null;
}

export function developmentPlan(levels: Scores): DevelopmentPlan {
  const items: DevelopmentItem[] = [];
  const mastered: Criterion[] = [];
  const urgent: Criterion[] = [];
  for (const c of CRITERIA) {
    const p = levels[scoreKey(c.id)];
    if (typeof p !== "number") continue;
    const current = criterionLevel(c, p);
    if (!current) continue;
    if (p >= MAX_POINT) {
      mastered.push(c);
      continue;
    }
    if (p <= MIN_POINT) urgent.push(c);
    items.push({ criterion: c, point: p, current, next: criterionLevel(c, p + 1) ?? null, gain: POINT_MULTIPLIER });
  }
  items.sort((a, b) => a.point - b.point || a.criterion.id - b.criterion.id);
  const total = totalFromLevels(levels);
  return { items, mastered, urgent, total, level: levelInfo(bandOf(total)), next: nextBand(total) };
}

/** Number of criteria — exported for UIs that show "x/10 selected". */
export const REQUIRED_CRITERIA = CRITERION_COUNT;
