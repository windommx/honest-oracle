/**
 * terminal.ts — Market Intelligence Terminal (หน้า Dashboard แบบ trading terminal)
 *
 * 3 payload หลัก:
 *  - getQuotes()   : ตลาดสด 22 ตัว (ราคา, เปลี่ยนแปลง, วอลุ่ม, sparkline, สัญญาณ) สำหรับ Watchlist + Category chips
 *  - getSeries()   : OHLCV + indicators (EMA/SMA/BB/Donchian/VWAP) + swing pivots + S/R 90 วัน สำหรับกราฟแท่งเทียน
 *  - getAnalyst()  : แผนเทรดจาก 5 Gates + ตัวชี้วัดหลัก + brief กฎเกณฑ์ภาษาไทย + สังเคราะห์ล่าสุด สำหรับแผง AI Analysis
 *
 * ข้อมูลราคา: ใช้ generator cache (seed เดียวกับ DB → ตัวเลขตรงกับทุกแท็บอื่น)
 */

import { loadMarketState } from './panel';
import { getBoard, getProbs } from './api';
import { evaluateGates } from './gates';
import { RULES } from './rules';
import { db } from '@/lib/db';
import { chatCompletion } from '@/lib/llm';
import { mean, std } from '../stats';
import type { MarketState } from './types';

// ─────────────────────── indicator helpers ───────────────────────

function ema(x: number[], n: number): number[] {
  const out = new Array<number>(x.length).fill(NaN);
  if (x.length === 0) return out;
  const k = 2 / (n + 1);
  out[0] = x[0];
  for (let i = 1; i < x.length; i++) out[i] = x[i] * k + out[i - 1] * (1 - k);
  return out;
}

function sma(x: number[], n: number): number[] {
  const out = new Array<number>(x.length).fill(NaN);
  let acc = 0;
  for (let i = 0; i < x.length; i++) {
    acc += x[i];
    if (i >= n) acc -= x[i - n];
    if (i >= n - 1) out[i] = acc / n;
  }
  return out;
}

function rollingStdOf(x: number[], n: number): number[] {
  const out = new Array<number>(x.length).fill(NaN);
  for (let i = n - 1; i < x.length; i++) out[i] = std(x.slice(i - n + 1, i + 1));
  return out;
}

function donchian(high: number[], low: number[], n: number): { up: number[]; lo: number[] } {
  const up = new Array<number>(high.length).fill(NaN);
  const lo = new Array<number>(high.length).fill(NaN);
  for (let i = n - 1; i < high.length; i++) {
    up[i] = Math.max(...high.slice(i - n + 1, i + 1));
    lo[i] = Math.min(...low.slice(i - n + 1, i + 1));
  }
  return { up, lo };
}

function vwapRolling(typ: number[], vol: number[], n: number): number[] {
  const out = new Array<number>(typ.length).fill(NaN);
  let pv = 0;
  let vv = 0;
  for (let i = 0; i < typ.length; i++) {
    pv += typ[i] * vol[i];
    vv += vol[i];
    if (i >= n) {
      pv -= typ[i - n] * vol[i - n];
      vv -= vol[i - n];
    }
    if (i >= n - 1 && vv > 0) out[i] = pv / vv;
  }
  return out;
}

function macdHist(closes: number[]): { macd: number[]; signal: number[]; hist: number[] } {
  const e12 = ema(closes, 12);
  const e26 = ema(closes, 26);
  const macd = closes.map((_, i) => e12[i] - e26[i]);
  const signal = ema(macd, 9);
  const hist = macd.map((m, i) => m - signal[i]);
  return { macd, signal, hist };
}

/** fractal swing pivots (lookback=2 ซ้าย/ขวา) */
function swingPivots(high: number[], low: number[], lookback = 2): Array<{ i: number; price: number; type: 'H' | 'L' }> {
  const out: Array<{ i: number; price: number; type: 'H' | 'L' }> = [];
  for (let i = lookback; i < high.length - lookback; i++) {
    const hw = high.slice(i - lookback, i + lookback + 1);
    const lw = low.slice(i - lookback, i + lookback + 1);
    if (high[i] >= Math.max(...hw)) out.push({ i, price: high[i], type: 'H' });
    if (low[i] <= Math.min(...lw)) out.push({ i, price: low[i], type: 'L' });
  }
  return out;
}

