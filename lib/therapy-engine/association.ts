// ╔══════════════════════════════════════════════════════════════════╗
// ║  ASSOCIATION — "does practising help?", answered properly.        ║
// ║                                                                    ║
// ║  This is the question every self-tracking user actually wants      ║
// ║  answered, and the one such products answer worst. The usual       ║
// ║  treatment is a scatter plot with a trend line through five        ║
// ║  points, which is not a weak finding — it is not a finding.        ║
// ║                                                                    ║
// ║  Three walls stand between this data and a claim, and this module  ║
// ║  puts all three in the output rather than in a disclaimer:         ║
// ║                                                                    ║
// ║  1. ARITHMETIC. Below five paired observations, NO arrangement of  ║
// ║     the data can reach p < .05 two-tailed. With four pairs the     ║
// ║     most extreme of the 24 orderings has p = .083. So under five   ║
// ║     pairs there is nothing to compute, and a number printed there  ║
// ║     would be decoration.                                           ║
// ║  2. POWER. Above that floor the bar is still brutally high: at     ║
// ║     six pairs you need |ρ| ≥ .89 before p drops under .05. The     ║
// ║     dashboard prints that bar next to the observed value, so a     ║
// ║     null result reads as "this study was too small to see it"      ║
// ║     rather than as "there is no effect".                           ║
// ║  3. DESIGN. Even a significant ρ here is one person, observed, un- ║
// ║     randomised, with the direction of causation undetermined —     ║
// ║     feeling better makes practising easier, which produces exactly ║
// ║     the same correlation as practising making you feel better.     ║
// ║     No arrangement of this data distinguishes them.                ║
// ║                                                                    ║
// ║  So the strongest sentence this module will ever emit is "worth    ║
// ║  looking at with someone", and it says so in the type: there is no ║
// ║  field here that could be rendered as a causal claim.              ║
// ╚══════════════════════════════════════════════════════════════════╝

import {
  EXACT_PERMUTATION_MAX_N,
  pearson,
  rank,
  spearmanApproxP,
  spearmanP,
} from "./stats";

/** Two-tailed α everything here is judged at. */
export const ALPHA = 0.05;

/**
 * The smallest number of paired observations at which p < .05 is attainable
 * at all.
 *
 * Not a convention. With n pairs there are n! orderings; the two most extreme
 * (perfect agreement and perfect reversal) make up 2/n! of them, so the
 * smallest two-tailed p attainable is 2/n!. That is .083 at n = 4 and .017 at
 * n = 5 — the floor is arithmetic, and `minimumPairs` computes it rather than
 * asserting it.
 */
export function minimumPairs(alpha = ALPHA): number {
  let n = 2;
  let factorial = 2;
  while (2 / factorial > alpha) {
    n++;
    factorial *= n;
    if (n > 20) break;
  }
  return n;
}

const criticalCache = new Map<string, number>();

/**
 * The smallest |ρ| that would reach significance with `n` untied pairs.
 *
 * For the sizes this product produces, computed by enumerating all n!
 * orderings and reading off the value whose tail is at most α — which is the
 * definition of the tabled critical value, not an approximation to it. Past
 * the enumeration limit, found by bisection on the large-sample p, which is
 * monotone in |ρ|.
 *
 * This is the number that turns a null result from "no effect" into "too few
 * measurements to see one", and it is the most useful thing on the panel.
 */
export function criticalRho(n: number, alpha = ALPHA): number {
  if (n < minimumPairs(alpha)) return 1;
  const key = `${n}:${alpha}`;
  const cached = criticalCache.get(key);
  if (cached !== undefined) return cached;

  let result: number;
  if (n <= EXACT_PERMUTATION_MAX_N) {
    const base = Array.from({ length: n }, (_, i) => i + 1);
    const magnitudes: number[] = [];
    const permuted = base.slice();
    const visit = (k: number): void => {
      if (k === n) {
        magnitudes.push(Math.abs(pearson(base, permuted)));
        return;
      }
      for (let i = k; i < n; i++) {
        [permuted[k], permuted[i]] = [permuted[i], permuted[k]];
        visit(k + 1);
        [permuted[k], permuted[i]] = [permuted[i], permuted[k]];
      }
    };
    visit(0);
    magnitudes.sort((a, b) => b - a);

    // The critical value is the SMALLEST |ρ| whose whole upper tail still fits
    // inside α — which means counting the tail at each DISTINCT value, not
    // taking the element at position ⌊αN⌋. The distribution of |ρ| is heavily
    // tied (every adjacent swap gives the same value), so a positional index
    // lands in the middle of a tie group and reports a value whose real tail
    // is far bigger than α: at n = 5 it gave 0.90, whose tail is 10/120 =
    // .083, where the tabled answer is 1.00.
    const EPS = 1e-9;
    let tail = 0;
    let best = 1;
    for (let i = 0; i < magnitudes.length; i++) {
      tail++;
      const last = i + 1 === magnitudes.length;
      // Only decide at the end of a run of equal magnitudes: half a tie group
      // is not a tail.
      if (!last && Math.abs(magnitudes[i + 1] - magnitudes[i]) < EPS) continue;
      if (tail / magnitudes.length <= alpha) best = magnitudes[i];
      else break;
    }
    result = best;
  } else {
    let low = 0;
    let high = 1;
    for (let i = 0; i < 60; i++) {
      const mid = (low + high) / 2;
      if (spearmanApproxP(mid, n) > alpha) low = mid;
      else high = mid;
    }
    result = high;
  }
  criticalCache.set(key, result);
  return result;
}

