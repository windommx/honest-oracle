// ============================================================
// ข้อมูล COT จำลอง (deterministic ต่อตลาด) — ใช้แทนรายงาน CFTC จริงเมื่อเข้าถึง cftc.gov ไม่ได้
//
// รักษาเอกลักษณ์ทางบัญชีของรายงานจริงทุกสัปดาห์:
//  - Σ long + Σ spread = Σ short + Σ spread = Open Interest (ทั้ง Disaggregated และ Legacy)
//  - Σ net ของทุกกลุ่ม = 0 (ทุกสัญญามีผู้ซื้อหนึ่งผู้ขายหนึ่ง)
//  - Legacy มาจาก Disaggregated: Commercials = Producer/Merchant + Swap Dealers (spread ของ swap นับทั้งสองข้าง)
//    Large Speculators (Non-commercials) = Managed Money + Other Reportables · Small Traders = Non-reportable
// พฤติกรรม: Managed Money ตามเทรนด์ราคา · Swap Dealers ถือสวนบางส่วน · Producer/Merchant ป้องกันความเสี่ยง (ปิดยอดให้ net รวม = 0)
// ============================================================

import { mulberry32, gaussianFactory } from '@/lib/quant/rng';
import type { CotPosition, CotWeek, DisaggGroup, LegacyGroup } from './types';
import type { MarketSpec } from './markets';

export const COT_HISTORY_WEEKS = 330; // แสดงได้ 3 ปี (156 สัปดาห์) + lookback ของ COT Index 36 เดือน (156 สัปดาห์)

const DAY = 86_400_000;

function hashSeed(s: string): number {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
}

/**
 * รายงาน COT ฉบับล่าสุดที่ "ควร" เผยแพร่แล้ว ณ now: ข้อมูล ณ วันอังคาร เผยแพร่วันศุกร์ 15:30 ET (~19:30 UTC)
 * เช่น now = จันทร์ 29 ก.ย. 2569 → รายงานของอังคาร 22 ก.ย.
 */
export function latestReportDate(now: Date = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const back = (d.getUTCDay() - 2 + 7) % 7; // ถอยไปอังคารล่าสุด (รวมวันนี้)
  let tue = d.getTime() - back * DAY;
  const release = tue + 3 * DAY + 20 * 3_600_000;
  if (now.getTime() < release) tue -= 7 * DAY;
  return new Date(tue).toISOString().slice(0, 10);
}

const WEIGHTS: Record<DisaggGroup, number> = { producer: 0.4, swap: 0.22, managed: 0.2, other: 0.1, nonrept: 0.08 };
const SPREAD: Record<DisaggGroup, number> = { producer: 0, swap: 0.05, managed: 0.08, other: 0.06, nonrept: 0 };
const TRADERS: Record<DisaggGroup, number> = { producer: 48, swap: 22, managed: 95, other: 70, nonrept: 0 };

function position(long: number, short: number, spread: number, tl: number, ts: number, tsp: number): CotPosition {
  return { long, short, spread, tradersLong: tl, tradersShort: ts, tradersSpread: tsp };
}

