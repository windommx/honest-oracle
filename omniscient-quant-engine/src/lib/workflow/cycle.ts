// ============================================================
// รอบการทำงานประจำวัน (pure) — แปลงสัญญาณเป็นรายการ journal · อัปเดตสถานะไปข้างหน้าเท่านั้น · ตัดสินว่าไม้ไหนนับเป็นหลักฐาน forward
// · สถิติ + เทียบความคาดหวัง · ขั้นตอน/สัญญาณเตือนของหน้า "กระบวนการทำงาน"
// หลักฐาน forward นับเฉพาะไม้ที่: ใช้ข้อมูลจริง · บันทึกหลังล็อกกติกาด้วย hash เดียวกับที่ล็อก · บันทึกก่อนตลาดเปิดรอบถัดไป
// ============================================================

import { bootMean } from '@/lib/atlas/stats';
import type { AtlasCI } from '@/lib/atlas/types';
import { nextSessionOpen, nextTradingDay } from '@/lib/data/calendar';
import { thDate } from '@/lib/flows/format';
import { mulberry32 } from '@/lib/quant/rng';
import { mean, std } from '@/lib/quant/stats';
import { EXEC, floorToTick, scaledStop, type ExitKind, type PaperResult, type PlanInput } from './execution';
import type { ForwardReason, LedgerRow, PaperStats, WorkflowAlert, WorkflowResponse, WorkflowStep } from './types';

/** ป้ายหน้าบันทึกของรายการที่รอบประจำวันสร้าง (ใช้ค้นใน journal) */
export const CYCLE_TAG = '[รอบอัตโนมัติ]';
/** ไม้ forward ที่ปิดแล้วอย่างน้อยเท่านี้ถึงจะเทียบกับความคาดหวัง */
export const MIN_FORWARD = 10;
const SEED = 20261001;

export interface CycleMeta {
  v: 1;
  session: string;
  kind: 'pullback' | 'momentum';
  limit: number | null;
  rulesHash: string;
  dataKind: string;
}

/** รายการ journal เท่าที่รอบประจำวันใช้ */
export interface JournalLike {
  id: string;
  createdAt: Date;
  symbol: string;
  signal: string;
  gates: unknown;
  price: number;
  stopHard: number | null;
  sizePct: number | null;
  probUp: number | null;
  status: string;
  pnlPct: number | null;
  notes: string | null;
}

/** แถวของ Decision Board เท่าที่ต้องใช้บันทึก */
export interface BoardRowLike {
  symbol: string;
  signal: string;
  gates: { g1: boolean; g2: boolean; g3: boolean; g4: boolean; g5: boolean };
  price: number;
  entryLow: number;
  entryHigh: number;
  stopStruct: number;
  stopHard: number;
  maxSizePct: number;
  cvar: number;
  probUp: number;
}

