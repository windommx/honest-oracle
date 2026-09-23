import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { closePivot } from "@/lib/momentum/core"
import { TH_STRATEGY } from "@/lib/config/thai"
import { applySectorConstraints, getSectorMap } from "@/lib/risk/sector"
import { emitEvent } from "@/lib/research/events"
import { persistClosedTrade } from "@/lib/momentum/stops/engine"
import { currentEpochId, enqueuePendingFill, previewPendingFills, readPendingFills } from "@/lib/jev/fills"
import { T1_TAG, orderTag } from "@/lib/jev/fill-rules"
import type { GateActionResult, PendingFillOrder, PendingRow, PendingResponse } from "@/lib/momentum/contracts"

export const dynamic = "force-dynamic"

// GET /api/jev/pending → คำสั่งที่รอมนุษย์ตัดสินใจ (default-deny) + คำสั่งซื้อที่รอเติม T+1 (อ่านอย่างเดียว)
export async function GET() {
  try {
    const rows = await db.pendingGate.findMany({ where: { status: "pending" }, orderBy: { id: "asc" } })
    const pending: PendingRow[] = rows.map((r) => ({
      id: r.id,
      date: r.date,
      question: r.question,
      target: r.target,
      action: r.action,
      conf: r.conf,
      reason: r.reason,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    }))
    return NextResponse.json<PendingResponse>({ pending, fills: await previewPendingFills() })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

// POST /api/jev/pending { id, approve } → มนุษย์อนุมัติ/ปฏิเสธ
// อนุมัติ Q_ENTRY buy = ส่งคำสั่งซื้อเข้าคิว T+1 (src/lib/jev/fills.ts) เติมที่ราคาปิดของวันทำการแรกหลังข้อมูลล่าสุด
// ณ ตอนอนุมัติ — ไม่ใช่ราคาปิดที่รู้อยู่แล้ว (อนุมัติเย็นวันเดียวกัน = เติมวันถัดไป · อนุมัติหลังข้อมูลวันถัดไปเข้า = เติมวันถัดจากนั้น)
// อนุมัติ Q_EXIT exit = ปิดที่ราคาปิดล่าสุด (T+0 เหมือน exit ของ Jev) + บันทึก Trade ก่อนลบ Position
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as { id?: unknown; approve?: unknown } | null
    const rawId = body?.id
    const id =
      typeof rawId === "number" ? rawId : typeof rawId === "string" && rawId.trim() !== "" ? Number(rawId) : NaN
    // id ต้องเป็นจำนวนเต็มบวกในช่วงปลอดภัย (1e20 เคยหลุดถึง Prisma → 500 พร้อมข้อความภายใน)
    if (!body || !Number.isSafeInteger(id) || id <= 0) {
      return NextResponse.json({ error: "ต้องระบุ id เป็นตัวเลข" }, { status: 400 })
    }
    if (typeof body.approve !== "boolean") {
      return NextResponse.json({ error: "ต้องระบุ approve เป็น boolean" }, { status: 400 })
    }
    const approve = body.approve

    const row = await db.pendingGate.findUnique({ where: { id } })
    if (!row) return NextResponse.json({ error: "ไม่พบคำสั่งนี้" }, { status: 404 })
    if (row.status !== "pending") {
      return NextResponse.json({ error: "คำสั่งนี้ถูกจัดการไปแล้ว" }, { status: 400 })
    }

    let status = approve ? "approved" : "rejected"
    let message = approve ? `อนุมัติคำสั่ง ${row.target} แล้ว` : `ปฏิเสธคำสั่ง ${row.target} แล้ว`
    const decidedAt = new Date()

    // จองคำสั่งแบบ atomic ก่อนลงมือ — อนุมัติซ้ำ/อนุมัติ+ปฏิเสธพร้อมกัน (ดับเบิลคลิก/สองแท็บ)
    // เคยผ่านทั้งคู่: log human ซ้ำ และสถานะสุดท้ายขัดกับคำตอบที่ผู้ใช้ได้รับ
    const claim = await db.pendingGate.updateMany({
      where: { id: row.id, status: "pending" },
      data: { status, decidedAt },
    })
    if (claim.count === 0) {
      return NextResponse.json({ error: "คำสั่งนี้ถูกจัดการไปแล้ว" }, { status: 400 })
    }
    // คืนสถานะ pending เมื่อยังลงมือไม่ได้ (ไม่มีราคา) หรือพังกลางทาง — ให้กดใหม่ได้
    const release = () =>
      db.pendingGate.update({ where: { id: row.id }, data: { status: "pending", decidedAt: null } })

    let order: PendingFillOrder | undefined
    if (approve) {
      try {
        // วันข้อมูลล่าสุดที่รู้ ณ ตอนอนุมัติ (= afterDate ของคำสั่งซื้อ · วัน/ราคาปิดของ exit)
        const pivot = await closePivot()
        const latest = pivot.dates[pivot.dates.length - 1]
        const pi = latest ? pivot.dateIdx.get(latest) : undefined
        const si = pivot.symIdx.get(row.target)
        const lastPx = pi !== undefined && si !== undefined ? pivot.px[pi][si] : NaN

        const humanLog = (executed: boolean, reason: string) =>
          db.decision.create({
            data: {
              date: latest ?? row.date,
              question: row.question,
              target: row.target,
              action: row.action,
              conf: row.conf,
              reason,
              executed,
              source: "human",
            },
          })

        if (row.question === "Q_ENTRY" && row.action === "buy" && !latest) {
          await release()
          return NextResponse.json({ error: "ยังไม่มีข้อมูลราคาในระบบ — ส่งคำสั่งซื้อไม่ได้ คำสั่งยังรออยู่" }, { status: 409 })
        }

        if (row.question === "Q_ENTRY" && row.action === "buy") {
          const [existing, queuedOrders] = await Promise.all([
            db.position.findUnique({ where: { symbol: row.target } }),
            readPendingFills(),
          ])
          if (existing) {
            await humanLog(false, "human-reviewed (มีสถานะอยู่แล้ว)")
            message = `อนุมัติแต่ ${row.target} มีสถานะอยู่แล้ว — ไม่เพิ่มพอร์ต`
          } else if (queuedOrders.some((o) => o.symbol === row.target)) {
            await humanLog(false, `human-reviewed (มีคำสั่งรอเติม T+1 อยู่แล้ว)`)
            message = `อนุมัติแต่ ${row.target} มีคำสั่งซื้อรอเติมอยู่แล้ว — ไม่ส่งซ้ำ`
          } else {
            // ขนาดผ่าน sector layer เดียวกับรอบรัน (ชื่อ/sector/กลุ่ม/งบเต็ม) บนพอร์ตปัจจุบัน + คำสั่งที่รอเติม —
            // เดิมใช้ 1.0/0.5 ตาม conf ตรง ๆ: gate ที่ถูกลดขนาดกลับมาเต็มไซส์และทะลุ cap
            // (ตรวจซ้ำอีกครั้งกับพอร์ตจริง ณ วันเติม — ไม่ผ่านตอนนั้น = ยกเลิกพร้อมเหตุผล)
            const want = row.conf >= 0.85 ? 1.0 : 0.5
            const [held, sectorMap] = await Promise.all([db.position.findMany(), getSectorMap()])
            const plan = applySectorConstraints(
              [{ symbol: row.target, slots: want }],
              [
                ...held.map((p) => ({ symbol: p.symbol, slots: p.slots })),
                ...queuedOrders.map((o) => ({ symbol: o.symbol, slots: o.slots })),
              ],
              sectorMap
            )
            const fit = plan.downsized[0] ?? plan.accepted[0]
            if (!fit) {
              const why = plan.rejected[0]?.reason ?? `${row.target} ถูกตัดโดย sector layer`
              await humanLog(false, `${row.reason} | human-approved แต่ไม่เข้าพอร์ต: ${why}`)
              message = `อนุมัติแต่ไม่เข้าพอร์ต — ${why}`
            } else {
              const slots = fit.slots
              const downNote = "reason" in fit ? fit.reason : null
              // ยังไม่สร้าง Position: ราคาปิดล่าสุดเป็นราคาที่รู้แล้วตอนตัดสิน — เติมที่ราคาปิดวันทำการถัดไปแทน
              const queuedOrder = await enqueuePendingFill({
                symbol: row.target,
                slots,
                stopPct: TH_STRATEGY.stopPct,
                stopMult: 1,
                source: "human",
                decisionDate: row.date,
                afterDate: latest as string,
                gateId: row.id,
                conf: row.conf,
                reason: `${row.reason} | human-approved${downNote ? ` | ${downNote}` : ""}`,
                maxSlots: TH_STRATEGY.maxPos,
                epoch: await currentEpochId(),
              })
              if (!queuedOrder) {
                await humanLog(false, `human-reviewed (มีคำสั่งรอเติม T+1 อยู่แล้ว)`)
                message = `อนุมัติแต่ ${row.target} มีคำสั่งซื้อรอเติมอยู่แล้ว — ไม่ส่งซ้ำ`
              } else {
                order = queuedOrder
                // status คง "approved" จนเติมจริง (ขั้นเติมเปลี่ยนเป็น executed) · Decision นี้ไม่ใช่ไม้เข้า (executed=false)
                await humanLog(
                  false,
                  `${row.reason} | human-approved → ${T1_TAG} หลังข้อมูล ${latest}${downNote ? ` | ${downNote}` : ""} ${orderTag(queuedOrder.id)}`
                )
                // หุ้นไม่มีราคาวันล่าสุด (พัก/หยุดซื้อขาย) ยังส่งคำสั่งได้ — ถ้าวันเติมยังไม่มีราคา ขั้นเติมจะยกเลิก (ตามกติกา backtest)
                const haltNote = isFinite(lastPx) && lastPx > 0 ? "" : ` · ⚠️ ${latest} ไม่มีราคา ${row.target} (พัก/หยุดซื้อขาย?) — ถ้าวันเติมยังไม่มีราคา คำสั่งจะถูกยกเลิก`
                message = `อนุมัติ ${row.target} แล้ว — ส่งคำสั่งซื้อ ${slots} slots เข้าคิว เติมที่ราคาปิดของวันทำการถัดไป (T+1 หลังข้อมูล ${latest}) ไม่ใช่ราคาปิดล่าสุดที่เห็นอยู่${downNote ? ` — ${downNote}` : ""}${haltNote}`
              }
            }
          }
        } else if (row.question === "Q_EXIT" && row.action === "exit") {
          // exit ที่มนุษย์อนุมัติ = ปิดที่ราคาปิดล่าสุด (T+0 เหมือน exit ของ Jev) · บันทึก Trade ก่อนลบ Position
          // (เดิมลบเฉย ๆ → Bayes stop และ track record ไม่เห็นเทรดที่มนุษย์ปิด)
          const pos = await db.position.findUnique({ where: { symbol: row.target } })
          let tradeNote = ""
          if (pos && latest) {
            const regimeRow = await db.decision.findFirst({
              where: { question: "Q_REGIME" },
              orderBy: { id: "desc" },
              select: { action: true },
            })
            const noPxToday = !(isFinite(lastPx) && lastPx > 0)
            const saved = await persistClosedTrade(pos, latest, regimeRow?.action ?? "neutral", {
              fillAtLastKnown: noPxToday,
            }).catch(() => false)
            if (!saved) tradeNote = ` (ไม่บันทึก Trade: ต้องถืออย่างน้อย 1 วันทำการและมีราคาในระบบ — เข้า ${pos.entryDate} ออก ${latest})`
          }
          await db.position.deleteMany({ where: { symbol: row.target } })
          status = "executed"
          await humanLog(true, `${row.reason} | human-approved${tradeNote}`)
          message = `อนุมัติ exit ${row.target} — ปิดสถานะแล้ว${latest ? ` ที่ราคาปิด ${latest}` : ""}${tradeNote}`
        } else if (row.question === "Q_EXIT" && row.action === "tighten") {
          const pos = await db.position.findUnique({ where: { symbol: row.target } })
          if (pos) {
            await db.position.update({ where: { symbol: row.target }, data: { stop: pos.entryPx * 1.02 } })
          }
          status = "executed"
          await humanLog(true, `${row.reason} | human-approved`)
          message = `อนุมัติ tighten stop ${row.target} แล้ว`
        } else {
          // เช่น Q_ESCALATE → บันทึกว่ารีวิวแล้ว ไม่แตะพอร์ต
          await humanLog(false, "human-reviewed")
          message = `รีวิวคำสั่ง ${row.target} แล้ว (ไม่มีการเปลี่ยนแปลงพอร์ต)`
        }
      } catch (e) {
        await release().catch(() => null)
        throw e
      }
    }

    // ไม่ทับ "executed" ที่ขั้นเติม T+1 อาจตั้งไปก่อนแล้ว (คำสั่งที่อนุมัติคง "approved" จนเติมจริง)
    await db.pendingGate.updateMany({ where: { id: row.id, status: { not: "executed" } }, data: { status, decidedAt } })
    await emitEvent("gate", "human", {
      gateId: row.id,
      question: row.question,
      target: row.target,
      action: row.action,
      approve,
      finalStatus: status,
      // อนุมัติ Q_ENTRY buy → คำสั่งรอเติม T+1 (เติมที่ราคาปิดวันทำการแรกหลัง afterDate)
      queuedT1: order ? { id: order.id, afterDate: order.afterDate, slots: order.slots } : null,
    })
    return NextResponse.json<GateActionResult>({ ok: true, id: row.id, status, message, ...(order ? { order } : {}) })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
