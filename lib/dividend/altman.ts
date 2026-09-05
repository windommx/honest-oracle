// Altman Z'' (1995 revision for non-manufacturers / emerging markets):
//   Z'' = 6.56·X1 + 3.26·X2 + 6.72·X3 + 1.05·X4
//   X1 working capital / total assets     X2 retained earnings / total assets
//   X3 EBIT / total assets                X4 book equity / total liabilities
// Zones (Altman): > 2.6 safe · 1.1–2.6 grey · < 1.1 distress.
// A disclosed linear formula over filing counts → anumāna. The coefficients are
// Altman's, fitted on US firms; the zone cut-offs are a borrowed convention.

import type { AnnualRecord } from "./types";

export interface AltmanZ {
  z: number | null;
  zone: "safe" | "grey" | "distress" | null;
  x: { x1: number; x2: number; x3: number; x4: number } | null;
}

export function altmanZDoublePrime(r: AnnualRecord): AltmanZ {
  if (r.totalAssets <= 0 || r.totalLiabilities <= 0) return { z: null, zone: null, x: null };
  const x1 = (r.currentAssets - r.currentLiabilities) / r.totalAssets;
  const x2 = r.retainedEarnings / r.totalAssets;
  const x3 = r.ebit / r.totalAssets;
  const x4 = (r.totalAssets - r.totalLiabilities) / r.totalLiabilities;
  const z = 6.56 * x1 + 3.26 * x2 + 6.72 * x3 + 1.05 * x4;
  const zone = z > 2.6 ? "safe" : z >= 1.1 ? "grey" : "distress";
  return { z, zone, x: { x1, x2, x3, x4 } };
}