const round = (v: number, d = 2) => {
  const r = Math.round(v * 10 ** d) / 10 ** d;
  return r === 0 ? 0 : r; // ไม่ให้ −0 หลุดไปเป็นป้าย "−0.00"
};
const signed = (v: number, d = 2) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toFixed(d)}`;
const px = (v: number | null) => (v === null ? '—' : v >= 100 ? v.toFixed(1) : v.toFixed(2));
const roundCI = (c: AtlasCI): AtlasCI => ({ mean: round(c.mean, 3), lo: round(c.lo, 3), hi: round(c.hi, 3) });

export const EXIT_LABEL: Record<ExitKind, string> = { target: 'ถึงเป้า', stop: 'โดน stop', time: 'หมดเวลา' };

/** meta ของรอบประจำวันใน gates JSON — null = รายการที่ผู้ใช้บันทึกเอง */
export function cycleMetaOf(gates: unknown): CycleMeta | null {
  const m = (gates as { cycle?: unknown } | null)?.cycle as Partial<CycleMeta> | undefined;
  if (!m || m.v !== 1 || typeof m.session !== 'string' || (m.kind !== 'pullback' && m.kind !== 'momentum')) return null;
  return {
    v: 1,
    session: m.session,
    kind: m.kind,
    limit: typeof m.limit === 'number' ? m.limit : null,
    rulesHash: typeof m.rulesHash === 'string' ? m.rulesHash : '',
    dataKind: typeof m.dataKind === 'string' ? m.dataKind : 'unknown',
  };
}

/** วันทำการสุดท้ายที่คำสั่งยังมีผล (นับตามปฏิทิน SET) */
export function orderValidUntil(session: string, days = EXEC.orderDays): string {
  let d = session;
  for (let i = 0; i < days; i++) d = nextTradingDay(d);
  return d;
}

/** แผนที่ส่งเข้าโบรกเกอร์กระดาษ — stop ปัดลงตาม tick ของ SET (ราคาตั้งซื้อปัดไว้แล้วตอนบันทึก) */
export function planOf(e: Pick<JournalLike, 'price' | 'stopHard'>, meta: CycleMeta): PlanInput {
  const ref = meta.limit ?? e.price;
  return { kind: meta.kind, close: e.price, limit: meta.limit, stop: floorToTick(scaledStop(ref, e.stopHard ?? 0, EXEC.stopMult)) };
}

function orderText(meta: CycleMeta, stop: number): string {
  const buy = meta.limit === null ? 'ซื้อที่ราคาเปิดวันถัดไป' : `ตั้งซื้อ ≤ ${px(meta.limit)}`;
  return `${CYCLE_TAG} ${meta.kind} · ${buy} (อายุคำสั่ง ${EXEC.orderDays} วันทำการ) · stop ${px(stop)} · เป้า +${EXEC.targetR}R · สัญญาณ ${thDate(meta.session)}`;
}

/** บันทึกอ่านง่ายของไม้กระดาษตามสถานะล่าสุด */
/** บันทึกอ่านง่ายของไม้กระดาษตามสถานะล่าสุด (stop = stop ที่ส่งจริงจาก planOf) */
export function paperNote(meta: CycleMeta, stop: number, res: PaperResult): string {
  const head = orderText(meta, stop);
  switch (res.state) {
    case 'order':
      return `${head} · รอราคา`;
    case 'open':
      return `${head} · ได้ของ ${px(res.fill!.price)} (${thDate(res.fill!.date)}) · เป้า ${px(res.target)}`;
    case 'closed':
      return `${head} · ได้ของ ${px(res.fill!.price)} (${thDate(res.fill!.date)}) · ออก ${px(res.exit!.price)} (${EXIT_LABEL[res.exit!.kind]} ${thDate(res.exit!.date)}) · สุทธิ ${signed(res.rNet!)}R (${signed(res.retNetPct!)}% หลังค่าธรรมเนียม ${EXEC.costPct}%)`;
    case 'expired':
      return `${head} · ไม่ได้ราคาใน ${EXEC.orderDays} วันทำการ → ยกเลิกคำสั่ง`;
    case 'gap':
      return `${head} · เปิดต่ำกว่า stop${res.eventDate ? ` (${thDate(res.eventDate)})` : ''} → ยกเลิกคำสั่ง`;
    case 'invalid':
      return `${head} · แผนใช้ไม่ได้ (stop/ราคาตั้งซื้อไม่สมเหตุผล หรือไม่พบราคาในข้อมูลปัจจุบัน) → ไม่ส่งคำสั่ง`;
  }
}

/** รายการ journal ของสัญญาณหนึ่งตัว — status PLANNED · runDate = 17:00 น. ของวันสัญญาณ (หลังตลาดปิด) */
export function decisionRecord(row: BoardRowLike, session: string, ctx: { rulesHash: string; dataKind: string }) {
  const kind: CycleMeta['kind'] = row.signal === 'ENTRY_MOMENTUM' ? 'momentum' : 'pullback';
  const meta: CycleMeta = { v: 1, session, kind, limit: kind === 'pullback' ? floorToTick(row.entryHigh) : null, rulesHash: ctx.rulesHash, dataKind: ctx.dataKind };
  const pending: PaperResult = { state: 'order', fill: null, exit: null, target: null, r: null, retPct: null, rNet: null, retNetPct: null, days: null, barsSeen: 0, eventDate: null, maePct: null, mfePct: null, maeR: null, mfeR: null };
  return {
    runDate: new Date(`${session}T10:00:00Z`),
    symbol: row.symbol,
    signal: row.signal,
    gates: { ...row.gates, cycle: meta },
    price: row.price,
    entryLow: row.entryLow,
    entryHigh: row.entryHigh,
    stopStruct: row.stopStruct,
    stopHard: row.stopHard,
    sizePct: row.maxSizePct,
    cvar: row.cvar,
    probUp: row.probUp,
    status: 'PLANNED',
    pnlPct: null,
    notes: paperNote(meta, planOf({ price: row.price, stopHard: row.stopHard }, meta).stop, pending),
  };
}

const RANK: Record<string, number> = { PLANNED: 0, EXECUTED: 1, CLOSED: 2, SKIPPED: 2 };
export const statusOf = (s: PaperResult['state']): string =>
  s === 'order' ? 'PLANNED' : s === 'open' ? 'EXECUTED' : s === 'closed' ? 'CLOSED' : 'SKIPPED';

/**
 * การอัปเดต journal จากผลของโบรกเกอร์กระดาษ — ไปข้างหน้าเท่านั้น (PLANNED → EXECUTED → CLOSED/SKIPPED)
 * รายการที่จบแล้ว (CLOSED/SKIPPED ไม่ว่าระบบหรือผู้ใช้ตั้ง) ไม่แตะอีก · null = ไม่มีอะไรเปลี่ยน
 */
export function journalUpdate(e: JournalLike, meta: CycleMeta, res: PaperResult): { status: string; pnlPct: number | null; notes: string } | null {
  const cur = RANK[e.status] ?? 2;
  if (cur >= 2) return null;
  const status = statusOf(res.state);
  if (RANK[status] < cur) return null;
  const notes = paperNote(meta, planOf(e, meta).stop, res);
  const pnlPct = res.state === 'closed' ? round(res.retNetPct!, 2) : null;
  if (status === e.status && notes === e.notes && pnlPct === e.pnlPct) return null;
  return { status, pnlPct, notes };
}

/** ไม้นี้นับเป็นหลักฐาน forward ไหม (ลำดับการตรวจ = เหตุผลที่สำคัญที่สุดก่อน) */
export function forwardReason(e: { createdAt: Date }, meta: CycleMeta, lock: { hash: string; at: Date } | null): ForwardReason {
  if (meta.dataKind !== 'real') return 'synthetic';
  if (!lock) return 'not-locked';
  if (meta.rulesHash !== lock.hash) return 'rules-changed';
  if (e.createdAt < lock.at) return 'pre-lock';
  if (e.createdAt >= nextSessionOpen(meta.session)) return 'late';
  return 'counted';
}

export const REASON_LABEL: Record<ForwardReason, string> = {
  counted: 'นับเป็นหลักฐาน forward',
  synthetic: 'ข้อมูลจำลอง',
  'not-locked': 'ยังไม่ล็อกกติกา',
  'pre-lock': 'บันทึกก่อนล็อก',
  'rules-changed': 'บันทึกด้วยกติกาชุดอื่น',
  late: 'บันทึกหลังตลาดเปิดรอบถัดไป',
};

export function ledgerRow(
  e: Pick<JournalLike, 'id' | 'createdAt' | 'symbol' | 'price' | 'stopHard' | 'sizePct' | 'probUp' | 'status'> | null,
  base: { symbol: string; price: number; stopHard: number; sizePct: number | null; probUp: number | null },
  meta: CycleMeta,
  res: PaperResult,
  reason: ForwardReason,
  name: string | null,
): LedgerRow {
  return {
    id: e?.id ?? null,
    session: meta.session,
    symbol: base.symbol,
    name,
    kind: meta.kind,
    order: { type: meta.limit === null ? 'open' : 'limit', price: meta.limit, validUntil: orderValidUntil(meta.session) },
    stop: planOf(base, meta).stop,
    target: res.target,
    sizePct: base.sizePct,
    probUp: base.probUp,
    state: res.state,
    fill: res.fill ? { date: res.fill.date, price: res.fill.price } : null,
    exit: res.exit ? { date: res.exit.date, price: res.exit.price, kind: res.exit.kind } : null,
    r: res.rNet,
    retPct: res.retNetPct,
    days: res.days,
    journalStatus: e?.status ?? null,
    recordedAt: e ? e.createdAt.toISOString() : null,
    reason,
  };
}

/** สถิติของไม้กระดาษ (สุทธิหลังค่าธรรมเนียม · ชนะ = R สุทธิ > 0) — CI ของผลเฉลี่ยจาก bootstrap seed คงที่ */
export function paperStats(rows: Array<Pick<PaperResult, 'state' | 'fill' | 'rNet' | 'retNetPct' | 'days' | 'exit'>>): PaperStats {
  const filled = rows.filter((r) => r.fill !== null).length;
  const expired = rows.filter((r) => r.state === 'expired').length;
  const gaps = rows.filter((r) => r.state === 'gap').length;
  const closed = rows.filter((r) => r.state === 'closed' && r.rNet !== null);
  const decided = filled + expired + gaps;
  const rs = closed.map((r) => r.rNet!);
  const byExit: Record<ExitKind, number> = { target: 0, stop: 0, time: 0 };
  for (const r of closed) if (r.exit) byExit[r.exit.kind]++;
  return {
    signals: rows.length,
    filled,
    fillRate: decided ? round((100 * filled) / decided, 1) : null,
    expired,
    gaps,
    open: rows.filter((r) => r.state === 'open').length,
    closed: closed.length,
    wins: rs.filter((v) => v > 0).length,
    winRate: closed.length ? round((100 * rs.filter((v) => v > 0).length) / closed.length, 1) : null,
    meanR: closed.length ? roundCI(bootMean(rs, mulberry32(SEED), 400)) : null,
    meanRet: closed.length ? round(mean(closed.map((r) => r.retNetPct!)), 3) : null,
    sumR: round(rs.reduce((a, b) => a + b, 0), 2),
    avgDays: closed.length ? round(mean(closed.map((r) => r.days ?? 0)), 2) : null,
    byExit,
  };
}

/** เทียบผล forward (R ของไม้ที่ปิดแล้ว) กับการเล่นซ้ำย้อนหลัง: z ของค่าเฉลี่ย · |z| ≥ 2 = ต่างจากที่คาดอย่างมีนัย */
export function compareForward(fwd: number[], base: number[]): WorkflowResponse['comparison'] {
  if (fwd.length < MIN_FORWARD || base.length < MIN_FORWARD) {
    return {
      verdict: 'insufficient',
      z: null,
      minTrades: MIN_FORWARD,
      text: `ยังเทียบไม่ได้ — มีไม้ forward ที่ปิดแล้วและนับได้ ${fwd.length} ไม้ ต้องมีอย่างน้อย ${MIN_FORWARD} ไม้`,
    };
  }
  const mb = mean(base);
  const se = std(base) / Math.sqrt(fwd.length);
  const mf = mean(fwd);
  const z = se > 0 ? (mf - mb) / se : 0;
  const verdict = z <= -2 ? 'below' : z >= 2 ? 'above' : 'in-line';
  const head = `ผล forward เฉลี่ย ${signed(mf)}R (${fwd.length} ไม้) เทียบที่คาด ${signed(mb)}R · z = ${signed(z)}`;
  const tail =
    verdict === 'below'
      ? ' — ต่ำกว่าที่คาดอย่างมีนัย: พักการใช้สัญญาณ (probation) แล้วหาสาเหตุก่อนเทรดต่อ'
      : verdict === 'above'
        ? ' — ดีกว่าที่คาดอย่างมีนัย: อย่าเพิ่งเพิ่มขนาดไม้ อาจเป็นโชคหรือภาวะตลาดที่เอื้อชั่วคราว'
        : ' — อยู่ในช่วงที่คาด';
  return { verdict, z: round(z, 2), minTrades: MIN_FORWARD, text: head + tail };
}

/** จำนวนไม้ขาดทุนติดกันล่าสุด (เรียงตามวันออก) */
export function losingStreak(rs: number[]): number {
  let k = 0;
  for (let i = rs.length - 1; i >= 0 && rs[i] <= 0; i--) k++;
  return k;
}

// ─────────────────────────── ขั้นตอน + สัญญาณเตือน ───────────────────────────

export interface StatusContext {
  data: WorkflowResponse['data'];
  rules: WorkflowResponse['rules'];
  session: string | null;
  deadline: string | null;
  deadlinePassed: boolean;
  todaySignals: number;
  todayRecorded: number;
  orders: number;
  positions: number;
  exposurePct: number;
  closed: number;
  lastRunSession: string | null;
  forward: PaperStats;
  excluded: WorkflowResponse['forward']['excluded'];
  comparison: WorkflowResponse['comparison'];
  streak: { k: number; p: number } | null;
}

const hhmm = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + 7 * 3_600_000).toISOString().slice(11, 16) : '');
const whenText = (iso: string | null) => (iso ? `${thDate(new Date(new Date(iso).getTime() + 7 * 3_600_000).toISOString().slice(0, 10))} ${hhmm(iso)} น.` : '—');

export function buildSteps(c: StatusContext): WorkflowStep[] {
  const d = c.data;
  const dataStep: WorkflowStep =
    d.status === 'fresh'
      ? { key: 'data', title: 'ข้อมูลตลาด', status: 'ok', summary: `ข้อมูลจริงถึงรอบ ${thDate(c.session ?? d.expectedSession)} — ตรงรอบล่าสุด`, detail: [d.label, ...d.notes], action: null }
      : d.status === 'lagging'
        ? { key: 'data', title: 'ข้อมูลตลาด', status: 'warn', summary: `ข้อมูลตามหลังรอบ ${thDate(d.expectedSession)} อยู่ 1 วันซื้อขาย`, detail: [d.label, ...d.notes], action: null }
        : d.status === 'stale' || d.status === 'empty'
          ? {
              key: 'data',
              title: 'ข้อมูลตลาด',
              status: 'block',
              summary: d.status === 'empty' ? 'ยังไม่มีข้อมูลตลาด' : `ข้อมูลค้าง ${d.lagSessions ?? '?'} วันซื้อขาย — ต้องนำเข้าข้อมูลใหม่ก่อนบันทึกสัญญาณ`,
              detail: [d.label, ...d.notes],
              action: null,
            }
          : {
              key: 'data',
              title: 'ข้อมูลตลาด',
              status: 'warn',
              summary: 'ข้อมูลจำลอง — ซ้อมกระบวนการได้ครบทุกขั้น แต่ผลไม่นับเป็นหลักฐาน forward',
              detail: [d.label, ...d.notes],
              action: null,
            };
  const r = c.rules;
  const rulesStep: WorkflowStep = !r.locked
    ? { key: 'rules', title: 'ล็อกกติกา', status: 'warn', summary: 'ยังไม่ล็อกกติกา — ไม้ที่บันทึกยังนับเป็นหลักฐาน forward ไม่ได้', detail: [`กติกาปัจจุบัน ${r.hashShort}`], action: 'lock-rules' }
    : !r.matches
      ? {
          key: 'rules',
          title: 'ล็อกกติกา',
          status: 'block',
          summary: `กติกาถูกแก้หลังล็อก (${r.hashShort} ≠ ${r.lockedHashShort}) — ล็อกชุดใหม่แล้วผล forward เริ่มนับใหม่`,
          detail: [`ล็อกล่าสุด ${whenText(r.lockedAt)}`],
          action: 'lock-rules',
        }
      : { key: 'rules', title: 'ล็อกกติกา', status: 'ok', summary: `ล็อกแล้ว ${r.hashShort} เมื่อ ${whenText(r.lockedAt)}`, detail: ['ไม้ที่บันทึกหลังจากนี้ด้วยกติกาชุดนี้นับเป็นหลักฐาน forward'], action: null };
  const signalsStep: WorkflowStep = {
    key: 'signals',
    title: 'สัญญาณรอบล่าสุด',
    status: c.session ? 'ok' : 'wait',
    summary: c.session ? (c.todaySignals ? `${c.todaySignals} สัญญาณจากราคาปิดวันที่ ${thDate(c.session)}` : `ไม่มีสัญญาณจากราคาปิดวันที่ ${thDate(c.session)}`) : 'รอข้อมูล',
    detail: ['สัญญาณ = ผ่าน 5 ด่าน (pullback) หรือ G1–G4 + breakout (momentum) — ชุดเดียวกับ Decision Board'],
    action: null,
  };
  const dataBlocked = dataStep.status === 'block';
  const recordStep: WorkflowStep = dataBlocked
    ? { key: 'record', title: 'บันทึกก่อนตลาดเปิด', status: 'block', summary: 'ไม่บันทึกสัญญาณใหม่จากข้อมูลค้าง', detail: [], action: null }
    : c.todaySignals === 0
      ? { key: 'record', title: 'บันทึกก่อนตลาดเปิด', status: 'ok', summary: 'รอบนี้ไม่มีสัญญาณให้บันทึก', detail: [], action: c.lastRunSession === c.session ? null : 'run-cycle' }
      : c.todayRecorded >= c.todaySignals
        ? { key: 'record', title: 'บันทึกก่อนตลาดเปิด', status: 'ok', summary: `บันทึกแล้ว ${c.todayRecorded}/${c.todaySignals} รายการใน Journal`, detail: [`เส้นตาย ${whenText(c.deadline)}`], action: null }
        : c.deadlinePassed
          ? {
              key: 'record',
              title: 'บันทึกก่อนตลาดเปิด',
              status: 'warn',
              summary: `เลยเวลาเปิดตลาดรอบถัดไปแล้ว — บันทึกได้ แต่ไม่นับเป็นหลักฐาน forward (${c.todayRecorded}/${c.todaySignals})`,
              detail: [`เส้นตาย ${whenText(c.deadline)}`],
              action: 'run-cycle',
            }
          : {
              key: 'record',
              title: 'บันทึกก่อนตลาดเปิด',
              status: 'wait',
              summary: `ยังไม่ได้บันทึก ${c.todaySignals - c.todayRecorded} รายการ — รันรอบก่อน ${whenText(c.deadline)}`,
              detail: [],
              action: 'run-cycle',
            };
  const stale = c.lastRunSession !== c.session;
  const trackStep: WorkflowStep = {
    key: 'track',
    title: 'ติดตามผล (โบรกเกอร์กระดาษ)',
    status: stale && (c.orders + c.positions > 0 || c.todaySignals > 0) ? 'wait' : 'ok',
    summary: `คำสั่งรอ ${c.orders} · ถืออยู่ ${c.positions} (รวม ${round(c.exposurePct, 1)}% ของพอร์ต) · ปิดแล้ว ${c.closed}`,
    detail: [
      `เข้า: pullback ตั้งซื้อที่ขอบบนของโซน · momentum ซื้อที่ราคาเปิด · คำสั่งอายุ ${EXEC.orderDays} วันทำการ · เปิดต่ำกว่า stop = ยกเลิก`,
      `ออก: stop ของแผน${EXEC.stopMult !== 1 ? ` × ${EXEC.stopMult}` : ''} · เป้า +${EXEC.targetR}R · ถือไม่เกิน ${EXEC.holdDays} วันทำการ · แท่งเดียวแตะทั้งสองฝั่ง = นับ stop · ผลหักค่าธรรมเนียมไป-กลับ ${EXEC.costPct}%`,
      ...(stale ? ['ยังไม่ได้อัปเดตสถานะด้วยราคาล่าสุด — รันรอบนี้'] : []),
    ],
    action: stale ? 'run-cycle' : null,
  };
  const cmp = c.comparison;
  const evaluateStep: WorkflowStep = {
    key: 'evaluate',
    title: 'เทียบความคาดหวัง',
    status: cmp.verdict === 'insufficient' ? 'wait' : cmp.verdict === 'below' ? 'block' : cmp.verdict === 'above' ? 'warn' : 'ok',
    summary: cmp.text,
    detail: [
      `นับได้ ${c.forward.signals} สัญญาณ · ไม่นับ: ข้อมูลจำลอง ${c.excluded.synthetic} · ยังไม่ล็อก ${c.excluded['not-locked']} · ก่อนล็อก ${c.excluded['pre-lock']} · กติกาชุดอื่น ${c.excluded['rules-changed']} · บันทึกช้า ${c.excluded.late}`,
    ],
    action: null,
  };
  return [dataStep, rulesStep, signalsStep, recordStep, trackStep, evaluateStep];
}

export function buildAlerts(c: StatusContext): WorkflowAlert[] {
  const out: WorkflowAlert[] = [];
  if (c.data.status === 'stale' || c.data.status === 'empty')
    out.push({ level: 'danger', text: c.data.status === 'empty' ? 'ยังไม่มีข้อมูลตลาด — นำเข้าข้อมูลก่อนเริ่มรอบ' : `ข้อมูลค้าง ${c.data.lagSessions} วันซื้อขาย — หยุดบันทึกสัญญาณใหม่จนกว่าจะนำเข้าข้อมูลล่าสุด` });
  if (c.rules.locked && !c.rules.matches) out.push({ level: 'danger', text: 'กติกาถูกแก้หลังล็อก — ผลที่บันทึกด้วยกติกาใหม่ไม่นับเป็นหลักฐาน forward จนกว่าจะล็อกชุดใหม่' });
  if (c.comparison.verdict === 'below') out.push({ level: 'danger', text: c.comparison.text });
  if (c.streak && c.streak.p < 0.01)
    out.push({ level: 'warn', text: `ขาดทุนติดกัน ${c.streak.k} ไม้ — ถ้าระบบยังเป็นแบบที่คาด โอกาสเกิดแค่ ${(c.streak.p * 100).toFixed(2)}% · ลดขนาดไม้และตรวจสภาพตลาด` });
  if (c.exposurePct > 100) out.push({ level: 'warn', text: `ขนาดไม้ที่ถืออยู่รวม ${round(c.exposurePct, 1)}% ของพอร์ต เกิน 100% — สัญญาณพร้อมกันหลายตัวคือการเดิมพันทิศเดียวกัน` });
  if (c.data.status === 'lagging') out.push({ level: 'warn', text: `ข้อมูลตามหลัง 1 วันซื้อขาย — สัญญาณของรอบ ${thDate(c.data.expectedSession)} ยังไม่เกิด` });
  if (!c.rules.locked) out.push({ level: 'warn', text: 'ยังไม่ล็อกกติกา — ล็อกก่อนเริ่มเก็บผล forward (pre-registration)' });
  if (c.todaySignals > c.todayRecorded && !c.deadlinePassed && c.data.status !== 'stale' && c.data.status !== 'empty')
    out.push({ level: 'info', text: `มี ${c.todaySignals - c.todayRecorded} สัญญาณที่ยังไม่ได้บันทึก — บันทึกก่อน ${whenText(c.deadline)}` });
  if (c.data.status === 'synthetic')
    out.push({ level: 'info', text: 'ข้อมูลจำลอง: ใช้ซ้อมกระบวนการ · ผล forward จะเริ่มนับเมื่อใช้ข้อมูลจริงที่นำเข้าทุกวัน' });
  return out;
}