export function generateCot(spec: MarketSpec, endDate: string, weeks = COT_HISTORY_WEEKS): CotWeek[] {
  const rand = mulberry32(hashSeed(spec.id));
  const gauss = gaussianFactory(rand);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  const out: CotWeek[] = [];
  let price = spec.base * Math.exp(-0.15 + 0.3 * rand());
  let mom = 0;
  let ema = 0; // EMA ของผลตอบแทน = สัญญาณเทรนด์ที่ managed money ตาม
  let oiWalk = 0;
  let mmNoise = 0;
  let swapNoise = 0;
  let otherNoise = 0;
  let nonNoise = 0;
  let emaSlow = 0; // ตำแหน่งจริงสะสมช้า (สถานะ COT ขยับทีละน้อยต่อสัปดาห์ ไม่กระโดด)
  const phase = rand() * Math.PI * 2;
  const round = (x: number) => Math.round(x);
  for (let i = 0; i < weeks; i++) {
    const date = new Date(end - (weeks - 1 - i) * 7 * DAY).toISOString().slice(0, 10);
    // ── ราคา: momentum AR(1) + noise ──
    mom = 0.9 * mom + 0.44 * gauss();
    const r = spec.vol * (0.12 * mom + 0.85 * gauss()) + 0.0003;
    const o = price;
    const c = o * Math.exp(r);
    const h = Math.max(o, c) * (1 + Math.abs(gauss()) * spec.vol * 0.45);
    const l = Math.min(o, c) * (1 - Math.abs(gauss()) * spec.vol * 0.45);
    price = c;
    ema = 0.85 * ema + 0.15 * (r / spec.vol);
    emaSlow = 0.8 * emaSlow + 0.2 * ema;
    // ── Open interest: ฤดูกาล + random walk ช้า ──
    oiWalk = Math.max(-0.35, Math.min(0.45, oiWalk + 0.02 * gauss()));
    const oi = spec.oi * (1 + 0.08 * Math.sin((2 * Math.PI * i) / 52 + phase) + oiWalk);
    // ── net ของแต่ละกลุ่ม (สัดส่วนของขนาดสถานะ) ──
    mmNoise = 0.85 * mmNoise + 0.15 * gauss();
    swapNoise = 0.9 * swapNoise + 0.1 * gauss();
    otherNoise = 0.85 * otherNoise + 0.15 * gauss();
    nonNoise = 0.85 * nonNoise + 0.15 * gauss();
    const spreadTotal = oi * (SPREAD.swap + SPREAD.managed + SPREAD.other);
    const pos = (g: DisaggGroup) => WEIGHTS[g] * (oi - spreadTotal);
    const fMm = Math.tanh(2.2 * emaSlow + 0.6 * mmNoise) * 0.8;
    const fOther = Math.tanh(1.5 * emaSlow + 0.5 * otherNoise) * 0.6;
    const fNon = Math.tanh(0.8 * emaSlow + 0.8 * nonNoise) * 0.35;
    const fSwap = Math.max(-0.5, Math.min(0.5, -0.45 * fMm + 0.25 * swapNoise));
    const net: Record<DisaggGroup, number> = {
      managed: fMm * 2 * pos('managed') * 0.9,
      other: fOther * 2 * pos('other') * 0.9,
      nonrept: fNon * 2 * pos('nonrept') * 0.9,
      swap: fSwap * 2 * pos('swap') * 0.9,
      producer: 0,
    };
    net.producer = -(net.managed + net.other + net.nonrept + net.swap);
    // ── gross → long/short (ปัดเป็นจำนวนเต็ม แล้วปิดยอดด้วย producer ให้เอกลักษณ์ OI ตรงเป๊ะ) ──
    const groups: DisaggGroup[] = ['swap', 'managed', 'other', 'nonrept'];
    const d = {} as Record<DisaggGroup, CotPosition>;
    let sumLong = 0;
    let sumShort = 0;
    let sumSpread = 0;
    for (const g of groups) {
      const p = pos(g);
      const long = Math.max(0, round(p + net[g] / 2));
      const short = Math.max(0, round(p - net[g] / 2));
      const spread = round(SPREAD[g] * oi);
      const scale = (x: number) => Math.max(1, round(TRADERS[g] * (0.55 + 0.45 * (x / Math.max(1, p))) * (0.9 + 0.2 * rand())));
      d[g] = position(long, short, spread, g === 'nonrept' ? 0 : scale(long), g === 'nonrept' ? 0 : scale(short), spread > 0 ? scale(spread) : 0);
      sumLong += long;
      sumShort += short;
      sumSpread += spread;
    }
    const oiInt = round(oi);
    const pLong = Math.max(0, oiInt - sumSpread - sumLong - 0);
    const pShort = Math.max(0, oiInt - sumSpread - sumShort);
    const pp = pos('producer');
    const pScale = (x: number) => Math.max(1, round(TRADERS.producer * (0.55 + 0.45 * (x / Math.max(1, pp))) * (0.9 + 0.2 * rand())));
    d.producer = position(pLong, pShort, 0, pScale(pLong), pScale(pShort), 0);
    const openInterest = pLong + sumLong + sumSpread; // = pShort + sumShort + sumSpread (ปิดยอดแล้ว)

    const legacy: Record<LegacyGroup, CotPosition> = {
      commercials: position(
        d.producer.long + d.swap.long + d.swap.spread,
        d.producer.short + d.swap.short + d.swap.spread,
        0,
        d.producer.tradersLong + d.swap.tradersLong,
        d.producer.tradersShort + d.swap.tradersShort,
        0,
      ),
      largeSpecs: position(
        d.managed.long + d.other.long,
        d.managed.short + d.other.short,
        d.managed.spread + d.other.spread,
        d.managed.tradersLong + d.other.tradersLong,
        d.managed.tradersShort + d.other.tradersShort,
        d.managed.tradersSpread + d.other.tradersSpread,
      ),
      smallTraders: { ...d.nonrept },
    };
    out.push({ date, price: { o, h, l, c }, openInterest, legacy, disagg: d });
  }
  // ยึดระดับราคาล่าสุดให้ใกล้ระดับจริงของตลาด (±15%) — random walk 330 สัปดาห์ลอยห่างได้หลายเท่า
  const k = (spec.base * (0.85 + 0.3 * rand())) / out[out.length - 1].price.c;
  for (const w of out) w.price = { o: w.price.o * k, h: w.price.h * k, l: w.price.l * k, c: w.price.c * k };
  return out;
}

const cache = new Map<string, CotWeek[]>();

/** ประวัติรายงานของตลาด (cache ต่อ process ต่อวันที่รายงานล่าสุด) */
export function cotHistory(spec: MarketSpec, endDate: string): CotWeek[] {
  const key = `${spec.id}|${endDate}`;
  let h = cache.get(key);
  if (!h) {
    h = generateCot(spec, endDate);
    if (cache.size > 200) cache.clear();
    cache.set(key, h);
  }
  return h;
}
