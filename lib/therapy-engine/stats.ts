// ╔══════════════════════════════════════════════════════════════════╗
// ║  STATS — the p-value machinery, so nothing above it has to guess. ║
// ║                                                                    ║
// ║  A dashboard that draws a correlation without a p-value is drawing ║
// ║  a line through four points and calling it a finding. A dashboard  ║
// ║  that computes one from a formula somebody half-remembers is       ║
// ║  worse, because it looks rigorous. So the distributions are        ║
// ║  implemented properly here and tested against published table      ║
// ║  values, and association.ts is left with nothing to fudge.         ║
// ║                                                                    ║
// ║  Two regimes, because small samples are where this product lives.  ║
// ║  Assessments happen fortnightly; a three-month course gives six    ║
// ║  paired observations. At that size the large-sample approximations ║
// ║  everyone reaches for are wrong in the anti-conservative           ║
// ║  direction — they report significance that an exact test does not  ║
// ║  support. So n ≤ 8 is answered by ENUMERATING ALL PERMUTATIONS     ║
// ║  (8! = 40,320, nothing at all for a computer), which is not an     ║
// ║  approximation of the answer but the answer.                       ║
// ╚══════════════════════════════════════════════════════════════════╝

/** Lanczos approximation to log Γ(x), g = 7, n = 9. Accurate to ~15 digits
 *  across the range the beta function needs, which is all this is for. */
export function logGamma(x: number): number {
  const C = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) {
    // Reflection, so the series is only ever evaluated where it converges.
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  }
  const z = x - 1;
  let a = C[0];
  const t = z + 7.5;
  for (let i = 1; i < 9; i++) a += C[i] / (z + i);
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Continued fraction for the incomplete beta, by the modified Lentz method. */
function betaContinuedFraction(a: number, b: number, x: number): number {
  const TINY = 1e-30;
  const EPS = 3e-14;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < TINY) d = TINY;
  d = 1 / d;
  let h = d;

  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    h *= d * c;

    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** Regularised incomplete beta I_x(a, b). */
export function incompleteBeta(a: number, b: number, x: number): number {
  if (!(x > 0)) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x)
  );
  // The fraction converges fast on one side of the symmetry point only; the
  // swap is what keeps it from crawling near x = 1.
  return x < (a + 1) / (a + b + 2)
    ? (front * betaContinuedFraction(a, b, x)) / a
    : 1 - (front * betaContinuedFraction(b, a, 1 - x)) / b;
}

/**
 * Two-tailed p for Student's t with `df` degrees of freedom.
 *
 * p = I_{df/(df+t²)}(df/2, 1/2), the standard identity. Exact enough to
 * reproduce a printed t-table to the digits a table prints.
 */
export function tTestTwoTailed(t: number, df: number): number {
  if (!Number.isFinite(t) || df <= 0) return 1;
  return incompleteBeta(df / 2, 0.5, df / (df + t * t));
}

/**
 * Average ranks, with ties sharing the mean of the ranks they span.
 *
 * Ties are the normal case here, not an edge: weekly practice minutes repeat,
 * and a week of 0 minutes repeats a lot. Assigning ties arbitrary distinct
 * ranks would make the correlation depend on the input order.
 */
export function rank(values: readonly number[]): number[] {
  const order = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const out = new Array<number>(values.length);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1].v === order[i].v) j++;
    const shared = (i + j) / 2 + 1; // ranks are 1-based
    for (let k = i; k <= j; k++) out[order[k].i] = shared;
    i = j + 1;
  }
  return out;
}

/** Pearson correlation. Returns 0 when either series has no variance, because
 *  a correlation with a constant is undefined and NaN must not reach a UI. */
export function pearson(xs: readonly number[], ys: readonly number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;
  const mean = (a: readonly number[]) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += a[i];
    return s / n;
  };
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return 0;
  return sxy / Math.sqrt(sxx * syy);
}

/** Spearman's ρ — Pearson on the ranks. */
export function spearman(xs: readonly number[], ys: readonly number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;
  return pearson(rank(xs.slice(0, n)), rank(ys.slice(0, n)));
}

/** Above this the permutation test is not run: n! grows past what belongs in
 *  a render. 8! is 40,320, which is instant; 9! is 362,880 and 10! is 3.6M. */
export const EXACT_PERMUTATION_MAX_N = 8;

/**
 * Exact two-tailed p for Spearman's ρ, by enumerating every permutation.
 *
 * The p-value is the proportion of pairings of the two series, over all n!
 * orderings, whose |ρ| is at least as extreme as the observed one. That is the
 * definition of the test rather than an approximation to it, and at the sample
 * sizes this product actually produces it differs materially from the
 * large-sample formula — always in the direction of claiming less.
 */
export function spearmanExactP(xs: readonly number[], ys: readonly number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 1;
  if (n > EXACT_PERMUTATION_MAX_N) {
    throw new RangeError(`n=${n} is past the exact test's limit of ${EXACT_PERMUTATION_MAX_N}`);
  }
  const rx = rank(xs.slice(0, n));
  const ry = rank(ys.slice(0, n));
  const observed = Math.abs(pearson(rx, ry));
  // Floating-point ranks recombine to slightly different sums depending on
  // permutation order; without a tolerance the observed arrangement itself can
  // fail its own >= test.
  const EPS = 1e-12;

  let atLeastAsExtreme = 0;
  let total = 0;
  const permuted = ry.slice();

  const visit = (k: number): void => {
    if (k === n) {
      total++;
      if (Math.abs(pearson(rx, permuted)) >= observed - EPS) atLeastAsExtreme++;
      return;
    }
    for (let i = k; i < n; i++) {
      [permuted[k], permuted[i]] = [permuted[i], permuted[k]];
      visit(k + 1);
      [permuted[k], permuted[i]] = [permuted[i], permuted[k]];
    }
  };
  visit(0);

  return atLeastAsExtreme / total;
}

/**
 * Large-sample two-tailed p for Spearman's ρ, via t = ρ√((n−2)/(1−ρ²)).
 *
 * Only used past the exact test's reach, where n is large enough for the
 * approximation to be sound.
 */
export function spearmanApproxP(rho: number, n: number): number {
  if (n < 3) return 1;
  if (Math.abs(rho) >= 1) return 0;
  const t = rho * Math.sqrt((n - 2) / (1 - rho * rho));
  return tTestTwoTailed(t, n - 2);
}

/** The p-value for Spearman's ρ, exact where it can be and approximate only
 *  where it must be. `exact` says which, so a caller can report it. */
export function spearmanP(
  xs: readonly number[],
  ys: readonly number[]
): { rho: number; p: number; n: number; exact: boolean } {
  const n = Math.min(xs.length, ys.length);
  const rho = spearman(xs, ys);
  if (n < 3) return { rho, p: 1, n, exact: true };
  if (n <= EXACT_PERMUTATION_MAX_N) {
    return { rho, p: spearmanExactP(xs, ys), n, exact: true };
  }
  return { rho, p: spearmanApproxP(rho, n), n, exact: false };
}
