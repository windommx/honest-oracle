// ============================================================
// กระบวนการทำงานประจำวัน (server-only) — รันรอบ (บันทึกสัญญาณ + อัปเดตไม้กระดาษ) และประกอบสถานะของหน้า "กระบวนการทำงาน"
// ไม้กระดาษเก็บใน JournalEntry (ป้าย [รอบอัตโนมัติ] + meta ใน gates.cycle) — สถานะคำนวณใหม่จากแท่งราคาทุกครั้ง (deterministic)
// รันซ้ำได้ไม่ซ้ำรายการ (หนึ่งหุ้นต่อหนึ่งวันสัญญาณ) · รันพร้อมกันหลายทาง (ปุ่ม/ตัวตั้งเวลา/CLI ในโปรเซสเดียว) ใช้ผลรอบเดียวกัน
// ============================================================

import type { Prisma } from '@prisma/client';
import { logAction, logSystemAction } from '@/lib/audit';
import { nextSessionOpen, nextTradingDay } from '@/lib/data/calendar';
import { getDataProvenance } from '@/lib/data/provenance';
import { db } from '@/lib/db';
import { getBoard } from '@/lib/quant/engine/api';
import { loadMarketState } from '@/lib/quant/engine/panel';
import { RULES_HASH, RULES_HASH_SHORT } from '@/lib/quant/engine/rules';
import { rulesStamp } from '@/lib/quant/engine/rules-registry';
import type { MarketState } from '@/lib/quant/engine/types';
import { rhythmBase } from '@/lib/rhythm/service';
import {
  buildAlerts,
  buildSteps,
  compareForward,
  CYCLE_TAG,
  cycleMetaOf,
  decisionRecord,
  forwardReason,
  journalUpdate,
  ledgerRow,
  losingStreak,
  paperStats,
  planOf,
  type CycleMeta,
  type StatusContext,
} from './cycle';
import { EXEC, simulatePlan, type Bars, type PaperResult } from './execution';
import { barsOf, equityCurve, replayBaseline, type ReplayBaseline } from './replay';
import { CYCLE_READY_LABEL, cycleAutoEnabled } from './scheduler';
import type { CycleReport, ForwardReason, LedgerRow, WorkflowResponse } from './types';

const keyOf = (d: Date) => d.toISOString().slice(0, 10);
const bangkokDate = (d: Date) => new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
const INVALID: PaperResult = { state: 'invalid', fill: null, exit: null, target: null, r: null, retPct: null, days: null, barsSeen: 0, eventDate: null };

/** แท่งราคาของทุกหุ้น (สร้างเมื่อใช้) + ดัชนีวันที่ของ MarketState */
function priceIndex(state: MarketState) {
  const dates = state.dates.map(keyOf);
  const dayIdx = new Map(dates.map((d, i) => [d, i]));
  const symIdx = new Map(state.stocks.map((s, i) => [s.symbol, i]));
  const bars = new Map<number, Bars>();
  const resolve = (symbol: string, meta: CycleMeta, plan: ReturnType<typeof planOf>): PaperResult => {
    const si = symIdx.get(symbol);
    const t = dayIdx.get(meta.session);
    if (si === undefined || t === undefined) return INVALID;
    if (!bars.has(si)) bars.set(si, barsOf(state, si, dates));
    return simulatePlan(bars.get(si)!, t, plan);
  };
  return { dates, resolve, names: new Map(state.stocks.map((s) => [s.symbol, s.name])) };
}

const cycleEntries = (extra: Prisma.JournalEntryWhereInput = {}) =>
  db.journalEntry.findMany({ where: { notes: { startsWith: CYCLE_TAG }, ...extra }, orderBy: [{ runDate: 'desc' }, { symbol: 'asc' }], take: 1000 });

// ─────────────────────────── รันรอบ ───────────────────────────

let inflight: Promise<CycleReport> | null = null;

/** บันทึกสัญญาณของรอบล่าสุดลง Journal (ถ้าข้อมูลไม่ค้าง) แล้วอัปเดตไม้กระดาษที่ยังไม่จบด้วยราคาล่าสุด */
export function runCycle(opts: { actor: string; req?: Request; now?: Date }): Promise<CycleReport> {
  if (inflight) return inflight;
  inflight = runCycleOnce(opts).finally(() => {
    inflight = null;
  });
  return inflight;
}

