// ============================================================
// Flagship Funnel — สายพานคัดกรอง 6 ด่าน → สัญญาณอันดับ 1–10
//
// แนวคิด: ไม่มีเอนจินเดียวในระบบที่ "แม่นที่สุด" ได้ด้วยตัวเอง —
// ความน่าเชื่อถือเกิดจากการให้ "ทุกกระบวนการ" คัดกรองต่อกันตามลำดับ
// (Data → Momentum → Sector → Confluence) แล้วจึงให้คะแนนรวมด้วย
// น้ำหนักที่ลงทะเบียนไว้ล่วงหน้า (ไม่มีพารามิเตอร์แอบแฝง)
//
// ด่านคัดกรอง (ทุกด่านบันทึกเหตุผลการคัดออก — ห้ามหาย):
//   G1 Data & Liquidity : ราคา ≥ 1฿ · มูลค่าซื้อขายเฉลี่ย 20 วัน ≥ 1 ล้าน · ประวัติ ≥ 60 วัน
//   G2 Momentum         : percentile ครึ่งบนของตลาด · MFD < 0.45 (ไม่แรงขายกระจาย)
//   G3 Sector           : กลุ่มไม่อยู่ท้ายตาราง (2 กลุ่มสุดท้ายออก)
//   G4 Confluence       : ผ่านเกณฑ์ 3 ชั้นของ SET Sniper (Location×Value×Behavior ≥ 45)
//
// น้ำหนักคะแนน ReliabilityScore (ลงทะเบียนล่วงหน้า — รวม 100):
//   engine 35 (โมเมนตัม percentile) · confluence 25 · trend 15 ·
//   evidence 15 (accumulation + ผู้นำกลุ่ม + ร่องรอย sweep/FVG) · risk 10 (vol ต่ำได้เปรียบ)
//
// ความจริงใจ: ชั้น Confluence คำนวณใหม่จาก OHLC ในฐานข้อมูลสำหรับ "ทุกตัวที่ผ่าน G3"
// (ไม่จำกัด watchlist 24 ตัวของ SET Sniper) — ตัวที่แท่งไม่พอ/ไม่มี OHLC ถูกคัดออกพร้อมเหตุผล
// ============================================================

import { db } from "@/lib/db"
import { getPanelCached, loadAll, readSignalsPolicy } from "@/lib/momentum/signals/io"
import { computeRegimeState, runDataQualityChecks } from "@/lib/momentum/core"
import { runSniperReport, sniperKey } from "@/lib/sniper/report"
import { evaluateSymbol } from "@/lib/sniper/confluence"
import { hasOhlc } from "@/lib/sniper/structure"
import type { ConfluenceRow, OhlcBar } from "@/lib/sniper/types"
import type {
  FlagshipMode,
  FlagshipResponse,
  FlagshipSystemGate,
  FunnelStageResult,
  NearMissSignal,
  RankedSignal,
  RankedSignal as RS,
  SignalTier,
  VetoStage,
} from "./types"

// ---------- เกณฑ์ลงทะเบียนล่วงหน้า ----------
const WEIGHTS = { engine: 35, confluence: 25, trend: 15, evidence: 15, risk: 10 } as const
const GATE = {
  minPrice: 1, // ฿ — หุ้นแพง (penny) ออก
  minAvgVal: 1e6, // มูลค่าซื้อขายเฉลี่ย 20 วัน (เกณฑ์เดียวกับ SET Sniper)
  minHistory: 60, // จำนวนวันที่มีข้อมูลขั้นต่ำ
  minEnginePct: 0.5, // โมเมนตัมต้องอยู่ครึ่งบนของตลาด
  blockMfd: 0.45, // เกณฑ์เดียวกับ GATES.blockMfd ของ Signals Engine
  blockSectorBottom: 2, // เกณฑ์เดียวกับ GATES.blockSectorBottom
  minConfluence: 45, // verdict "medium" ของ Confluence Checklist
  nearMissConfluence: 30, // โซน "ใกล้เข้าโผ"
  tierA: 70,
  tierB: 55,
  topN: 10,
  vetoExamples: 6,
} as const

