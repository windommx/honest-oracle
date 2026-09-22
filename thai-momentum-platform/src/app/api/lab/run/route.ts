import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { buildPanelStates } from "@/lib/lab/panel-state"
import { generateBatch } from "@/lib/lab/synth-state"
import { ruleEngine } from "@/lib/lab/rule-engine"
import { decideBatch, CONF_MIN } from "@/lib/lab/nimble"
import { makeKey } from "@/lib/lab/keys"
import type { StatePacket } from "@/lib/lab/state"

export const dynamic = "force-dynamic"
export const maxDuration = 300

// POST /api/lab/run
// body { n?: number (default 12, cap 24), origin?: 'mix'|'synth'|'panel' (default 'mix') }
// → สร้าง state (panel จริง + synth), ให้ rule × Nimble ตัดสินคู่ แล้ว upsert ShadowLog
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { n?: unknown; origin?: unknown }
    const n = Math.min(24, Math.max(1, typeof body.n === "number" ? Math.floor(body.n) : 12))
    const origin = body.origin === "synth" || body.origin === "panel" ? body.origin : "mix"

    // ---------------- ประกอบรายการ state ----------------
    type Item = {
      packet: StatePacket
      originTag: "panel" | "synth"
      entryPx: number | null
      stopPx: number | null
    }
    const items: Item[] = []

    if (origin !== "synth") {
      // panel จริงจากวันล่าสุด — เรียง rs_pct ดีสุดก่อนแล้วตัด
      const panel = await buildPanelStates()
      const panelN = origin === "panel" ? n : Math.floor(n / 2)
      for (const s of panel.states.slice(0, Math.min(panelN, panel.states.length))) {
        items.push({ packet: s.packet, originTag: "panel", entryPx: s.entryPx, stopPx: s.stopPx })
      }
    }

    // synth เติมส่วนที่เหลือ (mix/synth) — seed จากเวลาปัจจุบัน
    const synthN = n - items.length
    if (synthN > 0) {
      const seed = Date.now() % 100000
      for (const packet of generateBatch(synthN, seed)) {
        items.push({ packet, originTag: "synth", entryPx: null, stopPx: null })
      }
    }

    // ---------------- rule × Nimble ----------------
    const ruleDecisions = items.map((it) => ruleEngine(it.packet))
    const nimble = await decideBatch(items.map((it) => it.packet))

    // ---------------- upsert ShadowLog (double-key log) ----------------
    // key = md5(date|asset) — ถ้าชนกันในรอบเดียวกันให้เขียนทับ (unique ตามดีไซน์)
    let created = 0
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      const rule = ruleDecisions[i]
      const nb = nimble[i]
      const key = makeKey(it.packet.date ?? "", it.packet.asset)
      const wouldExecute = !!rule.action && nb.action === "ENTER_LONG" && nb.confidence >= CONF_MIN
      const data = {
        date: it.packet.date ?? "",
        asset: it.packet.asset,
        origin: it.originTag,
        stateJson: JSON.stringify(it.packet),
        ruleAction: rule.action, // null = NO_TRADE
        gatesJson: JSON.stringify(rule.gates),
        nimbleAction: nb.action,
        nimbleConf: nb.confidence,
        wickRatio: it.packet.trigger.wick_ratio,
        closePos: it.packet.trigger.close_pos_in_range,
        wouldExecute,
        entryPx: it.entryPx,
        stopPx: it.stopPx,
      }
      await db.shadowLog.upsert({ where: { key }, create: { key, ...data }, update: data })
      created++
    }

    const panelN = items.filter((it) => it.originTag === "panel").length
    return NextResponse.json({
      ok: true,
      created,
      panelN,
      synthN: items.length - panelN,
    })
  } catch (e) {
    return NextResponse.json({ error: `แล็บเงารันไม่สำเร็จ: ${(e as Error).message}` }, { status: 500 })
  }
}
