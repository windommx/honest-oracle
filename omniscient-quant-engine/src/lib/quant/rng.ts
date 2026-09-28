/**
 * Seeded RNG utilities — deterministic synthetic market generation.
 * mulberry32 + Box-Muller gaussian + Student-t sampling.
 */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gaussianFactory(rand: () => number): () => number {
  let spare: number | null = null;
  return function (): number {
    if (spare !== null) {
      const s = spare;
      spare = null;
      return s;
    }
    let u = 0;
    let v = 0;
    let s = 0;
    do {
      u = rand() * 2 - 1;
      v = rand() * 2 - 1;
      s = u * u + v * v;
    } while (s === 0 || s >= 1);
    const mul = Math.sqrt((-2 * Math.log(s)) / s);
    spare = v * mul;
    return u * mul;
  };
}

/** Student-t sample with df nu (via normal * sqrt(nu / chi2)) */
export function studentTFactory(rand: () => number, nu: number): () => number {
  const gauss = gaussianFactory(rand);
  // chi-square with nu dof via sum of squares (nu <= 8) or Wilson-Hilferty for larger
  return function (): number {
    if (nu <= 8) {
      let chi2 = 0;
      for (let i = 0; i < nu; i++) {
        const g = gauss();
        chi2 += g * g;
      }
      return gauss() * Math.sqrt(nu / chi2);
    }
    const z = gauss();
    const chi2 = nu * Math.pow(1 - 2 / (9 * nu) + Math.sqrt(2 / (9 * nu)) * z, 3);
    return z * Math.sqrt(nu / (chi2 / nu));
  };
}

/** Generate trading-day dates going back `n` days from the last weekday (deterministic). */
export function tradingDates(n: number, endDate?: Date): Date[] {
  const end = endDate ? new Date(endDate) : new Date();
  const cursor = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (cursor.getDay() === 0 || cursor.getDay() === 6) {
    cursor.setDate(cursor.getDate() - 1);
  }
  const out: Date[] = [];
  const probe = new Date(cursor);
  while (out.length < n) {
    const dow = probe.getDay();
    if (dow !== 0 && dow !== 6) out.push(new Date(probe));
    probe.setDate(probe.getDate() - 1);
  }
  return out.reverse();
}
