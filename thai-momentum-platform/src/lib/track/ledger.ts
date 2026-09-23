// ============================================================
// Ledger ของพอร์ตกระดาษ Jev — สร้าง "ไม้" (leg) จาก Decision + Trade + Position โดยไม่แก้ schema (pure)
//
// ที่มาของแต่ละส่วน:
//   - ไม้เข้า  = Decision Q_ENTRY action=buy executed=true (source lite / reversal / human)
//   - ไม้ออก  = Decision Q_EXIT action=exit executed=true ของหุ้นเดียวกัน (ครั้งแรกหลังไม้เข้า)
//   - ราคา    = Trade (stopPolicy "jev" — ไม้ที่ /api/jev/run ปิดเอง) → Position (ไม้เปิด) → snapshot → ไม่มี
//   - ขนาด    = Position.slots (ไม้เปิด) → track_snapshot ที่เคยบันทึก → ประมาณจาก conf (1.0 ถ้า ≥ 0.85 ไม่งั้น 0.5)
//     Trade ไม่มีคอลัมน์ slots — ไม้ที่ปิดก่อนมี snapshot จึงต้องประมาณ และติดป้าย "estimated" เสมอ
//
// ไม่นับ: Trade ของ seed (stopPolicy fixed15 = ประวัติจำลองของ Bayes Stop) · สถานะที่ไม่มีไม้เข้าจาก Jev
// (เช่น 5 สถานะตัวอย่างของ seed) · การตัดสินใจก่อนยุคข้อมูลปัจจุบัน (ก่อน seed/replaceDemo ล่าสุด)
// ============================================================

import { createHash } from "crypto"

export const JEV_QUESTIONS = ["Q_REGIME", "Q_ENTRY", "Q_EXIT", "Q_ESCALATE", "Q_PAIRS"] as const

/** รอบตัดสินใจที่ createdAt ช้ากว่าวันของข้อมูลเกินนี้ (วันปฏิทิน) = replay/backfill ไม่ใช่ live */
export const LIVE_MAX_LAG_DAYS = 4

export interface LedgerDecision {
  id: number
  date: string
  question: string
  target: string
  action: string
  conf: number
  reason: string
  executed: boolean
  source: string
  createdAt: Date | string | number
}

export interface LedgerTrade {
  id: number
  symbol: string
  entry: string
  exit: string
  entryPx: number
  exitPx: number
  ret: number
  stopPolicy: string
}

export interface LedgerPosition {
  symbol: string
  entryDate: string
  entryPx: number
  slots: number
}

export interface SnapshotLegInfo {
  symbol: string
  entryDate: string
  entryPx: number | null
  slots: number
}

export interface Leg {
  symbol: string
  entryId: number
  entryDate: string
  recordedEntryPx: number | null
  exitId: number | null
  exitDate: string | null
  recordedExitPx: number | null
  recordedRetPct: number | null
  slots: number
  slotsSource: "position" | "snapshot" | "estimated"
  source: string
  conf: number
  status: "open" | "closed" | "orphan"
}

export interface LedgerCounts {
  total: number
  runs: number
  entries: number
  exits: number
  tightens: number
  watch: number
  pendingBuys: number
  human: number
  reversal: number
  shadow: number
  priorEpoch: number
  unmatchedExits: number
  orphanLegs: number
  estimatedSlots: number
  duplicateEntries: number
}

export interface LedgerResult {
  legs: Leg[]
  counts: LedgerCounts
  /** Decision ของ Jev ในยุคข้อมูลปัจจุบัน (เรียง id) — ใช้ทำ ledger hash */
  epochDecisions: LedgerDecision[]
  liveSince: string | null
  firstRunAt: string | null
  runDates: string[]
  untrackedPositions: string[]
  mode: { label: "LIVE" | "REPLAY" | "MIXED" | "NONE"; liveRuns: number; replayRuns: number; maxLagDays: number | null; firstLiveDate: string | null }
}

export function toMs(t: Date | string | number): number {
  if (typeof t === "number") return t
  const d = t instanceof Date ? t : new Date(t)
  return d.getTime()
}

/** วันที่ปฏิทินกรุงเทพของ instant (UTC+7 คงที่) */
function bkkDate(ms: number): string {
  return new Date(ms + 7 * 3_600_000).toISOString().slice(0, 10)
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}

export function isJevDecision(d: Pick<LedgerDecision, "question" | "source">): boolean {
  return (JEV_QUESTIONS as readonly string[]).includes(d.question) && d.source !== "policy"
}

/** ขนาดตั้งต้นของ Jev ก่อนปรับ vol/meta/sector: 1.0 ถ้า conf ≥ 0.85 ไม่งั้น 0.5 (กติกาเดียวกับ /api/jev/run และ human gate) */
export function estimatedSlots(conf: number): number {
  return conf >= 0.85 ? 1 : 0.5
}

