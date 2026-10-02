// ============================================================
// เงินไหลตามประเภทนักลงทุนจำลอง (deterministic ต่อสัญลักษณ์) — ผูกกับราคาจริงของชุดข้อมูลแพลตฟอร์ม
// ใช้แทนข้อมูลของตลาดหลักทรัพย์ฯ เมื่อยังไม่มีแหล่งข้อมูลจริง (ราคา/ปริมาณมาจาก panel เดียวกับ Terminal/Decision)
//
// เอกลักษณ์ที่รักษาทุกวัน (คำนวณเป็นจำนวนเต็มหน่วย 0.01 ล้านบาท แล้วปิดยอดด้วยกลุ่มสุดท้าย — ตรงเป๊ะ ไม่มีเศษทศนิยมสะสม):
//  - ตลาด: Σ ซื้อ = Σ ขาย = มูลค่าซื้อขายรวม · Σ สุทธิ = 0 (รายย่อยปิดยอด)
//  - หุ้น:  NVDR ซื้อ + ผู้ลงทุนอื่นซื้อ = NVDR ขาย + ผู้ลงทุนอื่นขาย = มูลค่าซื้อขายของหุ้น · short sale ≤ มูลค่าขาย
// พฤติกรรม (ข้อเท็จจริงเชิงสถิติของตลาดไทย):
//  - ต่างชาติเป็นผู้กำหนดราคา: สุทธิสัมพันธ์บวกกับผลตอบแทนวันเดียวกันและเทรนด์
//  - รายย่อยสวนทาง (ซื้อตอนลง ขายตอนขึ้น) · สถาบันสวนเล็กน้อย + ซื้อหนักช่วงกองทุนลดหย่อนภาษีปลายปี (ธ.ค.)
//  - NVDR ตามเทรนด์ของหุ้น · short sale เพิ่มในวันที่ราคาลงและหลังช่วงขึ้นแรง
// ============================================================

import { gaussianFactory, mulberry32 } from '@/lib/quant/rng';
import type { BuySell, FlowBar, FlowWeek, MarketGroup } from './types';

export interface PriceBars {
  dates: string[];
  o: number[];
  h: number[];
  l: number[];
  c: number[];
}

export interface StockBars extends PriceBars {
  /** ปริมาณซื้อขาย (ล้านหุ้น) — มูลค่า = ปริมาณ × ราคาปิด (ล้านบาท) */
  volumeM: number[];
}

/** ระดับฐานของมูลค่าซื้อขายต่อวันทั้งตลาด SET (ล้านบาท) ก่อนผลของความผันผวน — เฉลี่ยทั้งช่วงราว 44,000 ล้านบาท/วัน */
export const MARKET_BASE_VALUE_MB = 36_000;
/** สัดส่วนมูลค่าซื้อขายเฉลี่ยต่อประเภทนักลงทุน */
export const MARKET_SHARE: Record<MarketGroup, number> = { foreign: 0.46, institution: 0.1, prop: 0.1, retail: 0.34 };

function hashSeed(s: string): number {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const toMb = (cents: number) => cents / 100;

/** log return รายวัน + ส่วนเบี่ยงเบนมาตรฐาน (ใช้ทำ z-score) */
function returns(c: number[]): { r: number[]; sigma: number } {
  const r = c.map((v, i) => (i > 0 && c[i - 1] > 0 && v > 0 ? Math.log(v / c[i - 1]) : 0));
  const x = r.slice(1);
  const m = x.reduce((a, b) => a + b, 0) / Math.max(1, x.length);
  const sd = Math.sqrt(x.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, x.length - 1));
  return { r, sigma: sd > 1e-9 ? sd : 0.01 };
}

/** แยกยอดรวม (gross) + สุทธิ เป็นซื้อ/ขาย หน่วยสตางค์ล้าน (จำนวนเต็ม) — |สุทธิ| ไม่เกิน 1.8 × gross เพื่อให้ซื้อ/ขายไม่ติดลบ */
function split(grossCents: number, netCents: number): { buy: number; sell: number } {
  const cap = Math.floor(grossCents * 1.8);
  const net = clamp(netCents, -cap, cap);
  const buy = grossCents + Math.ceil(net / 2);
  return { buy, sell: buy - net };
}

const bs = (buy: number, sell: number): BuySell => ({ buy: toMb(buy), sell: toMb(sell) });

/** แท่งรายวันของดัชนีที่มีแต่ราคาปิด: เปิด = ปิดวันก่อน, สูง/ต่ำ = ขอบของเปิด-ปิด */
export function barsFromClose(dates: string[], close: number[]): PriceBars {
  const o = close.map((c, i) => (i > 0 ? close[i - 1] : c));
  return { dates, o, c: close, h: close.map((c, i) => Math.max(c, o[i])), l: close.map((c, i) => Math.min(c, o[i])) };
}