export interface PairedObservation {
  /** A label for the period, for the UI to put on an axis. */
  label: string;
  /** The exposure: practice minutes in the period. */
  dose: number;
  /** The outcome: the instrument total measured at the end of the period. */
  outcome: number;
}

export type AssociationVerdict =
  /** Fewer pairs than can produce a significant result at all. */
  | "impossible"
  /** Enough pairs to test, but the observed |ρ| did not clear the bar. */
  | "inconclusive"
  /** Cleared the bar, and is therefore worth raising with a clinician. */
  | "worth-discussing";

export interface AssociationResult {
  n: number;
  /** Null when there are too few pairs to compute anything meaningful — the
   *  type refuses to hand the UI a number it would have to caveat away. */
  rho: number | null;
  p: number | null;
  /** True when `p` came from enumerating every ordering rather than from the
   *  large-sample formula. */
  exact: boolean;
  /** The |ρ| this many pairs would have needed. */
  requiredRho: number;
  minimumPairs: number;
  verdict: AssociationVerdict;
  /** What this does and does not license, in one sentence. Never a causal
   *  claim, at any verdict. */
  noteTh: string;
}

const DESIGN_CAVEAT =
  "ถึงอย่างนั้นก็ยังบอกทิศทางของเหตุไม่ได้ — การรู้สึกดีขึ้นทำให้ฝึกได้ง่ายขึ้น " +
  "ซึ่งให้ความสัมพันธ์หน้าตาเหมือนกันทุกประการกับการที่การฝึกทำให้ดีขึ้น และนี่คือข้อมูลของคนเดียว ไม่มีกลุ่มเปรียบเทียบ";

/**
 * Test whether practice dose and symptom score move together.
 *
 * Spearman rather than Pearson because a dose-response need not be a straight
 * line, and because ranks are robust to the one enormous week that a
 * self-tracker inevitably has.
 */
export function associate(
  pairs: readonly PairedObservation[],
  alpha = ALPHA
): AssociationResult {
  const n = pairs.length;
  const floor = minimumPairs(alpha);

  if (n < floor) {
    return {
      n,
      rho: null,
      p: null,
      exact: true,
      requiredRho: 1,
      minimumPairs: floor,
      verdict: "impossible",
      noteTh:
        `มีข้อมูลจับคู่ได้ ${n} ช่วง — ต่ำกว่า ${floor} ช่วงไม่มีการจัดเรียงข้อมูลแบบใดเลย` +
        `ที่จะให้ p < ${alpha} ได้ จึงยังไม่คำนวณค่าความสัมพันธ์ เพราะตัวเลขที่ได้จะไม่มีความหมาย`,
    };
  }

  const doses = pairs.map((p) => p.dose);
  const outcomes = pairs.map((p) => p.outcome);

  // A series with no variance has no correlation to find, and saying "ρ = 0,
  // p = 1" implies a test was run on something testable.
  const flat =
    new Set(rank(doses)).size === 1 || new Set(rank(outcomes)).size === 1;
  if (flat) {
    return {
      n,
      rho: null,
      p: null,
      exact: true,
      requiredRho: criticalRho(n, alpha),
      minimumPairs: floor,
      verdict: "impossible",
      noteTh:
        "ค่าด้านใดด้านหนึ่งเท่ากันทุกช่วง — ไม่มีความแปรปรวนให้หาความสัมพันธ์ได้",
    };
  }

  const { rho, p, exact } = spearmanP(doses, outcomes);
  const requiredRho = criticalRho(n, alpha);
  const significant = p < alpha;

  // On both scales a HIGHER score means more symptoms, so a negative ρ — more
  // practice, lower score — is the direction that would favour the practice.
  const direction = rho < 0 ? "ฝึกมากแล้วคะแนนอาการต่ำลง" : "ฝึกมากแล้วคะแนนอาการสูงขึ้น";

  return {
    n,
    rho,
    p,
    exact,
    requiredRho,
    minimumPairs: floor,
    verdict: significant ? "worth-discussing" : "inconclusive",
    noteTh: significant
      ? `${direction} (ρ = ${rho.toFixed(2)}, p = ${p.toFixed(3)}${exact ? " แบบนับทุกการจัดเรียง" : " แบบประมาณ"}) — ` +
        `เป็นเรื่องที่ควรเอาไปคุยกับผู้ให้การรักษา · ${DESIGN_CAVEAT}`
      : `ρ = ${rho.toFixed(2)} จาก ${n} ช่วง ซึ่งยังไม่ถึง ${requiredRho.toFixed(2)} ที่ข้อมูลจำนวนนี้ต้องใช้ — ` +
        `แปลว่าข้อมูลยังน้อยเกินกว่าจะมองเห็น ไม่ใช่ว่าไม่มีผล`,
  };
}
