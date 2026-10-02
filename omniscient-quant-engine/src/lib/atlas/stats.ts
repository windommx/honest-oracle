// ============================================================
// สถิติของ Atlas — bootstrap แบบบล็อก (คงความสัมพันธ์ตามเวลา), AUC แบบถ่วงน้ำหนัก, Spearman
// pure · deterministic (รับตัวสุ่มที่ seed แล้วจากผู้เรียก)
// ============================================================

import { mean, pearson, quantile } from '@/lib/quant/stats';
import type { AtlasCI } from './types';

/** อันดับ 1..n (ค่าซ้ำได้อันดับเฉลี่ย) */
export function ranks(xs: number[]): number[] {
  const idx = xs.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const r = new Array<number>(xs.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
    i = j + 1;
  }
  return r;
}

/** Spearman ρ = Pearson ของอันดับ */
export const spearman = (x: number[], y: number[]): number => (x.length < 3 ? 0 : pearson(ranks(x), ranks(y)));

/** ค่าเฉลี่ยของตัวอย่าง bootstrap แบบบล็อกวนรอบ (circular block) — block = 1 คือ bootstrap ธรรมดา */
function blockResampleMean(xs: number[], block: number, rng: () => number): number {
  const n = xs.length;
  let s = 0;
  let c = 0;
  while (c < n) {
    const start = Math.floor(rng() * n);
    for (let j = 0; j < block && c < n; j++) {
      s += xs[(start + j) % n];
      c++;
    }
  }
  return s / n;
}

/** ค่าเฉลี่ย + CI 95% จาก block bootstrap */
export function bootMean(xs: number[], rng: () => number, B: number, block = 1): AtlasCI {
  if (xs.length === 0) return { mean: 0, lo: 0, hi: 0 };
  const m = mean(xs);
  if (xs.length < 3) return { mean: m, lo: m, hi: m };
  const stats = Array.from({ length: B }, () => blockResampleMean(xs, block, rng));
  return { mean: m, lo: quantile(stats, 0.025), hi: quantile(stats, 0.975) };
}

/** ส่วนต่างค่าเฉลี่ยของสองกลุ่มอิสระ (a − b) + CI 95% จาก bootstrap */
export function bootDiff(a: number[], b: number[], rng: () => number, B: number): AtlasCI {
  const m = (a.length ? mean(a) : 0) - (b.length ? mean(b) : 0);
  if (a.length < 3 || b.length < 3) return { mean: m, lo: m, hi: m };
  const stats = Array.from({ length: B }, () => blockResampleMean(a, 1, rng) - blockResampleMean(b, 1, rng));
  return { mean: m, lo: quantile(stats, 0.025), hi: quantile(stats, 0.975) };
}

/** ส่วนต่างแบบจับคู่รายวัน (a[i] − b[i]) + CI 95% + p สองทาง จาก block bootstrap */
export function bootPaired(a: number[], b: number[], rng: () => number, B: number, block: number): AtlasCI & { p: number } {
  const d = a.map((v, i) => v - b[i]);
  const m = d.length ? mean(d) : 0;
  if (d.length < 3 || d.every((x) => x === 0)) return { mean: m, lo: m, hi: m, p: 1 };
  const stats = Array.from({ length: B }, () => blockResampleMean(d, block, rng));
  const le = stats.filter((s) => s <= 0).length / B;
  const ge = stats.filter((s) => s >= 0).length / B;
  return { mean: m, lo: quantile(stats, 0.025), hi: quantile(stats, 0.975), p: Math.min(1, Math.max(1 / B, 2 * Math.min(le, ge))) };
}

/**
 * AUC ของคะแนน s ในการแยก y = 1 จาก y = 0 (ค่าซ้ำนับครึ่ง) · order = ดัชนีเรียงคะแนนจากน้อยไปมาก (เรียงครั้งเดียว)
 * weights (ถ้ามี) = จำนวนครั้งที่แถวถูกสุ่มใน bootstrap · 0 = ไม่นับ — คำนวณ O(n) ต่อรอบ
 */
export function aucSorted(order: number[], s: ArrayLike<number>, y: ArrayLike<number>, w?: ArrayLike<number>): number {
  let negSeen = 0;
  let total = 0;
  let pos = 0;
  let neg = 0;
  let i = 0;
  while (i < order.length) {
    let j = i;
    let gp = 0;
    let gn = 0;
    const v = s[order[i]];
    while (j < order.length && s[order[j]] === v) {
      const k = order[j];
      const wt = w ? w[k] : 1;
      if (wt > 0) {
        if (y[k] === 1) gp += wt;
        else gn += wt;
      }
      j++;
    }
    total += gp * (negSeen + gn / 2);
    negSeen += gn;
    pos += gp;
    neg += gn;
    i = j;
  }
  return pos > 0 && neg > 0 ? total / (pos * neg) : 0.5;
}

/** N_eff = (Σx)² / Σx² — จำนวนหน่วย (เช่น เดือน) ที่ "มีน้ำหนักจริง" · x ≥ 0 */
export function nEff(xs: number[]): number {
  const s = xs.reduce((a, b) => a + b, 0);
  const s2 = xs.reduce((a, b) => a + b * b, 0);
  return s2 > 0 ? (s * s) / s2 : 0;
}
