import { NextResponse } from "next/server"
import { createHash } from "crypto"
import { db } from "@/lib/db"
import { generateBatch } from "@/lib/lab/synth-state"
import { ruleEngine } from "@/lib/lab/rule-engine"
import { decideBatch, firstUnavailable, type NimbleDecision } from "@/lib/lab/nimble"
import type { StatePacket } from "@/lib/lab/state"

export const dynamic = "force-dynamic"
export const maxDuration = 300

// helper: นับความเห็นตรงกัน rule × Nimble (rule null = NO_TRADE)
// คำตอบที่มี error (JSON เพี้ยน/ไม่ครบ) = fallback NO_TRADE ไม่ใช่การตัดสินของโมเดล → ห้ามนับว่า "ตรงกัน"
function agreementOf(packets: StatePacket[], decisions: NimbleDecision[]): { n: number; agree: number } {
  let agree = 0
  for (let i = 0; i < packets.length; i++) {
    const ruleAction = ruleEngine(packets[i]).action
    const nb = decisions[i]
    if (nb.error) continue
    if ((ruleAction === null && nb.action === "NO_TRADE") || ruleAction === nb.action) agree++
  }
  return { n: packets.length, agree }
}

// Nimble ติดต่อไม่ได้ = ไม่มีคำตอบให้ตรวจ → ห้ามคิดคะแนน/บันทึก ResearchRun (คำตอบ fallback ไม่ใช่การตัดสินของโมเดล)
function unavailableResponse(stage: string, err: string) {
  return NextResponse.json(
    { error: `Nimble (LLM) ไม่พร้อมระหว่าง ${stage} — ยกเลิก eval และไม่บันทึกผล: ${err}` },
    { status: 503 }
  )
}

// POST /api/lab/eval — ผลตรวจ 5 ประตูของแล็บเงา (สิทธิ์โปรโมต THE CORE + Nimble)
// body { n?: number default 40 cap 80 }
export async function POST(req: Request) {
  try {
    const raw: unknown = await req.json().catch(() => null)
    const body = (raw !== null && typeof raw === "object" ? raw : {}) as { n?: unknown }
    const n = Math.min(80, Math.max(1, typeof body.n === "number" ? Math.floor(body.n) : 40))

    // ================= G1: synthetic agreement (seed 123 — ชุดอ้างอิงถาวร) =================
    const states = generateBatch(n, 123)
    const g1Nimble = await decideBatch(states) // THE CORE prompt
    const u1 = firstUnavailable(g1Nimble)
    if (u1) return unavailableResponse("G1", u1)
    const g1 = agreementOf(states, g1Nimble)
    const syntheticAgreement = g1.n > 0 ? g1.agree / g1.n : 0

    // ================= G4: grammar validity — จากคำตอบชุดเดียวกับ G1 =================
    let grammarOk = 0
    for (const d of g1Nimble) if (!d.error) grammarOk++
    const grammarValidity = g1.n > 0 ? grammarOk / g1.n : 0

    // ================= G2: human edge — replay สถานะที่มนุษย์ label ไว้ =================
    const labelRows = await db.edgeLabel.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 30,
    })
    const replay: { label: string; packet: StatePacket }[] = []
    for (const l of labelRows) {
      const log = await db.shadowLog.findUnique({ where: { key: l.logKey } })
      if (!log || !log.stateJson) continue
      try {
        replay.push({ label: l.label, packet: JSON.parse(log.stateJson) as StatePacket })
      } catch {
        // stateJson เสีย — ข้าม
      }
    }
    let humanEdgeAgreement: number | null = null
    let gate2: { n: number; agree: number } | null = null
    if (replay.length > 0) {
      const dec = await decideBatch(replay.map((r) => r.packet))
      const u2 = firstUnavailable(dec)
      if (u2) return unavailableResponse("G2", u2)
      let agree = 0
      for (let i = 0; i < replay.length; i++) if (!dec[i].error && dec[i].action === replay[i].label) agree++
      humanEdgeAgreement = agree / replay.length
      gate2 = { n: replay.length, agree }
    }

    // ================= G3: brier — จาก ShadowLog ที่มี outcomeR แล้ว =================
    const withOutcome = await db.shadowLog.findMany({
      where: { outcomeR: { not: null } },
      select: { nimbleConf: true, outcomeR: true },
    })
    let brier: number | null = null
    if (withOutcome.length >= 10) {
      let s = 0
      for (const row of withOutcome) {
        const y = (row.outcomeR as number) > 0 ? 1 : 0
        s += (row.nimbleConf - y) * (row.nimbleConf - y)
      }
      brier = s / withOutcome.length
    }

    // ================= G5: no-regression (generic base vs THE CORE — state เดียวกัน) =================
    const m = Math.ceil(n / 2)
    const states5 = generateBatch(m, 789)
    const baseDec = await decideBatch(states5, { genericPrompt: true })
    const u5b = firstUnavailable(baseDec)
    if (u5b) return unavailableResponse("G5 (base)", u5b)
    const coreDec = await decideBatch(states5) // THE CORE prompt
    const u5 = firstUnavailable(coreDec)
    if (u5) return unavailableResponse("G5", u5)
    const g5Base = agreementOf(states5, baseDec)
    const g5New = agreementOf(states5, coreDec)
    const noRegression = g5New.agree >= g5Base.agree

    // ================= verdict + persist ResearchRun =================
    const passed =
      syntheticAgreement >= 0.97 &&
      (humanEdgeAgreement === null || humanEdgeAgreement >= 0.85) &&
      (brier === null || brier < 0.15) &&
      grammarValidity === 1 &&
      noRegression
    const promotion = passed ? "APPROVED" : "REJECTED"

    const result = {
      syntheticAgreement,
      humanEdgeAgreement,
      brier,
      grammarValidity,
      noRegression,
      passed,
      promotion,
    }
    const params = { n }
    await db.researchRun.create({
      data: {
        kind: "lab_eval",
        paramsHash: createHash("sha256").update(JSON.stringify(params)).digest("hex"),
        params: JSON.stringify(params),
        result: JSON.stringify(result),
        verdict: promotion,
      },
    })

    return NextResponse.json({
      ok: true,
      results: result,
      details: { gate1: g1, gate2, gate5: { n: m, baseAgree: g5Base.agree, newAgree: g5New.agree } },
    })
  } catch (e) {
    return NextResponse.json({ error: `รัน eval แล็บเงาไม่สำเร็จ: ${(e as Error).message}` }, { status: 500 })
  }
}