export function buildLedger(input: {
  decisions: LedgerDecision[]
  trades: LedgerTrade[]
  positions: LedgerPosition[]
  snapshotLegs?: SnapshotLegInfo[]
  /** createdAt ของ Decision ต้อง "หลัง" เวลานี้จึงนับอยู่ในยุคข้อมูลปัจจุบัน (null = ไม่มีขอบยุค) */
  epochStartMs?: number | null
}): LedgerResult {
  const epochStart = input.epochStartMs ?? null
  const jev = input.decisions.filter(isJevDecision).sort((a, b) => a.id - b.id)
  const epoch = epochStart === null ? jev : jev.filter((d) => toMs(d.createdAt) > epochStart)
  const priorEpoch = jev.length - epoch.length

  const counts: LedgerCounts = {
    total: epoch.length,
    runs: 0,
    entries: 0,
    exits: 0,
    tightens: 0,
    watch: 0,
    pendingBuys: 0,
    human: 0,
    reversal: 0,
    shadow: 0,
    priorEpoch,
    unmatchedExits: 0,
    orphanLegs: 0,
    estimatedSlots: 0,
    duplicateEntries: 0,
  }

  // ---- รอบตัดสินใจ (Q_REGIME = 1 แถวต่อรอบ) + live vs replay ----
  const regimeRows = epoch.filter((d) => d.question === "Q_REGIME")
  const runDates = [...new Set(regimeRows.map((d) => d.date))].sort()
  counts.runs = runDates.length
  let liveRuns = 0
  let replayRuns = 0
  let maxLag: number | null = null
  let firstLiveDate: string | null = null
  const seenRun = new Set<string>()
  for (const d of regimeRows) {
    if (seenRun.has(d.date)) continue
    seenRun.add(d.date)
    const lag = daysBetween(d.date, bkkDate(toMs(d.createdAt)))
    maxLag = maxLag === null ? lag : Math.max(maxLag, lag)
    if (lag <= LIVE_MAX_LAG_DAYS) {
      liveRuns++
      if (!firstLiveDate || d.date < firstLiveDate) firstLiveDate = d.date
    } else replayRuns++
  }
  const modeLabel = counts.runs === 0 ? "NONE" : replayRuns === 0 ? "LIVE" : liveRuns === 0 ? "REPLAY" : "MIXED"

  for (const d of epoch) {
    if (d.source === "human") counts.human++
    if (d.source === "reversal") counts.reversal++
    if (d.source.includes("shadow")) counts.shadow++
    if (d.question === "Q_ENTRY" && d.action === "watch") counts.watch++
    if (d.question === "Q_ENTRY" && d.action === "buy" && !d.executed && !d.source.includes("shadow")) counts.pendingBuys++
    if (d.question === "Q_EXIT" && d.action === "tighten" && d.executed) counts.tightens++
  }

  // ---- จับคู่ไม้เข้า/ออก ตามลำดับ id ----
  const entries = epoch.filter((d) => d.question === "Q_ENTRY" && d.action === "buy" && d.executed && !d.source.includes("shadow"))
  const exits = epoch.filter((d) => d.question === "Q_EXIT" && d.action === "exit" && d.executed)
  counts.entries = entries.length
  counts.exits = exits.length

  const tradeBy = new Map<string, LedgerTrade>()
  for (const t of input.trades) if (t.stopPolicy === "jev") tradeBy.set(`${t.symbol}|${t.entry}|${t.exit}`, t)
  const tradeByEntry = new Map<string, LedgerTrade>()
  for (const t of input.trades) if (t.stopPolicy === "jev") tradeByEntry.set(`${t.symbol}|${t.entry}`, t)
  const posBy = new Map<string, LedgerPosition>()
  for (const p of input.positions) posBy.set(p.symbol, p)
  // snapshot ล่าสุดที่เห็นไม้นี้ชนะ (ส่งมาเรียงเก่า → ใหม่)
  const snapBy = new Map<string, SnapshotLegInfo>()
  for (const s of input.snapshotLegs ?? []) snapBy.set(`${s.symbol}|${s.entryDate}`, s)

  const usedExit = new Set<number>()
  const openBySymbol = new Map<string, Leg>()
  const legs: Leg[] = []
  // เดินตาม id: ไม้เข้าเปิด leg ใหม่ · ไม้ออกปิด leg ที่เปิดอยู่ของหุ้นนั้น
  const timeline = [...entries.map((d) => ({ d, kind: "entry" as const })), ...exits.map((d) => ({ d, kind: "exit" as const }))].sort(
    (a, b) => a.d.id - b.d.id,
  )
  for (const { d, kind } of timeline) {
    if (kind === "entry") {
      if (openBySymbol.has(d.target)) {
        counts.duplicateEntries++ // ระบบกันไว้แล้ว (มีสถานะอยู่แล้ว) — ถ้าเกิดจริงไม่เปิดไม้ซ้อน
        continue
      }
      const leg: Leg = {
        symbol: d.target,
        entryId: d.id,
        entryDate: d.date,
        recordedEntryPx: null,
        exitId: null,
        exitDate: null,
        recordedExitPx: null,
        recordedRetPct: null,
        slots: estimatedSlots(d.conf),
        slotsSource: "estimated",
        source: d.source,
        conf: d.conf,
        status: "open",
      }
      openBySymbol.set(d.target, leg)
      legs.push(leg)
    } else {
      const leg = openBySymbol.get(d.target)
      if (!leg) {
        counts.unmatchedExits++ // ปิดสถานะที่ไม่ได้เข้าโดย Jev ในยุคนี้ (เช่นสถานะตัวอย่างของ seed)
        continue
      }
      usedExit.add(d.id)
      leg.exitId = d.id
      leg.exitDate = d.date
      leg.status = "closed"
      openBySymbol.delete(d.target)
    }
  }

  // ---- เติมราคา/ขนาดจากแหล่งที่บันทึกไว้ ----
  const trackedOpen = new Set<string>()
  for (const leg of legs) {
    const snap = snapBy.get(`${leg.symbol}|${leg.entryDate}`)
    if (leg.status === "closed") {
      const t = tradeBy.get(`${leg.symbol}|${leg.entryDate}|${leg.exitDate}`)
      if (t) {
        leg.recordedEntryPx = t.entryPx
        leg.recordedExitPx = t.exitPx
        leg.recordedRetPct = t.ret
      } else if (snap) leg.recordedEntryPx = snap.entryPx
      if (snap) {
        leg.slots = snap.slots
        leg.slotsSource = "snapshot"
      }
    } else {
      const p = posBy.get(leg.symbol)
      if (p && p.entryDate === leg.entryDate) {
        leg.recordedEntryPx = p.entryPx
        leg.slots = p.slots
        leg.slotsSource = "position"
        trackedOpen.add(leg.symbol)
      } else {
        // ไม่มีสถานะแล้วแต่ไม่มีไม้ออกที่บันทึก (เช่นถูกล้างโดย replaceDemo) → ประเมินผลไม่ได้ ไม่นับใน NAV
        leg.status = "orphan"
        const t = tradeByEntry.get(`${leg.symbol}|${leg.entryDate}`)
        if (t) leg.recordedEntryPx = t.entryPx
        else if (snap) leg.recordedEntryPx = snap.entryPx
        if (snap) {
          leg.slots = snap.slots
          leg.slotsSource = "snapshot"
        }
      }
    }
    if (leg.slotsSource === "estimated" && leg.status !== "orphan") counts.estimatedSlots++
    if (leg.status === "orphan") counts.orphanLegs++
  }
  const untrackedPositions = input.positions.map((p) => p.symbol).filter((s) => !trackedOpen.has(s)).sort()

  const firstRun = regimeRows[0] ?? null
  return {
    legs,
    counts,
    epochDecisions: epoch,
    liveSince: runDates[0] ?? (epoch[0]?.date ?? null),
    firstRunAt: firstRun ? new Date(toMs(firstRun.createdAt)).toISOString() : null,
    runDates,
    untrackedPositions,
    mode: { label: modeLabel, liveRuns, replayRuns, maxLagDays: maxLag, firstLiveDate },
  }
}

