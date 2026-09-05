// Beneish (1999) M-score, eight-variable form. Flags earnings that look
// managed — relevant here because Daniel, Denis & Naveen (2008) show firms
// manage earnings upward precisely to avoid missing the dividend. A high M
// means the EPS coverage cell may be lying.
//   M = −4.84 + 0.920·DSRI + 0.528·GMI + 0.404·AQI + 0.892·SGI + 0.115·DEPI
//       − 0.172·SGAI + 4.679·TATA − 0.327·LVGI
// Beneish's cut-off: M > −1.78 (a stricter −2.22 is also used). This is a
// heuristic label (saññā): it may mis-fire, so it flags — never decides.

import type { AnnualRecord } from "./types";

export interface BeneishM {
  m: number | null;
  variables: Record<string, number> | null;
  missing: string[];
}

function need(r: AnnualRecord, keys: (keyof AnnualRecord)[]): string[] {
  return keys.filter((k) => r[k] === undefined).map(String);
}

export function beneishMScore(cur: AnnualRecord, prev: AnnualRecord): BeneishM {
  const req: (keyof AnnualRecord)[] = ["receivables", "cogs", "ppeNet", "sga", "depreciationAmortization"];
  const missing = Array.from(new Set(need(cur, req).concat(need(prev, req))));
  if (missing.length > 0) return { m: null, variables: null, missing };
  if (cur.revenue <= 0 || prev.revenue <= 0 || cur.totalAssets <= 0 || prev.totalAssets <= 0) {
    return { m: null, variables: null, missing: ["revenue/totalAssets must be > 0"] };
  }

  const c = cur as Required<Pick<AnnualRecord, "receivables" | "cogs" | "ppeNet" | "sga" | "depreciationAmortization">> & AnnualRecord;
  const p = prev as typeof c;

  const gm = (x: typeof c) => (x.revenue - x.cogs) / x.revenue;
  const aq = (x: typeof c) => 1 - (x.currentAssets + x.ppeNet) / x.totalAssets;
  const dep = (x: typeof c) => x.depreciationAmortization / (x.depreciationAmortization + x.ppeNet);
  const lev = (x: typeof c) => (x.longTermDebt + x.currentLiabilities) / x.totalAssets;

  const safe = (n: number, d: number) => (d === 0 ? null : n / d);
  const DSRI = safe(c.receivables / c.revenue, p.receivables / p.revenue);
  const GMI = safe(gm(p), gm(c));
  const AQI = safe(aq(c), aq(p));
  const SGI = c.revenue / p.revenue;
  const DEPI = safe(dep(p), dep(c));
  const SGAI = safe(c.sga / c.revenue, p.sga / p.revenue);
  const LVGI = safe(lev(c), lev(p));
  const TATA = (c.netIncome - c.cfo) / c.totalAssets;

  const vars = { DSRI, GMI, AQI, SGI, DEPI, SGAI, LVGI, TATA };
  const bad = Object.entries(vars).filter(([, v]) => v === null || !Number.isFinite(v)).map(([k]) => k);
  if (bad.length > 0) return { m: null, variables: null, missing: bad.map((k) => `${k} undefined (zero denominator)`) };
  const v = vars as Record<string, number>;

  const m =
    -4.84 + 0.92 * v.DSRI + 0.528 * v.GMI + 0.404 * v.AQI + 0.892 * v.SGI + 0.115 * v.DEPI - 0.172 * v.SGAI + 4.679 * v.TATA - 0.327 * v.LVGI;
  return { m, variables: v, missing: [] };
}