/** รวมระดับที่ห่างกัน < tol เป็นโซนเดียว (เรียงจากใกล้ราคาปัจจุบัน) */
function clusterLevels(levels: number[], price: number, tol = 0.006): number[] {
  const sorted = [...levels].sort((a, b) => a - b);
  const clusters: number[] = [];
  let acc: number[] = [];
  for (const v of sorted) {
    if (acc.length === 0 || Math.abs(v - acc[acc.length - 1]) / price <= tol) acc.push(v);
    else {
      clusters.push(mean(acc));
      acc = [v];
    }
  }
  if (acc.length) clusters.push(mean(acc));
  return clusters.map((c) => +c.toFixed(2));
}

function nearestLevels(pivots: Array<{ i: number; price: number; type: 'H' | 'L' }>, price: number, window = 90) {
  const recent = pivots.slice(-window);
  const highs = clusterLevels(recent.filter((p) => p.type === 'H').map((p) => p.price), price);
  const lows = clusterLevels(recent.filter((p) => p.type === 'L').map((p) => p.price), price);
  const resistances = highs.filter((h) => h > price * 1.001).sort((a, b) => a - b).slice(0, 3);
  const supports = lows.filter((l) => l < price * 0.999).sort((a, b) => b - a).slice(0, 3);
  return { supports, resistances };
}

// ─────────────────────── Quotes (watchlist) ───────────────────────

export interface QuoteRow {
  symbol: string;
  name: string;
  sector: string;
  theme: string;
  price: number;
  chg1d: number;
  chg5d: number;
  chg21d: number;
  rsi: number;
  signal: string;
  phase: string;
  phaseNum: number;
  probUp: number;
  decoupled: boolean;
  gates: { g1: boolean; g2: boolean; g3: boolean; g4: boolean; g5: boolean };
  entryLow: number;
  entryHigh: number;
  stopStruct: number;
  stopHard: number;
  maxSizePct: number;
  volume: number;
  adv20: number;
  volRatio: number;
  spark: number[];
  valueM: number; // มูลค่าซื้อขายวันล่าสุด (ล้านบาท ประมาณ)
}

export async function getQuotes() {
  const [board, state] = await Promise.all([getBoard(), loadMarketState()]);
  const N = state.dates.length;
  const bySym = new Map(state.stocks.map((s) => [s.symbol, s]));

  const quotes: QuoteRow[] = board.rows.map((r) => {
    const st = bySym.get(r.symbol);
    const closes = st ? st.rows.map((x) => x.close) : [];
    const vols = st?.ohlcv.volume ?? [];
    const lastV = vols[N - 1] ?? 0;
    const adv20 = vols.length ? mean(vols.slice(-20)) : 0;
    return {
      symbol: r.symbol,
      name: r.name,
      sector: r.sector,
      theme: r.theme,
      price: r.price,
      chg1d: r.chg1d,
      chg5d: r.chg5d,
      chg21d: r.chg21d,
      rsi: r.rsi,
      signal: r.signal,
      phase: r.phase,
      phaseNum: r.phaseNum,
      probUp: r.probUp,
      decoupled: r.decoupled,
      gates: r.gates,
      entryLow: r.entryLow,
      entryHigh: r.entryHigh,
      stopStruct: r.stopStruct,
      stopHard: r.stopHard,
      maxSizePct: r.maxSizePct,
      volume: +lastV.toFixed(3),
      adv20: +adv20.toFixed(3),
      volRatio: adv20 > 0 ? +(lastV / adv20).toFixed(2) : 1,
      spark: closes.slice(-30).map((c) => +c.toFixed(2)),
      valueM: +(lastV * r.price).toFixed(1), // ปริมาณเป็นล้านหุ้น × ราคา = ล้านบาท
    };
  });

  return {
    regime: board.regime,
    summary: board.summary,
    lastDate: state.dates[N - 1].toISOString().slice(0, 10),
    quotes,
  };
}

