import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { outcomeRIfResolved } from "@/lib/lab/outcome"
import { GATE_NAMES, type Gates } from "@/lib/lab/state"

export const dynamic = "force-dynamic"

// ------------------------------------------------------------
// GET /api/lab/dashboard — ห้องเฝ้าดูแล็บเงาทั้งหมด
// 1) outcome filler (panel logs ที่ยังไม่มีผล) → 2) สถิติ matrix/calibration/pnl
// ------------------------------------------------------------
export async function GET() {
  try {
    // ============ 1) shadow outcome filler — 3-bar trail ฉบับ close-proxy ============
    const pending = await db.shadowLog.findMany({
      where: { outcomeR: null, origin: "panel", entryPx: { not: null }, stopPx: { not: null } },
    })
    if (pending.length > 0) {
      // สร้าง close series ต่อหุ้นครั้งเดียว (cache ใน map) แล้วค่อยตัดบาร์หลังวันเข้า
      const dateCache = new Map<string, string[]>()
      const closeCache = new Map<string, number[]>()
      for (const log of pending) {
        let dates = dateCache.get(log.asset)
        let closes = closeCache.get(log.asset)
        if (!dates || !closes) {
          const rows = await db.rawDaily.findMany({
            where: { symbol: log.asset },
            orderBy: { date: "asc" },
            select: { date: true, close: true },
          })
          dates = rows.map((r) => r.date)
          closes = rows.map((r) => r.close)
          dateCache.set(log.asset, dates)
          closeCache.set(log.asset, closes)
        }
        // บาร์ที่อยู่ "หลัง" วันเข้าเท่านั้น (cap 20 บาร์ตาม horizon)
        const start = dates.findIndex((d) => d > log.date)
        if (start < 0) continue // ยังเปิดสถานะ — ยังไม่มีบาร์อนาคต ปล่อย outcomeR = null รอรอบหน้า
        const future = closes.slice(start, start + 20)
        // บันทึกเฉพาะผลที่สรุปแล้ว (โดน stop/trail หรือครบ 20 บาร์) — ไม้ที่ยังเปิดอยู่ห้ามให้คะแนนถาวร
        const r = outcomeRIfResolved(future, log.entryPx as number, log.stopPx as number, 20)
        if (r === null) continue
        await db.shadowLog.update({ where: { key: log.key }, data: { outcomeR: r } })
        log.outcomeR = r
      }
    }

    // ============ 2) ดึง log ล่าสุด 2000 แถว ============
    const logs = await db.shadowLog.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 2000,
    })

    const labelsAll = await db.edgeLabel.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    })
    const labeledKeys = new Set(labelsAll.map((l) => l.logKey))
    const logByKey = new Map(logs.map((l) => [l.key, l]))

    // helper: ruleAction null = NO_TRADE (นับเป็นแถวเดียวกับ NO_TRADE แต่เก็บ null ใน field)
    const normRule = (a: string | null): "ENTER_LONG" | "NO_TRADE" => (a === "ENTER_LONG" ? "ENTER_LONG" : "NO_TRADE")
    const rowOf = (a: string | null): 0 | 1 => (a === "ENTER_LONG" ? 0 : 1)

    // ---- matrix [rule][nimble] ----
    const cells: number[][] = [
      [0, 0],
      [0, 0],
    ]
    for (const l of logs) cells[rowOf(l.ruleAction)][rowOf(l.nimbleAction)]++

    // ---- disagreements (rule ≠ Nimble) ล่าสุด 20 ----
    const disagreements = logs
      .filter((l) => normRule(l.ruleAction) !== normRule(l.nimbleAction))
      .slice(0, 20)
      .map((l) => ({
        key: l.key,
        date: l.date,
        asset: l.asset,
        rule: l.ruleAction, // คง null ตามจริง
        nimble: l.nimbleAction,
        conf: l.nimbleConf,
      }))

    // ---- calibration (bins 0.0–1.0 step .1) + brier — เฉพาะแถวที่มี outcomeR ----
    const BINS = 10
    const binAcc = Array.from({ length: BINS }, () => ({ n: 0, sumConf: 0, wins: 0 }))
    let brierSum = 0
    let brierN = 0
    for (const l of logs) {
      if (l.outcomeR == null) continue
      const y = l.outcomeR > 0 ? 1 : 0
      const bin = Math.min(BINS - 1, Math.max(0, Math.floor(l.nimbleConf * BINS)))
      binAcc[bin].n++
      binAcc[bin].sumConf += l.nimbleConf
      binAcc[bin].wins += y
      brierSum += (l.nimbleConf - y) * (l.nimbleConf - y)
      brierN++
    }
    const calibration = binAcc
      .map((b, i) => ({
        bin: `${(i / 10).toFixed(1)}-${((i + 1) / 10).toFixed(1)}`,
        pred: b.n > 0 ? b.sumConf / b.n : 0,
        real: b.n > 0 ? b.wins / b.n : 0,
        n: b.n,
      }))
      .filter((b) => b.n > 0)
    const brier = brierN > 0 ? brierSum / brierN : null

    // ---- pnl: เฉพาะ wouldExecute + มี outcomeR เรียงตามวัน + cumR ----
    const executed = logs
      .filter((l) => l.wouldExecute && l.outcomeR != null)
      .sort((a, b) => (a.date === b.date ? a.id - b.id : a.date < b.date ? -1 : 1))
    let cum = 0
    const pnl = executed.map((l) => {
      cum += l.outcomeR as number
      return { key: l.key, date: l.date, asset: l.asset, r: l.outcomeR as number, cumR: Math.round(cum * 1000) / 1000 }
    })
    const executedN = pnl.length
    const expectancy = executedN > 0 ? cum / executedN : null

    // ---- gateKill: แต่ละ gate ตัดสถานะไปกี่ครั้ง (gate == 0) ----
    const gateKill = GATE_NAMES.map((gate) => {
      let kills = 0
      for (const l of logs) {
        try {
          const g = JSON.parse(l.gatesJson || "{}") as Partial<Gates>
          if (g[gate] === 0) kills++
        } catch {
          // gatesJson เสีย — ข้ามแถวนี้
        }
      }
      return { gate, kills }
    })

    // ---- edgeQueue: ตัวที่มนุษย์ต้องดู = rule≠Nimble หรือ wouldExecute (ตัดที่ label แล้ว) cap 30 ----
    const edgeQueue = logs
      .filter(
        (l) =>
          !labeledKeys.has(l.key) &&
          (normRule(l.ruleAction) !== normRule(l.nimbleAction) || l.wouldExecute)
      )
      .slice(0, 30)
      .map((l) => ({
        key: l.key,
        date: l.date,
        asset: l.asset,
        rule: l.ruleAction,
        nimble: l.nimbleAction,
        conf: l.nimbleConf,
        wickRatio: l.wickRatio,
        closePos: l.closePos,
      }))

    // ---- labels ล่าสุด 50 ----
    const labels = labelsAll.slice(0, 50).map((l) => ({
      key: l.logKey,
      date: l.date,
      asset: l.asset,
      label: l.label,
      reason: l.reason,
      gut: l.gut,
      confLabel: l.confLabel,
      createdAt: l.createdAt.toISOString(),
    }))

    // ---- weekly: พิธี label เทียบกับ rule/nimble (rule null = NO_TRADE) ----
    let weeklyN = 0
    let gutDen = 0
    let gutDiff = 0
    let labelRuleDiff = 0
    let labelNimbleDiff = 0
    for (const l of labelsAll) {
      const log = logByKey.get(l.logKey)
      if (!log) continue
      weeklyN++
      const ruleStr = normRule(log.ruleAction)
      const gutStr = l.gut === "ENTER" ? "ENTER_LONG" : l.gut === "NO_TRADE" ? "NO_TRADE" : ""
      if (gutStr !== "") {
        gutDen++
        if (gutStr !== ruleStr) gutDiff++
      }
      if (l.label !== ruleStr) labelRuleDiff++
      if (l.label !== log.nimbleAction) labelNimbleDiff++
    }
    const pct = (num: number, den: number): number | null =>
      den > 0 ? Math.round((num / den) * 1000) / 10 : null
    const weekly = {
      n: weeklyN,
      gutN: gutDen, // ตัวหารของ gutRulePct (เฉพาะ label ที่ตอบ gut)
      gutRulePct: pct(gutDiff, gutDen),
      labelRulePct: pct(labelRuleDiff, weeklyN),
      labelNimblePct: pct(labelNimbleDiff, weeklyN),
    }

    // ---- stats ----
    let agreeCount = 0
    let wouldExecuteN = 0
    for (const l of logs) {
      if (normRule(l.ruleAction) === l.nimbleAction) agreeCount++
      if (l.wouldExecute) wouldExecuteN++
    }
    const stats = {
      total: logs.length,
      wouldExecute: wouldExecuteN,
      agreementRate: logs.length > 0 ? agreeCount / logs.length : null,
    }

    return NextResponse.json({
      matrix: { rows: ["ENTER_LONG", "NO_TRADE"], cols: ["ENTER_LONG", "NO_TRADE"], cells },
      disagreements,
      calibration,
      brier,
      brierN, // จำนวนแถวที่มี outcome (เกณฑ์ G3 ของ eval ต้อง ≥10 ถึงจะนับ)
      pnl,
      expectancy,
      executedN,
      gateKill,
      edgeQueue,
      labels,
      weekly,
      stats,
    })
  } catch (e) {
    return NextResponse.json({ error: `โหลดแดชบอร์ดแล็บเงาไม่สำเร็จ: ${(e as Error).message}` }, { status: 500 })
  }
}