const HONESTY_NOTICE =
  "ไม่มีสัญญาณใดในตลาดการันตีกำไรได้ 100% — โมดูลนี้จัดอันดับ \"ความน่าเชื่อถือ\" จากการคัดกรองหลายเอนจินด้วยเกณฑ์ที่ลงทะเบียนไว้ล่วงหน้า เพื่อเพิ่มความน่าจะเป็นฝั่งผู้ลงทุน ไม่ใช่การรับประกันผลกำไร และไม่ใช่คำแนะนำการลงทุน"

interface Candidate {
  symbol: string
  sector: string
  close: number
  mfd: number
  symVolPct: number
  sectorRank: number
  enginePct: number
  scoreEngine: number
}

let _cache: { key: string; res: FlagshipResponse } | null = null

const sma = (xs: number[], w: number, at: number): number => {
  if (at + 1 < w) return NaN
  let s = 0
  for (let i = at - w + 1; i <= at; i++) s += xs[i]
  return s / w
}
const r1 = (x: number): number => Math.round(x * 10) / 10
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x))

/**
 * ที่มาข้อมูล (provenance) จาก EventLog — pure เพื่อทดสอบได้
 * - seed = ล้างทุกอย่างแล้วสร้างข้อมูลจำลองใหม่ทั้งชุด
 * - ingest = เพิ่มข้อมูลจริง: CSV (payload.kind snapshot|history) หรือ feed (payload.kind "feed", source)
 *   feed ที่ replacedDemo = true ล้างข้อมูลตลาดเดิมทั้งหมดก่อนนำเข้า
 * ingest หลัง seed โดยไม่มีการล้าง demo = ข้อมูลจริงปนหุ้นจำลอง → ห้ามติดป้าย REAL
 * isSynthetic = true หมายถึง "ยังยืนยันไม่ได้ว่าเป็นข้อมูลจริงล้วน" (ป้ายสีเตือน)
 */
export function classifyProvenance(
  events: { id: number; kind: string; payload: string }[],
  rawRows: number,
): { isSynthetic: boolean; dataLabel: string } {
  if (rawRows === 0) return { isSynthetic: true, dataLabel: "NO DATA — ยังไม่มีข้อมูลตลาด" }
  const sorted = [...events].sort((a, b) => a.id - b.id)
  let lastSeed = -1
  for (const e of sorted) if (e.kind === "seed") lastSeed = e.id
  const ingests = sorted
    .filter((e) => e.kind === "ingest" && e.id > lastSeed)
    .map((e) => {
      try {
        const p = JSON.parse(e.payload) as unknown
        return p && typeof p === "object" ? (p as { kind?: unknown; source?: unknown; replacedDemo?: unknown }) : {}
      } catch {
        return {}
      }
    })
  if (ingests.length === 0) {
    return lastSeed >= 0
      ? { isSynthetic: true, dataLabel: "SYNTHETIC (demo seed)" }
      : { isSynthetic: true, dataLabel: "UNKNOWN — ไม่พบบันทึก seed/ingest" }
  }
  const latest = ingests[ingests.length - 1]
  const src =
    latest.kind === "feed"
      ? `feed: ${typeof latest.source === "string" && latest.source ? latest.source : "?"}`
      : latest.kind === "snapshot" || latest.kind === "history"
        ? "CSV ingest"
        : "ingest"
  if (lastSeed >= 0 && !ingests.some((p) => p.replacedDemo === true)) {
    return { isSynthetic: true, dataLabel: `MIXED — demo seed + ${src} (ยังมีหุ้นจำลองปน)` }
  }
  return { isSynthetic: false, dataLabel: `REAL (${src})` }
}