// ---------------- ledger hash (sha256 chain เหมือน EventLog) ----------------

export const LEDGER_GENESIS = "LEDGER-GENESIS"

function decisionLine(d: LedgerDecision): string {
  return [d.id, d.date, d.question, d.target, d.action, String(d.conf), d.executed ? 1 : 0, d.source, toMs(d.createdAt), d.reason].join("|")
}

/**
 * hash chain ของ Decision (เรียง id): h_k = sha256(h_{k−1} + line_k) — outcome ไม่อยู่ใน line (verify เติมภายหลังได้)
 * คืน prefix hash ทุกจุด → ตรวจ snapshot ย้อนหลังได้ในรอบเดียว (hash ณ decision id ใด ๆ)
 */
export function ledgerChain(decisions: LedgerDecision[]): { id: number; hash: string }[] {
  let prev = LEDGER_GENESIS
  const out: { id: number; hash: string }[] = []
  for (const d of [...decisions].sort((a, b) => a.id - b.id)) {
    prev = createHash("sha256").update(prev + decisionLine(d)).digest("hex")
    out.push({ id: d.id, hash: prev })
  }
  return out
}

/** hash ของ prefix ที่ id ≤ maxId (ไม่มี decision = GENESIS hash) */
export function chainHashAt(chain: { id: number; hash: string }[], maxId: number): string {
  let lo = 0
  let hi = chain.length - 1
  let ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (chain[mid].id <= maxId) {
      ans = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  return ans >= 0 ? chain[ans].hash : createHash("sha256").update(LEDGER_GENESIS).digest("hex")
}