/** ยอดซื้อขายตามประเภทนักลงทุนของทั้งตลาด SET (รายวัน) */
export function generateMarketFlows(bars: PriceBars, seedKey = 'SET'): FlowBar[] {
  const rand = mulberry32(hashSeed(`flows:${seedKey}`));
  const gauss = gaussianFactory(rand);
  const { r, sigma } = returns(bars.c);
  const drift: Record<MarketGroup, number> = { foreign: 0, institution: 0, prop: 0, retail: 0 };
  let level = 0;
  let trend = 0;
  let fNoise = 0;
  let iNoise = 0;
  let pNoise = 0;
  const out: FlowBar[] = [];
  for (let t = 0; t < bars.dates.length; t++) {
    const date = bars.dates[t];
    const z = clamp(r[t] / sigma, -3, 3);
    trend = 0.9 * trend + 0.1 * z;
    const tr = Math.tanh(2 * trend);
    // มูลค่าซื้อขายรวม: ระดับเดินช้า + คึกคักขึ้นในวันที่ผันผวน
    level = 0.92 * level + 0.07 * gauss();
    const valueCents = Math.round(MARKET_BASE_VALUE_MB * Math.exp(level) * (1 + 0.25 * Math.min(3, Math.abs(z))) * 100);
    // สัดส่วนต่อกลุ่มเลื่อนช้า ๆ (รวม = 1)
    for (const g of Object.keys(drift) as MarketGroup[]) drift[g] = 0.97 * drift[g] + 0.03 * gauss();
    const raw = (Object.keys(MARKET_SHARE) as MarketGroup[]).map((g) => MARKET_SHARE[g] * Math.exp(0.6 * drift[g]));
    const total = raw.reduce((a, b) => a + b, 0);
    const share = { foreign: raw[0] / total, institution: raw[1] / total, prop: raw[2] / total };
    fNoise = 0.5 * fNoise + 0.87 * gauss();
    iNoise = 0.7 * iNoise + 0.71 * gauss();
    pNoise = 0.3 * pNoise + 0.95 * gauss();
    const month = Number(date.slice(5, 7));
    const day = Number(date.slice(8, 10));
    const taxFundSeason = month === 12 && day >= 10 ? 1 : 0; // กองทุนลดหย่อนภาษี (SSF/ThaiESG) ซื้อหนักก่อนสิ้นปี
    const netFrac = {
      foreign: 0.022 * z + 0.012 * fNoise + 0.008 * tr,
      institution: -0.008 * z - 0.004 * tr + 0.007 * iNoise + 0.012 * taxFundSeason,
      prop: 0.004 * z + 0.004 * pNoise,
    };
    const f = split(Math.round(share.foreign * valueCents), Math.round(netFrac.foreign * valueCents));
    const i = split(Math.round(share.institution * valueCents), Math.round(netFrac.institution * valueCents));
    const p = split(Math.round(share.prop * valueCents), Math.round(netFrac.prop * valueCents));
    // รายย่อยปิดยอด → Σซื้อ = Σขาย = มูลค่ารวม และ Σสุทธิ = 0 ตรงเป๊ะ
    // (ไม่ติดลบ: ส่วนแบ่งรายย่อย ≥ ~25% ของมูลค่า ขณะที่ |Σสุทธิของกลุ่มอื่น| / 2 ≤ ~8% — ทดสอบใน flows.test.ts)
    const retailBuy = valueCents - f.buy - i.buy - p.buy;
    const retailSell = valueCents - f.sell - i.sell - p.sell;
    out.push({
      date,
      o: bars.o[t],
      h: bars.h[t],
      l: bars.l[t],
      c: bars.c[t],
      value: toMb(valueCents),
      groups: {
        foreign: bs(f.buy, f.sell),
        institution: bs(i.buy, i.sell),
        prop: bs(p.buy, p.sell),
        retail: bs(retailBuy, retailSell),
      },
      short: null,
    });
  }
  return out;
}