// ─────────────────────── Series (chart) ───────────────────────

export interface OhlcBar {
  date: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export async function getSeries(symbol: string, tf: '1D' | '1W' = '1D', bars = 180) {
  // OHLCV จาก panel ที่สร้างจาก DB (แหล่งเดียวกับ Board/Decision/Synthesis — ข้อมูลจำลองหรือข้อมูลจริงที่นำเข้า)
  const state = await loadMarketState();
  const st = state.stocks.find((s) => s.symbol === symbol);
  if (!st) return null;
  const { open, high, low, volume } = st.ohlcv;
  const close = st.rows.map((r) => r.close);
  const dates = state.dates;

  // daily bars เต็มชุด
  const daily: OhlcBar[] = dates.map((d, i) => ({
    date: d.toISOString().slice(0, 10),
    o: +open[i].toFixed(2),
    h: +high[i].toFixed(2),
    l: +low[i].toFixed(2),
    c: +close[i].toFixed(2),
    v: +volume[i].toFixed(3), // ล้านหุ้น
  }));

  // pivots/S-R + swing คิดจาก daily เสมอ (แม่กว่า)
  const pivots = swingPivots(high, low, 2);
  const price = close[close.length - 1];
  const sr = nearestLevels(pivots, price, 90);

  let barsOut: OhlcBar[];
  let ema20: number[], ema50: number[], sma20: number[], bbU: number[], bbL: number[], donU: number[], donL: number[], vwap: number[];

  if (tf === '1W') {
    // รวมเป็นรายสัปดาห์ (ISO week เริ่มจันทร์)
    const wk = new Map<string, OhlcBar[]>();
    for (const b of daily) {
      const d = new Date(b.date + 'T00:00:00Z');
      const day = d.getUTCDay();
      const monday = new Date(d);
      monday.setUTCDate(d.getUTCDate() - ((day + 6) % 7));
      const key = monday.toISOString().slice(0, 10);
      const arr = wk.get(key) ?? [];
      arr.push(b);
      wk.set(key, arr);
    }
    const wbars: OhlcBar[] = [...wk.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([, arr]) => ({
      date: arr[arr.length - 1].date,
      o: arr[0].o,
      h: +Math.max(...arr.map((x) => x.h)).toFixed(2),
      l: +Math.min(...arr.map((x) => x.l)).toFixed(2),
      c: arr[arr.length - 1].c,
      v: arr.reduce((s, x) => s + x.v, 0),
    }));
    const wc = wbars.map((b) => b.c);
    const wh = wbars.map((b) => b.h);
    const wl = wbars.map((b) => b.l);
    const wv = wbars.map((b) => b.v);
    const wtp = wbars.map((b) => (b.h + b.l + b.c) / 3);
    const wbbM = sma(wc, 20);
    const wsd = rollingStdOf(wc, 20);
    const wd = donchian(wh, wl, 20);
    ema20 = ema(wc, 20); ema50 = ema(wc, 50); sma20 = wbbM;
    bbU = wbbM.map((m, i) => (Number.isFinite(m) ? m + 2 * wsd[i] : NaN));
    bbL = wbbM.map((m, i) => (Number.isFinite(m) ? m - 2 * wsd[i] : NaN));
    donU = wd.up; donL = wd.lo; vwap = vwapRolling(wtp, wv, 20);
    barsOut = wbars;
  } else {
    const c = daily.map((b) => b.c);
    const h = daily.map((b) => b.h);
    const l = daily.map((b) => b.l);
    const v = daily.map((b) => b.v);
    const tp = daily.map((b) => (b.h + b.l + b.c) / 3);
    const bbM = sma(c, 20);
    const sd20 = rollingStdOf(c, 20);
    const dn = donchian(h, l, 20);
    ema20 = ema(c, 20); ema50 = ema(c, 50); sma20 = bbM;
    bbU = bbM.map((m, i) => (Number.isFinite(m) ? m + 2 * sd20[i] : NaN));
    bbL = bbM.map((m, i) => (Number.isFinite(m) ? m - 2 * sd20[i] : NaN));
    donU = dn.up; donL = dn.lo; vwap = vwapRolling(tp, v, 20);
    barsOut = daily;
  }

  const total = barsOut.length;
  const from = Math.max(0, total - bars);
  const slice = barsOut.slice(from);

  const rnd = (a: number[]) => a.slice(from).map((v) => (Number.isFinite(v) ? +v.toFixed(2) : null));

  // swing pivots ในหน้าต่างที่แสดง (แปลง index ให้ชี้เข้า slice)
  const swings = pivots
    .filter((p) => p.i >= from && p.i < total)
    .map((p) => ({ i: p.i - from, price: +p.price.toFixed(2), type: p.type }));

  const adv20All = mean(daily.slice(-20).map((b) => b.v));

  return {
    symbol,
    name: st.name,
    sector: st.sector,
    theme: st.theme,
    tf,
    firstDate: slice[0]?.date ?? '',
    lastDate: slice[slice.length - 1]?.date ?? '',
    bars: slice,
    ind: {
      ema20: rnd(ema20),
      ema50: rnd(ema50),
      sma20: rnd(sma20),
      bbU: rnd(bbU),
      bbM: rnd(sma20),
      bbL: rnd(bbL),
      donU: rnd(donU),
      donL: rnd(donL),
      vwap: rnd(vwap),
    },
    swings,
    sr,
    adv20: +adv20All.toFixed(3),
    lastQuote: {
      price: +price.toFixed(2),
      chg1d: +((close[close.length - 1] / close[close.length - 2] - 1) * 100).toFixed(2),
      volume: +volume[volume.length - 1].toFixed(3),
      volRatio: adv20All > 0 ? +(volume[volume.length - 1] / adv20All).toFixed(2) : 1,
    },
  };
}

// ─────────────────────── Analyst (แผง AI ขวา) ───────────────────────

export interface AnalystBrief {
  symbol: string;
  name: string;
  sector: string;
  theme: string;
  date: string;
  trend: {
    dir: 'UP' | 'DOWN' | 'SIDE';
    label: string;
    close: number;
    ema20: number;
    ema50: number;
    distHighPct: number;
    ret21Pct: number;
  };
  signal: string;
  phase: string;
  gates: { g1: boolean; g2: boolean; g3: boolean; g4: boolean; g5: boolean };
  plan: {
    entryLow: number;
    entryHigh: number;
    trigger: number;
    stopStruct: number;
    stopHard: number;
    sizePct: number;
    cvar: number;
    probUp: number;
    failingGates: string[];
    killSwitch: string;
    reasons: Record<string, string>;
  };
  indicators: {
    rsi: number;
    macdH: number;
    macdHPrev: number;
    volRatio: number;
    volume: number;
    adv20: number;
    flow5: number;
    thetaZ: number;
    decoupled: boolean;
    vol21: number;
    pe: number;
    pb: number;
  };
  sr: { supports: number[]; resistances: number[] };
  synth: { headline: string; summary: string; score: number; verdict: string; runDate: string } | null;
  brief: string[];
}

export async function getAnalyst(symbol: string): Promise<AnalystBrief | null> {
  const state: MarketState = await loadMarketState();
  const N = state.dates.length;
  const si = state.stocks.findIndex((s) => s.symbol === symbol);
  if (si < 0) return null;
  const s = state.stocks[si];
  const row = s.rows[N - 1];
  const probs = await getProbs();
  const ev = evaluateGates(state, symbol, N - 1, { riskBudgetPct: RULES.risk.budgetPct, probUp: probs[symbol] });

  // indicators จาก OHLCV ของ panel (DB)
  const closes = s.rows.map((r) => r.close);
  const { hist } = macdHist(closes);
  const e20 = ema(closes, 20);
  const e50 = ema(closes, 50);
  const vols = s.ohlcv.volume;
  const adv20 = mean(vols.slice(-20));
  const pivots = swingPivots(s.ohlcv.high, s.ohlcv.low, 2);
  const sr = nearestLevels(pivots, closes[N - 1], 90);

  const close = closes[N - 1];
  const ema20v = e20[N - 1];
  const ema50v = e50[N - 1];
  const spread = (ema20v - ema50v) / ema50v;
  const dir: 'UP' | 'DOWN' | 'SIDE' = spread > 0.008 ? 'UP' : spread < -0.008 ? 'DOWN' : 'SIDE';
  const trendLabel =
    dir === 'UP'
      ? row.close > ema20v
        ? 'ขาขึ้น — ราคายืนเหนือ EMA20'
        : 'ขาขึ้น — ราคาย่อใต้ EMA20'
      : dir === 'DOWN'
        ? 'ขาลง — EMA20 ต่ำกว่า EMA50'
        : ' sideways — อ่อนแรง/ไม่มีเทรนด์ชัด';

  const plan = ev.plan;

  // brief กฎเกณฑ์ (ไม่ใช้ LLM — ตอบสนองทันที)
  const brief: string[] = [];
  brief.push(
    dir === 'UP'
      ? `เทรนด์รายวันเป็นขาขึ้น (EMA20 ${(spread * 100).toFixed(1)}% เหนือ EMA50) ราคา ${close.toFixed(2)} ห่างจากจุดสูง 252 วัน ${(row.distHigh * 100).toFixed(1)}%`
      : dir === 'DOWN'
        ? `เทรนด์รายวันเป็นขาลง (EMA20 ต่ำกว่า EMA50 ${Math.abs(spread * 100).toFixed(1)}%) — แผนเทรดเน้นรอการกลับตัวก่อน`
        : `เทรนด์ยังไม่ชัด (EMA20/EMA50 บีบตัว) — ควรรอการยืนยันก่อนเข้าไม้`,
  );
  brief.push(
    ev.signal === 'NO_TRADE'
      ? `ระบบ 5 Gates ยังไม่ให้เข้า: ${plan.failingGates.join(', ') || 'เงื่อนไขยังไม่ครบ'} — ${ev.phaseLabel}`
      : `ระบบให้สัญญาณ ${ev.signal === 'ENTRY_PULLBACK' ? 'เข้าแบบ Pullback' : 'เข้าแบบ Momentum'} โซน ${plan.entryLow.toFixed(2)}–${plan.entryHigh.toFixed(2)} stop ${plan.stopHard.toFixed(2)} ขนาดไม้ ${plan.sizePct.toFixed(1)}%`,
  );
  brief.push(
    `โมเมนตัม: RSI ${row.rsi14.toFixed(1)} · MACD hist ${hist[N - 1] >= 0 ? '+' : ''}${hist[N - 1].toFixed(2)} (${hist[N - 1] >= hist[N - 2] ? 'ดีขึ้น' : 'อ่อนแรง'}) · volRatio ${(vols[N - 1] / adv20).toFixed(2)}×`,
  );
  brief.push(
    row.decoupled
      ? `Dependence: DECOUPLE (Θ z=${row.thetaZ.toFixed(2)}) — เคลื่อนอิสระจากตลาด เฝ้าระวัง re-couple`
      : `Dependence: coupled (Θ z=${row.thetaZ.toFixed(2)}, LTD ${row.ltd.toFixed(2)}) — ไปทางเดียวกับตลาด`,
  );
  const flowTxt = row.flow5 > 20 ? 'แรงซื้อไหลเข้า' : row.flow5 < -20 ? 'แรงขายไหลออก' : 'flow เป็นกลาง';
  brief.push(`Fund flow 5 วัน ${row.flow5 >= 0 ? '+' : ''}${row.flow5.toFixed(0)}M (${flowTxt}) · P/E ${row.pe.toFixed(1)} · P/B ${row.pb.toFixed(2)}`);

  // สังเคราะห์ล่าสุด (ถ้าเคยรัน หลอมรวมด้วย AI)
  let synth: AnalystBrief['synth'] = null;
  try {
    const last = await db.synthesisReport.findFirst({
      where: { symbol },
      orderBy: { runDate: 'desc' },
    });
    if (last) {
      const nar = last.narrative as { headline?: string; summary?: string } | null;
      synth = {
        headline: nar?.headline ?? '',
        summary: nar?.summary ?? '',
        score: last.score,
        verdict: last.verdict,
        runDate: last.runDate,
      };
    }
  } catch {
    synth = null;
  }

  return {
    symbol,
    name: s.name,
    sector: s.sector,
    theme: s.theme,
    date: state.dates[N - 1].toISOString().slice(0, 10),
    trend: {
      dir,
      label: trendLabel.trim(),
      close: +close.toFixed(2),
      ema20: +ema20v.toFixed(2),
      ema50: +ema50v.toFixed(2),
      distHighPct: +(row.distHigh * 100).toFixed(1),
      ret21Pct: +(row.ret21 * 100).toFixed(1),
    },
    signal: ev.signal,
    phase: ev.phaseLabel,
    gates: ev.gates,
    plan: {
      entryLow: plan.entryLow,
      entryHigh: plan.entryHigh,
      trigger: plan.trigger,
      stopStruct: plan.stopStruct,
      stopHard: plan.stopHard,
      sizePct: plan.sizePct,
      cvar: plan.cvar,
      probUp: plan.probUp,
      failingGates: plan.failingGates,
      killSwitch: plan.killSwitch,
      reasons: plan.reasons,
    },
    indicators: {
      rsi: +row.rsi14.toFixed(1),
      macdH: +hist[N - 1].toFixed(4),
      macdHPrev: +hist[N - 2].toFixed(4),
      volRatio: +(vols[N - 1] / adv20).toFixed(2),
      volume: Math.round(vols[N - 1]),
      adv20: Math.round(adv20),
      flow5: +row.flow5.toFixed(1),
      thetaZ: +row.thetaZ.toFixed(2),
      decoupled: row.decoupled,
      vol21: +(row.vol21 * 100).toFixed(1),
      pe: row.pe,
      pb: row.pb,
    },
    sr,
    synth,
    brief,
  };
}

/** AI Analyst chat — ตอบคำถามภาษาไทยโดยล็อกกับหลักฐานของหุ้นที่เลือก */
export async function askAnalyst(symbol: string, question: string): Promise<string> {
  const a = await getAnalyst(symbol);
  if (!a) throw new Error(`unknown symbol ${symbol}`);
  const evidence = {
    ตลาด: { symbol: a.symbol, name: a.name, sector: a.sector, theme: a.theme, date: a.date },
    เทรนด์: a.trend,
    สัญญาณและแผน: { signal: a.signal, phase: a.phase, plan: a.plan },
    ตัวชี้วัด: a.indicators,
    แนวรับแนวต้าน: a.sr,
    หลอมรวมล่าสุด: a.synth,
    brief: a.brief,
  };

  // ผ่านชั้น LLM กลาง (src/lib/llm.ts) — ไม่มีผู้ให้บริการ → LlmUnavailableError ให้ route ตอบ 503
  const { text } = await chatCompletion([
    {
      role: 'system',
      content:
        'You are the on-chart AI Analyst of a Thai SET quantitative platform (Omniscient Quant Engine, 7 layers + 5 gates). ' +
        'Answer the user question about the selected stock STRICTLY grounded in the evidence JSON provided. ' +
        'Rules: (1) ตอบภาษาไทยกระชับ ไม่เกิน 130 คำ; (2) อ้างตัวเลขจากหลักฐานเท่านั้น ห้ามเดาตัวเลขใหม่; ' +
        '(3) ถ้าสัญญาณคือ NO_TRADE ต้องแนะนำให้เฝ้าดู/รอเงื่อนไข ไม่หลอกให้เข้าไม้; ' +
        '(4) จำเป็นต้องเตือนความเสี่ยงสั้น ๆ ท้ายคำตอบ; (5) ไม่ใช้ markdown เครื่องหมายพิเศษ — ตอบเป็นข้อความล้วน',
    },
    { role: 'user', content: `หลักฐาน: ${JSON.stringify(evidence).slice(0, 9000)}\n\nคำถาม: ${question}` },
  ]);
  return (text || 'AI ไม่ตอบกลับ กรุณาลองใหม่').slice(0, 1200);
}
