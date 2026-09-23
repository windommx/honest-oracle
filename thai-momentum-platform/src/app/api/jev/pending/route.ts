import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { closePivot } from "@/lib/momentum/core"
import { TH_STRATEGY } from "@/lib/config/thai"
import { applySectorConstraints, getSectorMap } from "@/lib/risk/sector"
import { emitEvent } from "@/lib/research/events"
import type { GateActionResult, PendingRow, PendingResponse } from "@/lib/momentum/contracts"

export const dynamic = "force-dynamic"

// GET /api/jev/pending → คำสั่งที่รอมนุษย์ตัดสินใจ (default-deny)
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
    return NextResponse.json<PendingResponse>({ pending })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

// POST /api/jev/pending { id, approve } → มนุษย์อนุมัติ/ปฏิเสธ (fill T+1 ที่ราคาล่าสุด)
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

    if (approve) {
      try {
        // fill ราคาปิดล่าสุด (T+1 paper fill)
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

        if (row.question === "Q_ENTRY" && row.action === "buy" && !(isFinite(lastPx) && lastPx > 0)) {
          // หุ้นไม่มีราคาวันล่าสุด (พัก/หยุดซื้อขาย) → ซื้อไม่ได้ — เดิมกลายเป็น "รีวิวแล้ว" เงียบ ๆ
          await release()
          return NextResponse.json(
            {
              error: `ยังไม่มีราคาปิดล่าสุดของ ${row.target} (พักการซื้อขาย?) — ยังเข้าพอร์ตไม่ได้ คำสั่งยังรออยู่`,
            },
            { status: 409 }
          )
        }

        if (row.question === "Q_ENTRY" && row.action === "buy") {
          const existing = await db.position.findUnique({ where: { symbol: row.target } })
          if (!existing) {
            // ขนาดผ่าน sector layer เดียวกับรอบรัน (ชื่อ/sector/กลุ่ม/งบเต็ม) บนพอร์ตปัจจุบัน —
            // เดิมใช้ 1.0/0.5 ตาม conf ตรง ๆ: gate ที่ถูกลดขนาดกลับมาเต็มไซส์และทะลุ cap
            const want = row.conf >= 0.85 ? 1.0 : 0.5
            const [held, sectorMap] = await Promise.all([db.position.findMany(), getSectorMap()])
            const plan = applySectorConstraints(
              [{ symbol: row.target, slots: want }],
              held.map((p) => ({ symbol: p.symbol, slots: p.slots })),
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
              await db.position.create({
                data: {
                  symbol: row.target,
                  entryDate: latest as string,
                  entryPx: lastPx,
                  slots,
                  stop: lastPx * (1 - TH_STRATEGY.stopPct),
                },
              })
              status = "executed"
              await humanLog(true, `${row.reason} | human-approved${downNote ? ` | ${downNote}` : ""}`)
              message = `อนุมัติและเข้าพอร์ต ${row.target} ที่ราคา ${lastPx.toFixed(2)} (slots ${slots})${downNote ? ` — ${downNote}` : ""}`
            }
          } else {
            await humanLog(false, "human-reviewed (มีสถานะอยู่แล้ว)")
            message = `อนุมัติแต่ ${row.target} มีสถานะอยู่แล้ว — ไม่เพิ่มพอร์ต`
          }
        } else if (row.question === "Q_EXIT" && row.action === "exit") {
          await db.position.deleteMany({ where: { symbol: row.target } })
          status = "executed"
          await humanLog(true, `${row.reason} | human-approved`)
          message = `อนุมัติ exit ${row.target} — ปิดสถานะแล้ว`
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

    await db.pendingGate.update({ where: { id: row.id }, data: { status, decidedAt } })
    await emitEvent("gate", "human", {
      gateId: row.id,
      question: row.question,
      target: row.target,
      action: row.action,
      approve,
      finalStatus: status,
    })
    return NextResponse.json<GateActionResult>({ ok: true, id: row.id, status, message })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