/** NVDR เทียบผู้ลงทุนอื่น + short sale ของหุ้นหนึ่งตัว (รายวัน) — มูลค่าซื้อขายจากปริมาณ × ราคาปิดของ panel */
export function generateStockFlows(bars: StockBars, symbol: string): FlowBar[] {
  const rand = mulberry32(hashSeed(`flows:${symbol}`));
  const gauss = gaussianFactory(rand);
  const { r, sigma } = returns(bars.c);
  const nvdrShare0 = 0.08 + 0.14 * rand(); // NVDR ราว 8–22% ของมูลค่าซื้อขาย
  const shortShare0 = 0.02 + 0.05 * rand(); // short sale ราว 2–7% ของมูลค่า
  let trend = 0;
  let noise = 0;
  let shareDrift = 0;
  let shortNoise = 0;
  const out: FlowBar[] = [];
  for (let t = 0; t < bars.dates.length; t++) {
    const z = clamp(r[t] / sigma, -3, 3);
    trend = 0.9 * trend + 0.1 * z;
    const tr = Math.tanh(2 * trend);
    noise = 0.6 * noise + 0.8 * gauss();
    shareDrift = 0.98 * shareDrift + 0.2 * gauss();
    shortNoise = 0.7 * shortNoise + 0.7 * gauss();
    const valueCents = Math.max(0, Math.round((bars.volumeM[t] ?? 0) * bars.c[t] * 100));
    const nvdrShare = clamp(nvdrShare0 * Math.exp(0.15 * shareDrift), 0.03, 0.4);
    const netFrac = 0.1 * Math.tanh(0.8 * z + 0.45 * noise + 0.7 * tr);
    const n = split(Math.round(nvdrShare * valueCents), Math.round(netFrac * valueCents));
    const shortFrac = clamp(shortShare0 * Math.exp(0.3 * shortNoise + 0.35 * Math.max(0, -z) + 0.25 * Math.max(0, tr)), 0, 0.3);
    out.push({
      date: bars.dates[t],
      o: bars.o[t],
      h: bars.h[t],
      l: bars.l[t],
      c: bars.c[t],
      value: toMb(valueCents),
      groups: { nvdr: bs(n.buy, n.sell), others: bs(valueCents - n.buy, valueCents - n.sell) },
      short: toMb(Math.min(valueCents, Math.round(shortFrac * valueCents))),
    });
  }
  return out;
}

const DAY = 86_400_000;
const dow = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();
const cents = (x: number) => Math.round(x * 100);

/**
 * รวมรายวันเป็นรายสัปดาห์ (เปิด = วันแรก, ปิด = วันสุดท้าย, สูง/ต่ำ = สุดขั้วของสัปดาห์, มูลค่า/ซื้อ/ขาย/short = ผลรวม)
 * ขึ้นสัปดาห์ใหม่เมื่อวันในสัปดาห์ถอยหลัง (ศุกร์ → จันทร์) หรือห่างกัน ≥ 7 วัน — ใช้ได้แม้วันหยุดทำให้สัปดาห์สั้น
 * ผลรวมทำในหน่วยจำนวนเต็ม 0.01 ล้านบาท → เอกลักษณ์ Σซื้อ = Σขาย = มูลค่า ยังตรงเป๊ะหลังรวม
 */
export function aggregateWeeks(days: FlowBar[]): FlowWeek[] {
  const weeks: FlowWeek[] = [];
  let acc: { first: FlowBar; last: FlowBar; h: number; l: number; value: number; short: number | null; n: number; g: Map<string, { buy: number; sell: number }> } | null = null;
  const flush = () => {
    if (!acc) return;
    const groups: FlowWeek['groups'] = {};
    for (const [k, v] of acc.g) groups[k as keyof FlowWeek['groups']] = { buy: toMb(v.buy), sell: toMb(v.sell) };
    weeks.push({
      date: acc.last.date,
      start: acc.first.date,
      days: acc.n,
      o: acc.first.o,
      h: acc.h,
      l: acc.l,
      c: acc.last.c,
      value: toMb(acc.value),
      groups,
      short: acc.short === null ? null : toMb(acc.short),
    });
    acc = null;
  };
  for (const d of days) {
    if (acc && (dow(d.date) <= dow(acc.last.date) || Date.parse(d.date) - Date.parse(acc.last.date) >= 7 * DAY)) flush();
    if (!acc) acc = { first: d, last: d, h: d.h, l: d.l, value: 0, short: d.short === null ? null : 0, n: 0, g: new Map() };
    acc.last = d;
    acc.h = Math.max(acc.h, d.h);
    acc.l = Math.min(acc.l, d.l);
    acc.value += cents(d.value);
    if (acc.short !== null && d.short !== null) acc.short += cents(d.short);
    acc.n++;
    for (const [k, v] of Object.entries(d.groups)) {
      if (!v) continue;
      const cur = acc.g.get(k) ?? { buy: 0, sell: 0 };
      cur.buy += cents(v.buy);
      cur.sell += cents(v.sell);
      acc.g.set(k, cur);
    }
  }
  flush();
  return weeks;
}