async function runCycleOnce(opts: { actor: string; req?: Request; now?: Date }): Promise<CycleReport> {
  const t0 = performance.now();
  const now = opts.now ?? new Date();
  const state = await loadMarketState();
  const [prov, board] = await Promise.all([getDataProvenance(now), getBoard()]);
  const idx = priceIndex(state);
  const session = idx.dates[idx.dates.length - 1];
  const existing = await cycleEntries();
  const have = new Set(existing.flatMap((e) => {
    const m = cycleMetaOf(e.gates);
    return m ? [`${e.symbol}|${m.session}`] : [];
  }));
  const blocked =
    prov.freshness.status === 'empty'
      ? 'ยังไม่มีข้อมูลตลาด'
      : prov.freshness.status === 'stale'
        ? `ข้อมูลค้าง ${prov.freshness.lagSessions} วันซื้อขาย — ไม่บันทึกสัญญาณใหม่จากราคาเก่า`
        : null;
  let recorded = 0;
  let alreadyRecorded = 0;
  for (const row of board.rows) {
    if (row.signal === 'NO_TRADE') continue;
    if (have.has(`${row.symbol}|${session}`)) {
      alreadyRecorded++;
      continue;
    }
    if (blocked) continue;
    const data = decisionRecord(row, session, { rulesHash: RULES_HASH, dataKind: prov.kind });
    await db.journalEntry.create({ data: { ...data, gates: data.gates as unknown as Prisma.InputJsonValue } });
    recorded++;
  }
  let resolved = 0;
  for (const e of await cycleEntries({ status: { in: ['PLANNED', 'EXECUTED'] } })) {
    const meta = cycleMetaOf(e.gates);
    if (!meta) continue;
    const upd = journalUpdate(e, meta, idx.resolve(e.symbol, meta, planOf(e, meta)));
    if (!upd) continue;
    await db.journalEntry.update({ where: { id: e.id }, data: upd });
    resolved++;
  }
  const report: CycleReport = { session, dataKind: prov.kind, recorded, alreadyRecorded, resolved, blocked, tookMs: Math.round(performance.now() - t0) };
  const detail = { session, recorded, alreadyRecorded, resolved, blocked, dataKind: prov.kind, rules: RULES_HASH_SHORT };
  if (opts.req) await logAction(opts.req, 'workflow.run', 200, detail);
  else await logSystemAction(opts.actor, 'workflow.run', detail);
  return report;
}

// ─────────────────────────── สถานะของหน้า ───────────────────────────

const baselineCache = new WeakMap<MarketState, Map<string, ReplayBaseline>>();

function baselineFor(state: MarketState, beforeDate: string | null): ReplayBaseline | null {
  const base = rhythmBase(state);
  if (!base) return null;
  let m = baselineCache.get(state);
  if (!m) baselineCache.set(state, (m = new Map()));
  const k = beforeDate ?? 'all';
  if (!m.has(k)) m.set(k, replayBaseline(state, base.gates, beforeDate));
  return m.get(k)!;
}

async function lastRunLog() {
  try {
    return await db.actionLog.findFirst({ where: { action: 'workflow.run' }, orderBy: { createdAt: 'desc' } });
  } catch {
    return null;
  }
}

/** วันสัญญาณล่าสุดในข้อมูล + รอบที่รันล่าสุด (ตัวตั้งเวลาใช้ตัดสินว่าควรรันไหม) */
export async function latestSessionAndLastRun(): Promise<{ session: string | null; lastRunSession: string | null }> {
  const state = await loadMarketState();
  const run = await lastRunLog();
  const session = state.dates.length ? keyOf(state.dates[state.dates.length - 1]) : null;
  const s = (run?.detail as { session?: unknown } | null)?.session;
  return { session, lastRunSession: typeof s === 'string' ? s : null };
}

