import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { buildPanelStates } from "@/lib/lab/panel-state"
import { generateBatch } from "@/lib/lab/synth-state"
import { ruleEngine } from "@/lib/lab/rule-engine"
import { decideBatch, CONF_MIN } from "@/lib/lab/nimble"
import { makeKey, makeSynthKey } from "@/lib/lab/keys"
import type { StatePacket } from "@/lib/lab/state"

export const dynamic = "force-dynamic"
export const maxDuration = 300

// POST /api/lab/run
// body { n?: number (default 12, cap 24), origin?: 'mix'|'synth'|'panel' (default 'mix') }
// → สร้าง state (panel จริง + synth), ให้ rule × Nimble ตัดสินคู่ แล้ว upsert ShadowLog
// Nimble ตอบไม่ได้/ตอบเพี้ยน → ไม่บันทึกแถวนั้น (ห้ามปลอมเป็น NO_TRADE) และแจ้งจำนวนที่พลาดตรง ๆ
export async function POST(req: Request) {
  try {
    const raw: unknown = await req.json().catch(() => null)
    const body = (raw !== null && typeof raw === "object" ? raw : {}) as { n?: unknown; origin?: unknown }
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
      if (origin === "panel" && items.length === 0) {
        return NextResponse.json(
          {
            error:
              "ยังไม่มี state จากแผงจริง — ต้องมี RawDaily ของหุ้นสภาพคล่อง (liq5=1, ราคา > 1.5) อย่างน้อย 261 วันทำการ; ใช้ origin 'mix' หรือ 'synth' แทนได้",
          },
          { status: 422 }
        )
      }
    }

    // synth เติมส่วนที่เหลือ (เฉพาะ mix/synth — origin 'panel' ต้องเป็นข้อมูลจริงล้วน) — seed จากเวลาปัจจุบัน
    const synthN = origin === "panel" ? 0 : n - items.length
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
    // panel: key = md5(date|asset) — ถ้าชนกันในรอบเดียวกันให้เขียนทับ (unique ตามดีไซน์)
    // synth: key = md5(เนื้อ packet) — กันเขียนทับแถว panel จริง/แถวที่มนุษย์ label แล้วด้วย state คนละตัว
    const keyOf = (it: Item) =>
      it.originTag === "synth" ? makeSynthKey(it.packet) : makeKey(it.packet.date ?? "", it.packet.asset)
    const existing = new Set(
      (await db.shadowLog.findMany({ where: { key: { in: items.map(keyOf) } }, select: { key: true } })).map((r) => r.key)
    )
    let created = 0
    let updated = 0
    const failures: string[] = []
    let unavailable = false
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      const rule = ruleDecisions[i]
      const nb = nimble[i]
      if (nb.error) {
        // ไม่มีคำตอบจริงจาก Nimble (ติดต่อไม่ได้ / timeout / JSON เพี้ยน) → ไม่บันทึกแถวปลอม
        failures.push(nb.error)
        if (nb.unavailable) unavailable = true
        continue
      }
      const key = keyOf(it)
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
      if (existing.has(key)) updated++
      else {
        created++
        existing.add(key)
      }
    }

    const logged = created + updated
    const failed = failures.length
    const detail = failures[0] ?? ""
    if (items.length > 0 && logged === 0) {
      return NextResponse.json(
        {
          error: unavailable
            ? `Nimble (LLM) ไม่พร้อม — ไม่ได้บันทึกไม้เงาเลย (${failed}/${items.length} ล้มเหลว): ${detail}`
            : `Nimble ตอบกลับไม่เป็น JSON ที่ถูกต้อง — ไม่ได้บันทึกไม้เงาเลย (${failed}/${items.length}): ${detail}`,
          failed,
        },
        { status: unavailable ? 503 : 502 }
      )
    }

    const panelN = items.filter((it) => it.originTag === "panel").length
    const notes: string[] = []
    if (origin === "panel" && panelN < n) notes.push(`แผงจริงมีเพียง ${panelN}/${n} ตัว`)
    if (failed > 0) notes.push(`Nimble พลาด ${failed} ตัว (ไม่บันทึก): ${detail}`)
    return NextResponse.json({
      ok: true,
      created,
      updated,
      failed,
      panelN,
      synthN: items.length - panelN,
      ...(notes.length > 0
        ? { message: `บันทึก ${logged} ไม้เงา (ใหม่ ${created} · อัปเดต ${updated}) — ${notes.join(" · ")}` }
        : {}),
    })
  } catch (e) {
    return NextResponse.json({ error: `แล็บเงารันไม่สำเร็จ: ${(e as Error).message}` }, { status: 500 })
  }
}