export async function runFlagshipFunnel(): Promise<FlagshipResponse> {
  const t0 = Date.now()
  const policy = await readSignalsPolicy()
  // sniperKey = dataKey + Trade/Position/CrossAsset/GTAA — สายพานใช้ breaker/GTAA/rotation ของ Sniper
  // (key เดิมมีแค่ dataKey → Jev ปิดไม้ขาดทุนแล้ว breaker/โหมดยังค้างค่าเก่า)
  const key = `${await sniperKey()}|${policy?.updatedAt ?? ""}`
  if (_cache?.key === key) return _cache.res

  const [panel, sniper, regime, dq] = await Promise.all([
    getPanelCached(),
    runSniperReport(),
    computeRegimeState().catch(() => null),
    runDataQualityChecks().catch(() => ({ flags: [] as string[], checks: [] })),
  ])
  const { rows } = await loadAll()
  const notes: string[] = []

  // ---------- ข้อมูลดิบต่อหุ้น (close/val เรียงตามวัน) ----------
  const closesBySym = new Map<string, number[]>()
  const valsBySym = new Map<string, number[]>()
  for (const r of rows) {
    let c = closesBySym.get(r.symbol)
    if (!c) closesBySym.set(r.symbol, (c = []))
    c.push(r.close)
    let v = valsBySym.get(r.symbol)
    if (!v) valsBySym.set(r.symbol, (v = []))
    v.push(r.val)
  }

  // ---------- ที่มาข้อมูล (provenance): seed ล่าสุด vs ingest ล่าสุด ----------
  let isSynthetic = true
  let dataLabel = "SYNTHETIC (demo seed)"
  try {
    const events = await db.eventLog.findMany({
      where: { kind: { in: ["seed", "ingest"] } },
      select: { id: true, kind: true, payload: true },
      orderBy: { id: "asc" },
    })
    const prov = classifyProvenance(events, rows.length)
    isSynthetic = prov.isSynthetic
    dataLabel = prov.dataLabel
  } catch {
    notes.push("อ่านที่มาข้อมูล (provenance) ไม่ได้ — แสดงป้ายระวังแทน")
    isSynthetic = true
    dataLabel = "UNKNOWN — ตรวจที่มาข้อมูลไม่ได้"
  }

  // ---------- Universe ของวันล่าสุด (โผ snapshot + คะแนนเอนจินโมเมนตัม) ----------
  const latestDate = panel.dates[panel.dates.length - 1] ?? sniper.meta.latestDate
  const todays = latestDate ? panel.byDateStock.get(latestDate) ?? [] : []
  const universeCount = todays.length
  const nSectors = Math.max(1, panel.sectors.length)

  // enginePct — percentile คะแนนเอนจินของวันนี้ (รายการเรียง score มาแล้ว)
  const enginePctOf = new Map<string, number>()
  todays.forEach((s, i) => enginePctOf.set(s.symbol, clamp01((todays.length - i) / todays.length)))

  // ---------- G1 — Data & Liquidity ----------
  const vetoG1: { symbol: string; reason: string }[] = []
  const passG1: Candidate[] = []
  for (const s of todays) {
    const closes = closesBySym.get(s.symbol) ?? []
    const vals = valsBySym.get(s.symbol) ?? []
    if (closes.length < GATE.minHistory) {
      vetoG1.push({ symbol: s.symbol, reason: `ประวัติสั้น (${closes.length} วัน < ${GATE.minHistory})` })
      continue
    }
    const price = closes[closes.length - 1]
    if (!(price >= GATE.minPrice)) {
      vetoG1.push({ symbol: s.symbol, reason: `ราคาต่ำกว่า ${GATE.minPrice.toFixed(2)} ฿ (หุ้นแพง)` })
      continue
    }
    const win = vals.slice(-20)
    const avgVal = win.reduce((a, b) => a + b, 0) / (win.length || 1)
    if (!(avgVal >= GATE.minAvgVal)) {
      vetoG1.push({
        symbol: s.symbol,
        reason: `สภาพคล่องต่ำ (มูลค่าเฉลี่ย 20 วัน ${(avgVal / 1e6).toFixed(1)} ล้าน < เกณฑ์)`,
      })
      continue
    }
    passG1.push({
      symbol: s.symbol,
      sector: s.sector,
      close: price,
      mfd: s.mfd,
      symVolPct: s.symVolPct,
      sectorRank: s.sectorRank,
      enginePct: enginePctOf.get(s.symbol) ?? 0,
      scoreEngine: s.score,
    })
  }

  // ---------- G2 — Momentum ----------
  const vetoG2: { symbol: string; reason: string }[] = []
  const passG2: Candidate[] = []
  for (const c of passG1) {
    if (c.mfd >= GATE.blockMfd) {
      vetoG2.push({ symbol: c.symbol, reason: `แรงขายกระจาย (MFD ${c.mfd.toFixed(2)} ≥ ${GATE.blockMfd})` })
      continue
    }
    if (c.enginePct < GATE.minEnginePct) {
      vetoG2.push({
        symbol: c.symbol,
        reason: `โมเมนตัมครึ่งล่างของตลาด (percentile ${(c.enginePct * 100).toFixed(0)}%)`,
      })
      continue
    }
    passG2.push(c)
  }

  // ---------- G3 — Sector ----------
  const vetoG3: { symbol: string; reason: string }[] = []
  const passG3: Candidate[] = []
  const sectorCut = nSectors - GATE.blockSectorBottom
  for (const c of passG2) {
    if (c.sectorRank > sectorCut) {
      vetoG3.push({
        symbol: c.symbol,
        // ข้อมูลมีกลุ่มไม่เกินจำนวนที่ตัด = เกณฑ์คัดออกทุกกลุ่ม (รวมอันดับ 1) — บอกตรง ๆ แทน "อยู่ท้ายตาราง (อันดับ 1/1)"
        reason:
          nSectors <= GATE.blockSectorBottom
            ? `ข้อมูลมีเพียง ${nSectors} กลุ่ม — เกณฑ์ตัด ${GATE.blockSectorBottom} กลุ่มท้ายคัดออกทุกกลุ่ม (กลุ่ม ${c.sector} อันดับ ${c.sectorRank}/${nSectors})`
            : `กลุ่ม ${c.sector} อยู่ท้ายตาราง (อันดับ ${c.sectorRank}/${nSectors} — ${GATE.blockSectorBottom} กลุ่มสุดท้ายออก)`,
      })
      continue
    }
    passG3.push(c)
  }

  // ---------- G4 — Confluence (SET Sniper 3 ชั้น) ----------
  // ตรวจ "ทุกตัวที่ผ่าน G3" จากข้อมูล OHLC ในฐานข้อมูลโดยตรง (ไม่จำกัดแค่
  // watchlist 24 ตัวของโมดูล Sniper — สายพานนี้ต้องคัดกรองเต็มรูปทุกตัว)
  const vetoG4: { symbol: string; reason: string }[] = []
  const passG4: Candidate[] = []
  const watchPool: { c: Candidate; cf: ConfluenceRow }[] = [] // ใกล้เข้าโผ (confluence 30–44)
  const barsBySym = new Map<string, OhlcBar[]>()
  if (passG3.length > 0) {
    const raw = await db.rawDaily.findMany({
      where: { symbol: { in: passG3.map((c) => c.symbol) } },
      select: { date: true, symbol: true, close: true, open: true, high: true, low: true, val: true },
      orderBy: [{ date: "asc" }, { symbol: "asc" }],
    })
    for (const r of raw) {
      const arr = barsBySym.get(r.symbol) ?? []
      arr.push({ date: r.date, close: r.close, open: r.open ?? 0, high: r.high ?? 0, low: r.low ?? 0, val: r.val })
      barsBySym.set(r.symbol, arr)
    }
  }
  const confluenceOf = new Map<string, ConfluenceRow>()
  for (const c of passG3) {
    const bars = (barsBySym.get(c.symbol) ?? []).slice(-260)
    if (bars.length < 30) {
      vetoG4.push({ symbol: c.symbol, reason: `แท่งราคาไม่พอตรวจโครงสร้าง (${bars.length} แท่ง < 30)` })
      continue
    }
    const cf = evaluateSymbol({
      symbol: c.symbol,
      sector: c.sector,
      bars,
      hasOhlc: hasOhlc(bars),
    })
    confluenceOf.set(c.symbol, cf)
    if (cf.location === null) {
      vetoG4.push({ symbol: c.symbol, reason: "ไม่มีข้อมูล OHLC — ชั้น Location/Value ปิด (ตรวจไม่ครบ)" })
      continue
    }
    if (cf.total < GATE.minConfluence) {
      vetoG4.push({ symbol: c.symbol, reason: `Confluence ${cf.total}/100 ต่ำกว่าเกณฑ์ ${GATE.minConfluence}` })
      if (cf.total >= GATE.nearMissConfluence) watchPool.push({ c, cf })
      continue
    }
    passG4.push(c)
  }

  // ---------- ระบบประตูใหญ่ 3 ประตู (ระดับระบบ ไม่ใช่ระดับหุ้น) ----------
  const regimeAction = regime?.action ?? "neutral"
  const gtaa = sniper.briefing.gtaa
  // ข้อมูล GTAA ที่เลยรอบรีบาลานซ์ หรือเป็นชุดสังเคราะห์ ห้ามใช้ "เปิด" ประตู (gtaa-faber.md §8.4) → ถือเป็น caution
  const gtaaUnusable = gtaa ? (gtaa.staleMonths ?? 0) > 0 || /synthetic/i.test(gtaa.source) : false
  const gtaaStance = gtaa ? (gtaaUnusable ? "caution" : gtaa.stance) : "neutral"
  const breaker = sniper.breaker
  const dqFlags = dq.flags.length

  let mode: FlagshipMode
  if (breaker.level >= 2 || regimeAction === "risk_off") mode = "defense"
  else if (breaker.level === 1 || regimeAction === "neutral" || gtaaStance !== "risk_on") mode = "selective"
  else mode = "attack"
  if (mode === "attack" && dqFlags > 0) {
    mode = "selective"
    notes.push(`Data Quality มี ${dqFlags} ข้อ — ลดโหมดจากบุกเป็นคัดเลือกอัตโนมัติ`)
  }
  const modeWhy =
    mode === "attack"
      ? "Regime risk_on + GTAA risk_on + Circuit Breaker 0 — ทุกประตูใหญ่เปิดทาง"
      : mode === "selective"
        ? "ประตูใหญ่อย่างน้อยหนึ่งประตูเตือน (regime/GTAA/breaker ระดับ 1) — เล่นเฉพาะตัวคัดแล้ว"
        : "ประตูใหญ่ปิด (Breaker ≥ 2 หรือ Regime risk_off) — ระบบลด Tier A ทั้งหมด โฟกัสเฝ้าดู"
  if (mode === "defense") notes.push("โหมดป้องกัน: ทุกสัญญาณถูกจำกัดสูงสุด Tier B — ไม่มี Tier A ในโหมดนี้")

  const systemGates: FlagshipSystemGate[] = [
    {
      id: "regime",
      name: "Regime (ตลาดไทย)",
      status: regimeAction === "risk_on" ? "open" : regimeAction === "neutral" ? "caution" : "closed",
      detail: regime
        ? `${regime.action} · conf ${regime.conf} · mktMom20 ${(regime.mktMom20 * 100).toFixed(1)}%`
        : "ไม่พร้อม — snapshot ไม่พอ",
    },
    {
      id: "gtaa",
      name: "GTAA (ตลาดโลก)",
      status: gtaaStance === "risk_on" ? "open" : gtaaStance === "caution" ? "caution" : "closed",
      detail: gtaa
        ? `${gtaa.stance} · เงินสด ${(gtaa.cashPct * 100).toFixed(0)}% · ข้อมูลถึง ${gtaa.asOfMonth}` +
          (gtaaUnusable
            ? (gtaa.staleMonths ?? 0) > 0
              ? ` · เลยรอบรีบาลานซ์ ${gtaa.staleMonths} รอบ — ยังไม่ใช้เปิดประตูจนกว่าจะดึงข้อมูลใหม่`
              : " · ข้อมูลสังเคราะห์ — ไม่ใช้เปิดประตู"
            : "")
        : "ไม่พร้อม — panel GTAA ไม่มี",
    },
    {
      id: "breaker",
      name: "Circuit Breaker",
      status: breaker.level === 0 ? "open" : breaker.level === 1 ? "caution" : "closed",
      detail: `ระดับ ${breaker.level} — ${breaker.label}${breaker.reasons.length ? ` · ${breaker.reasons[0]}` : ""}`,
    },
  ]

  // ---------- ให้คะแนน + จัดอันดับ ----------
  const rotationLead = new Set(sniper.rotation.filter((r) => r.leader).map((r) => r.sector))

  const scoreRow = (c: Candidate, cf: ConfluenceRow): Omit<RS, "rank" | "passedAllGates" | "gateNote"> => {
    const closes = (barsBySym.get(c.symbol) ?? []).map((b) => b.close)
    const T = closes.length
    const ma20 = sma(closes, 20, T - 1)
    const ma50 = sma(closes, 50, T - 1)
    const ma60 = sma(closes, 60, T - 1)
    const ret20 = T >= 21 && closes[T - 21] > 0 ? c.close / closes[T - 21] - 1 : NaN
    const above20 = isFinite(ma20) && c.close > ma20
    const above50 = isFinite(ma50) && c.close > ma50
    const above60 = isFinite(ma60) && c.close > ma60
    const ret20Ok = isFinite(ret20) && ret20 > 0
    const trendPassed = [above20, above50, above60, ret20Ok].filter(Boolean).length

    // evidence 15 — accumulation (5) + leadership (5) + footprint (5)
    const evidenceDetail: string[] = []
    let evidence = 0
    if (c.mfd <= -0.1) {
      evidence += 5
      evidenceDetail.push(`เงินไหลเข้าสะสมชัด (MFD ${c.mfd.toFixed(2)}) +5`)
    } else if (c.mfd <= 0) {
      evidence += 2.5
      evidenceDetail.push(`ฝั่งสะสมเล็กน้อย (MFD ${c.mfd.toFixed(2)}) +2.5`)
    } else {
      evidenceDetail.push(`ยังไม่เห็นการสะสม (MFD ${c.mfd.toFixed(2)}) +0`)
    }
    const leader = rotationLead.has(c.sector)
    if (leader) {
      evidence += 5
      evidenceDetail.push(`ผู้นำกลุ่ม ${c.sector} +5`)
    } else if (c.sectorRank <= 3) {
      evidence += 2.5
      evidenceDetail.push(`กลุ่มแนวหน้า (อันดับ ${c.sectorRank}/${nSectors}) +2.5`)
    } else {
      evidenceDetail.push(`กลุ่มอันดับ ${c.sectorRank}/${nSectors} +0`)
    }
    const sweep = cf.sweep && cf.sweep.side === "bullish" && cf.sweep.barsAgo <= 8 ? cf.sweep : null
    if (sweep) {
      evidence += 5
      evidenceDetail.push(`Bullish sweep ${sweep.barsAgo === 0 ? "แท่งล่าสุด" : `${sweep.barsAgo} แท่งก่อน`} +5`)
    } else if (cf.fvgs.some((f) => f.kind === "bullish")) {
      evidence += 2.5
      evidenceDetail.push("มี Bullish FVG ยังไม่ถูก mitigate +2.5")
    } else {
      evidenceDetail.push("ไม่มีร่องรอย sweep/FVG สด +0")
    }

    const breakdown = {
      engine: r1(WEIGHTS.engine * c.enginePct),
      confluence: r1(WEIGHTS.confluence * (cf.total / 100)),
      trend: r1(WEIGHTS.trend * (trendPassed / 4)),
      evidence: r1(evidence),
      risk: r1(WEIGHTS.risk * (1 - clamp01(c.symVolPct))),
    }
    const score = r1(breakdown.engine + breakdown.confluence + breakdown.trend + breakdown.evidence + breakdown.risk)

    // เหตุผล "เอนจินไหนเห็นพ้อง"
    const agrees: string[] = []
    const pctTxt = (c.enginePct * 100).toFixed(0)
    if (c.enginePct >= 0.9) agrees.push(`โมเมนตัม Top 10% ของตลาด (${pctTxt})`)
    else if (c.enginePct >= 0.8) agrees.push(`โมเมนตัม Top 20% ของตลาด (${pctTxt})`)
    else agrees.push(`โมเมนตัมครึ่งบนของตลาด (${pctTxt}%)`)
    if (c.mfd <= -0.1) agrees.push("เงินไหลเข้า (accumulation)")
    if (leader) agrees.push(`ผู้นำกลุ่ม ${c.sector}`)
    if (cf.verdict === "high") agrees.push(`Confluence ครบ 3 ชั้น (${cf.total}/100)`)
    else if (cf.verdict === "medium") agrees.push(`Confluence ผ่านเกณฑ์ (${cf.total}/100)`)
    else agrees.push(`Confluence ยังไม่ผ่านเกณฑ์ (${cf.total}/100)`)
    if (sweep) agrees.push(`Bullish sweep ${sweep.barsAgo} แท่งก่อน`)

    return {
      symbol: c.symbol,
      sector: c.sector,
      close: c.close,
      score,
      tier: "C",
      enginePct: c.enginePct,
      confluence: {
        total: cf.total,
        verdict: cf.verdict,
        location: cf.location?.score ?? null,
        value: cf.value?.score ?? null,
        behavior: cf.behavior.score,
        locationReasons: cf.location?.reasons ?? [],
        valueReasons: cf.value?.reasons ?? [],
        behaviorReasons: cf.behavior.reasons,
      },
      trend: {
        above20,
        above50,
        above60,
        ret20: isFinite(ret20) ? ret20 : null,
        passed: trendPassed,
      },
      mfd: c.mfd,
      symVolPct: c.symVolPct,
      sectorRank: c.sectorRank,
      sectorLeader: leader,
      sweep: cf.sweep ? { side: cf.sweep.side, barsAgo: cf.sweep.barsAgo } : null,
      agrees,
      breakdown,
      evidenceDetail,
    }
  }

  // ผู้ผ่านครบทุกด่าน (G1–G4) — ตัวตั้งต้นของอันดับ 1–10
  const passedRows = passG4.map((c) => {
    const row = scoreRow(c, confluenceOf.get(c.symbol)!)
    const tier: SignalTier =
      row.score >= GATE.tierA && row.confluence.verdict !== "low"
        ? "A"
        : row.score >= GATE.tierB
          ? "B"
          : "C"
    if (tier === "A") row.agrees.push("ผ่านทุกด่านคัดกรอง + คะแนนรวมสูง")
    return { ...row, tier: mode === "defense" && tier === "A" ? ("B" as SignalTier) : tier, passedAllGates: true, gateNote: null }
  })

  // กองเฝ้าดู — ผ่าน G1–G3 แต่ยังไม่ผ่าน Confluence (confluence 30–44) เติมอันดับถัดไปแบบติดป้ายชัด
  // เกณฑ์ (pre-registered): คะแนนกองเฝ้าดู = คะแนนดิบ × (confluence/45) และจำกัดเพดานที่ 54.9 —
  // เพราะ Tier B (55 ขึ้นไป) สงวนไว้เฉพาะ "ผู้ผ่านครบทุกด่าน" ด่านที่ยังไม่ผ่านต้องฉุดคะแนนจริง
  const watchRows = watchPool.map(({ c, cf }) => {
    const row = scoreRow(c, cf)
    const discounted = r1(Math.min(row.score * Math.min(1, cf.total / GATE.minConfluence), GATE.tierB - 0.1))
    return {
      ...row,
      score: discounted,
      passedAllGates: false,
      gateNote: `Confluence ${cf.total}/100 ต่ำกว่าเกณฑ์ ${GATE.minConfluence} — เฝ้าดู ยังไม่ใช่สัญญาณที่ผ่านครบ (คะแนนจำกัดเพดานต่ำกว่า Tier B เพราะยังไม่ผ่านครบ)`,
    }
  })

  passedRows.sort((a, b) => b.score - a.score || b.enginePct - a.enginePct)
  watchRows.sort((a, b) => b.score - a.score || b.enginePct - a.enginePct)
  // ผู้ผ่านครบต้องอยู่เหนือกองเฝ้าดูเสมอ — อันดับจึงหมายถึง "ผ่านครบก่อน แล้วค่อยดูคะแนน"
  const combined = [...passedRows, ...watchRows]
  const ranked: RankedSignal[] = combined.slice(0, GATE.topN).map((r, i) => ({ ...r, rank: i + 1 }))

  const nearMiss: NearMissSignal[] = combined
    .slice(GATE.topN)
    .slice(0, 6)
    .map((r) => ({
      symbol: r.symbol,
      sector: r.sector,
      close: r.close,
      enginePct: r.enginePct,
      confluenceTotal: r.confluence.total,
      score: r.score,
      reason: r.gateNote ?? "ผ่านครบแต่อยู่นอก 10 อันดับ",
    }))

  // ---------- บันทึกการคัดออก (veto log — ทุกการตัดต้องมีเหตุผล) ----------
  const mkStage = (
    id: string,
    name: string,
    desc: string,
    inCount: number,
    out: unknown[],
    veto: { symbol: string; reason: string }[],
  ): FunnelStageResult => ({
    id,
    name,
    desc,
    inCount,
    outCount: out.length,
    vetoed: veto.length,
  })

  const gates: FunnelStageResult[] = [
    mkStage("G0", "Universe (โผวันนี้)", "หุ้นที่ติดโผ snapshot ของวันล่าสุด", universeCount, todays, []),
    mkStage("G1", "Data & Liquidity", "ราคา ≥ 1฿ · มูลค่าเฉลี่ย 20 วัน ≥ 1 ล้าน · ประวัติ ≥ 60 วัน", todays.length, passG1, vetoG1),
    mkStage("G2", "Momentum", "ครึ่งบนของตลาด · ไม่แรงขายกระจาย (MFD < 0.45)", passG1.length, passG2, vetoG2),
    mkStage("G3", "Sector", "กลุ่มไม่อยู่ 2 อันดับท้าย", passG2.length, passG3, vetoG3),
    mkStage("G4", "Confluence", "ตรวจ 3 ชั้น SET Sniper ทุกตัวจากข้อมูล OHLC (Location×Value×Behavior ≥ 45)", passG3.length, passG4, vetoG4),
    mkStage("G5", "Rank 1–10", "จัดอันดับด้วย ReliabilityScore — ผู้ผ่านครบก่อน แล้วเติมด้วยกองเฝ้าดู", passedRows.length + watchRows.length, ranked, []),
  ]

  const vetoStages: VetoStage[] = [
    { stage: "G1", name: "Data & Liquidity", count: vetoG1.length, examples: vetoG1.slice(0, GATE.vetoExamples) },
    { stage: "G2", name: "Momentum", count: vetoG2.length, examples: vetoG2.slice(0, GATE.vetoExamples) },
    { stage: "G3", name: "Sector", count: vetoG3.length, examples: vetoG3.slice(0, GATE.vetoExamples) },
    { stage: "G4", name: "Confluence", count: vetoG4.length, examples: vetoG4.slice(0, GATE.vetoExamples) },
  ]

  // ---------- หมายเหตุความจริงใจ ----------
  notes.push(
    "ชั้น Confluence ตรวจทุกตัวที่ผ่านด่านโมเมนตัม+กลุ่ม จากข้อมูล OHLC ในฐานข้อมูลโดยตรง (ไม่จำกัด watchlist ของโมดูล Sniper) — ตัวที่ไม่มี OHLC ครบถูกปิดชั้นพร้อมเหตุผล",
  )
  notes.push(
    "อันดับเรียง \"ผู้ผ่านครบทุกด่าน\" (Tier A/B) ขึ้นก่อนเสมอ แล้วเติมช่องที่เหลือด้วยกองเฝ้าดู (Tier C — ยังไม่ผ่าน Confluence ติดป้ายชัดทุกแถว)",
  )
  if (policy) {
    notes.push(
      policy.v2
        ? `IC Harness: ชั้น alpha เปิด (${policy.promoted.length} สัญญาณผ่านเกณฑ์ promote) — คะแนนเอนจินใช้น้ำหนักเต็ม`
        : "IC Harness: ชั้น alpha ยังไม่เปิด (ไม่มีสัญญาณผ่าน promote) — คะแนนเอนจินพึ่ง risk filter เป็นหลัก",
    )
  } else {
    notes.push("IC Harness: ยังไม่มี policy ที่ประเมิน — รัน /api/signals/ic เพื่อสอบสัญญาณก่อน")
  }
  notes.push("อันดับ 1–10 ไม่ใช่คำสั่งซื้อ — ต้องผ่าน Human Gate (default-deny) ก่อนเสมอ")

  const res: FlagshipResponse = {
    meta: {
      latestDate,
      generatedAt: new Date().toISOString(),
      runtimeMs: Date.now() - t0,
      mode,
      modeWhy,
      dataLabel,
      isSynthetic,
      proxyNotice: sniper.meta.proxyNotice,
      honestyNotice: HONESTY_NOTICE,
      notes,
    },
    gates,
    system: {
      regime: regime ? { action: regime.action, conf: regime.conf } : null,
      gtaa: gtaa ? { stance: gtaa.stance, cashPct: gtaa.cashPct, asOfMonth: gtaa.asOfMonth } : null,
      breaker: { level: breaker.level, label: breaker.label, reasons: breaker.reasons },
      dqFlags,
      policy: policy ? { promoted: policy.promoted, v2: policy.v2 } : null,
      systemGates,
    },
    ranked,
    nearMiss,
    vetoStages,
  }
  _cache = { key, res }
  return res
}
