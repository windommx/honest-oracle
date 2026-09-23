import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { emitEvent } from "@/lib/research/events"
import { computeRegimeState } from "@/lib/momentum/core"
import {
  evaluateStopPositions,
  getBucketPosteriors,
  posteriorDto,
  readStopPolicy,
  runStopArms,
  STOP_POLICY_KEY,
} from "@/lib/momentum/stops/engine"
import { liveBackstop } from "@/lib/momentum/stops/bayes"
import type { StopArm, StopBucket, StopsResponse } from "@/lib/momentum/contracts"

export const dynamic = "force-dynamic"
export const maxDuration = 120

const ADOPTION_RULE =
  "รับ bayes arm เมื่อ Sharpe_arm > Sharpe_fixed + 0.2 และ MaxDD แย่กว่า fixed เกิน 2pp ไม่ได้ และ n ≥ 100 (pre-registered)"

function parseBucket(v: string | null): StopBucket {
  return v === "auto" || v === "human" ? v : "pooled"
}

// GET /api/stops?bucket=pooled|auto|human
// → posterior T/R + walk-forward 3 arms (fixed10 | bayesT | bayesR) + adoption ตามกติกาที่ล็อกไว้
//   + ตำแหน่งเปิดแต่ละตัวบน curve — บันทึก policy ลง Setting.stops_policy เมื่อผล "เปลี่ยน" เท่านั้น
export async function GET(req: Request) {
  const t0 = Date.now()
  try {
    const url = new URL(req.url)
    const bucket = parseBucket(url.searchParams.get("bucket"))

    const [bp, arms, regime] = await Promise.all([
      getBucketPosteriors(bucket),
      runStopArms(),
      computeRegimeState().catch(() => null),
    ])

    // ---------- pre-registered adoption rule ----------
    const fixed = arms.rows.find((r) => r.arm === "fixed10")!
    const bayesRows = arms.rows.filter((r) => r.arm !== "fixed10" && r.n >= 100)
    let bestBayes: StopArm = "bayesT"
    if (bayesRows.length > 0) {
      bestBayes = bayesRows.reduce((a, b) => (b.sharpe > a.sharpe ? b : a)).arm
    }
    const best = arms.rows.find((r) => r.arm === bestBayes)!
    const sharpeDelta = Math.round((best.sharpe - fixed.sharpe) * 100) / 100
    const maxDDDelta = Math.round((best.maxDD - fixed.maxDD) * 10000) / 10000 // ลบ = แย่กว่า
    const passed = best.n >= 100 && sharpeDelta > 0.2 && maxDDDelta >= -0.02 && best.stopNow !== null
    const winner: StopArm = passed ? bestBayes : "fixed10"

    // ---------- persist policy เมื่อผลเปลี่ยน ----------
    // ไม่มีข้อมูลตลาดเลย (DB ใหม่) → ยังไม่มีอะไรให้ตัดสิน — ไม่เขียน policy/Decision ที่ไม่มีวันที่
    const hasMarket = arms.equityCurves.length > 0
    const prev = await readStopPolicy()
    const changed = hasMarket && (!prev || prev.arm !== winner || prev.adopted !== passed)
    if (changed) {
      const payload = JSON.stringify({
        arm: winner,
        adopted: passed,
        decidedAt: new Date().toISOString(),
        stats: { sharpeDelta, maxDDDelta, n: best.n },
      })
      await db.setting.upsert({
        where: { key: STOP_POLICY_KEY },
        create: { key: STOP_POLICY_KEY, value: payload },
        update: { value: payload },
      })
      await db.decision.create({
        data: {
          date: arms.equityCurves[arms.equityCurves.length - 1]?.date ?? "",
          question: "Q_STOP",
          target: "stop-engine",
          action: passed ? `adopt:${winner}` : "keep:fixed10",
          conf: passed ? 0.8 : 0.6,
          reason: `3-arm walk-forward: fixed10 Sharpe=${fixed.sharpe} vs ${bestBayes} Sharpe=${best.sharpe} (Δ${sharpeDelta}) MaxDD ${fixed.maxDD}→${best.maxDD} n=${best.n} — ${ADOPTION_RULE}`,
          executed: false,
          source: "policy",
        },
      })
      await emitEvent("stops_policy", "policy", { winner, passed, sharpeDelta, maxDDDelta, n: best.n, bucket })
    }

    // ---------- posterior "ตัวจริง" ที่หน้างานใช้ = ตาม policy ----------
    const policy = await readStopPolicy()
    const policyArm: StopArm = policy?.arm ?? winner
    const mode: "T" | "R" = policyArm === "bayesR" ? "R" : "T"
    const livePosterior = mode === "T" ? bp.postT : bp.postR
    const postT = posteriorDto(bp.postT)
    const postR = posteriorDto(bp.postR)
    if (bp.pooled && bucket !== "pooled") {
      postT.pooled = true
      postT.note = bp.note
      postR.pooled = true
      postR.note = bp.note
    }

    // ---------- ตำแหน่งเปิดบน curve (posterior ตาม policy mode) ----------
    const { rows: positions, stale, noPrice } = await evaluateStopPositions(livePosterior)
    for (const p of positions) p.regime = regime?.action ?? "-"
    const liveS = liveBackstop(livePosterior)
    const priceNote =
      (stale.length > 0 ? ` · ราคาไม่ใช่วันล่าสุด (หยุดซื้อขาย?): ${stale.join(", ")}` : "") +
      (noPrice.length > 0 ? ` · ไม่มีราคาในระบบ (ประเมินไม่ได้): ${noPrice.join(", ")}` : "")

    const resp: StopsResponse = {
      latest: arms.equityCurves[arms.equityCurves.length - 1]?.date ?? "",
      bucket,
      policy: {
        arm: policy?.arm ?? winner,
        adopted: policy?.adopted ?? passed,
        decidedAt: policy?.decidedAt ?? null,
      },
      posteriorT: postT,
      posteriorR: postR,
      arms: arms.rows,
      equityCurves: arms.equityCurves,
      adoption: {
        winner,
        bestBayes,
        passed,
        rule: ADOPTION_RULE,
        sharpeDelta,
        maxDDDelta,
        saved: changed,
      },
      positions,
      costRT: 0.014,
      embargoDays: 10,
      refitDays: 60,
      tookMs: Date.now() - t0,
      message:
        (bp.nTrades === 0
          ? "ยังไม่มีประวัติเทรด — รัน seed (ข้อมูลตัวอย่าง) หรือให้ Jev ปิดสถานะจริงก่อน"
          : `posterior จาก ${bp.nTrades} เทรด (bucket=${bp.pooled && bucket !== "pooled" ? "pooled (fallback)" : bucket}) · live mode=${mode} · s_live=${liveS !== null ? `${(liveS * 100).toFixed(1)}%` : "—"} · policy=${policy?.arm ?? winner}`) +
        priceNote,
    }
    return NextResponse.json(resp)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