export async function getWorkflow(now: Date = new Date()): Promise<WorkflowResponse> {
  const state = await loadMarketState();
  const [prov, stamp, board, entries, run] = await Promise.all([getDataProvenance(now), rulesStamp(), getBoard(), cycleEntries(), lastRunLog()]);
  const idx = priceIndex(state);
  const session = idx.dates.length ? idx.dates[idx.dates.length - 1] : null;
  const lock = stamp.registered ? { hash: stamp.registered.hash, at: new Date(stamp.registered.at) } : null;

  // สมุดไม้กระดาษ (จาก Journal)
  const ledger: LedgerRow[] = [];
  const results: Array<{ row: LedgerRow; res: PaperResult }> = [];
  for (const e of entries) {
    const meta = cycleMetaOf(e.gates);
    if (!meta) continue;
    const res = idx.resolve(e.symbol, meta, planOf(e, meta));
    const row = ledgerRow(e, { symbol: e.symbol, price: e.price, stopHard: e.stopHard ?? 0, sizePct: e.sizePct, probUp: e.probUp }, meta, res, forwardReason(e, meta, lock), idx.names.get(e.symbol) ?? null);
    ledger.push(row);
    results.push({ row, res });
  }
  const recorded = new Map(ledger.filter((r) => r.session === session).map((r) => [r.symbol, r]));

  // สัญญาณของรอบล่าสุด: รายการที่บันทึกแล้ว หรือพรีวิวของสิ่งที่รอบนี้จะบันทึก
  const today: LedgerRow[] = [];
  if (session) {
    for (const r of board.rows) {
      if (r.signal === 'NO_TRADE') continue;
      const hit = recorded.get(r.symbol);
      if (hit) {
        today.push(hit);
        continue;
      }
      const rec = decisionRecord(r, session, { rulesHash: RULES_HASH, dataKind: prov.kind });
      const meta = cycleMetaOf(rec.gates)!;
      const res = idx.resolve(r.symbol, meta, planOf(rec, meta));
      today.push(ledgerRow(null, { symbol: r.symbol, price: r.price, stopHard: r.stopHard, sizePct: r.maxSizePct, probUp: r.probUp }, meta, res, forwardReason({ createdAt: now }, meta, lock), r.name));
    }
  }

  // หลักฐาน forward vs ฐานความคาดหวัง (เล่นซ้ำก่อนวันล็อก)
  const counted = results.filter((x) => x.row.reason === 'counted');
  const excluded = { synthetic: 0, 'not-locked': 0, 'pre-lock': 0, 'rules-changed': 0, late: 0 } as Record<Exclude<ForwardReason, 'counted'>, number>;
  for (const x of results) if (x.row.reason !== 'counted') excluded[x.row.reason]++;
  const fwdStats = paperStats(counted.map((x) => x.res));
  const baseline = baselineFor(state, lock ? bangkokDate(lock.at) : null);
  const baseStats = paperStats((baseline?.trades ?? []).map((x) => x.res));
  const byExitDate = (xs: Array<{ res: PaperResult }>) =>
    xs.filter((x) => x.res.state === 'closed' && x.res.r !== null).sort((a, b) => a.res.exit!.date.localeCompare(b.res.exit!.date)).map((x) => x.res.r!);
  const fwdR = byExitDate(counted);
  const baseR = byExitDate(baseline?.trades ?? []);
  const comparison = compareForward(fwdR, baseR);
  const k = losingStreak(fwdR);
  const baseWin = baseStats.winRate === null ? null : baseStats.winRate / 100;
  const streak = k >= 3 && baseWin !== null ? { k, p: Math.pow(1 - baseWin, k) } : null;

  const deadline = session ? nextSessionOpen(session) : null;
  const runDetail = (run?.detail ?? null) as { session?: unknown; recorded?: unknown; resolved?: unknown } | null;
  const lastRunSession = typeof runDetail?.session === 'string' ? runDetail.session : null;
  const openRows = ledger.filter((r) => r.state === 'open');
  const data: WorkflowResponse['data'] = {
    kind: prov.kind,
    label: prov.label,
    status: prov.freshness.status,
    lagSessions: prov.freshness.lagSessions,
    expectedSession: prov.freshness.expectedSession,
    notes: prov.freshness.notes,
  };
  const rules: WorkflowResponse['rules'] = {
    hashShort: stamp.hashShort,
    locked: stamp.registered !== null,
    lockedAt: stamp.registered?.at ?? null,
    lockedHashShort: stamp.registered?.hashShort ?? null,
    matches: stamp.matchesRegistered,
  };
  const ctx: StatusContext = {
    data,
    rules,
    session,
    deadline: deadline?.toISOString() ?? null,
    deadlinePassed: deadline ? now >= deadline : false,
    todaySignals: today.length,
    todayRecorded: today.filter((r) => r.id !== null).length,
    orders: ledger.filter((r) => r.state === 'order').length,
    positions: openRows.length,
    exposurePct: openRows.reduce((a, r) => a + (r.sizePct ?? 0), 0),
    closed: ledger.filter((r) => r.state === 'closed').length,
    lastRunSession,
    forward: fwdStats,
    excluded,
    comparison,
    streak,
  };
  return {
    now: now.toISOString(),
    session,
    nextSession: session ? nextTradingDay(session) : null,
    deadline: ctx.deadline,
    data,
    rules,
    steps: buildSteps(ctx),
    today,
    ledger: ledger.slice(0, 200),
    forward: { since: rules.lockedAt, stats: fwdStats, excluded },
    baseline: {
      start: baseline?.start ?? null,
      end: baseline?.end ?? null,
      sessions: baseline?.sessions ?? 0,
      stats: baseStats,
      equity: equityCurve(baseline?.trades ?? []),
      note: 'เล่นกระบวนการซ้ำย้อนหลังด้วยโบรกเกอร์กระดาษชุดเดียวกัน · แผน ณ วันนั้นใช้ risk แบบ parametric (เร็ว) — ต่างจาก Decision Board ที่ใช้ Monte Carlo เล็กน้อย · เป็นผลในตัวอย่าง (กติกาถูกจูนบนข้อมูลช่วงนี้)',
    },
    comparison,
    alerts: buildAlerts(ctx),
    lastRun: run
      ? {
          at: run.createdAt.toISOString(),
          actor: run.actor,
          session: lastRunSession,
          recorded: typeof runDetail?.recorded === 'number' ? runDetail.recorded : 0,
          resolved: typeof runDetail?.resolved === 'number' ? runDetail.resolved : 0,
        }
      : null,
    schedule: { auto: cycleAutoEnabled(), readyAfter: CYCLE_READY_LABEL, cli: 'bun scripts/daily-cycle.ts' },
    exec: { orderDays: EXEC.orderDays, holdDays: EXEC.holdDays, targetR: EXEC.targetR },
  };
}
