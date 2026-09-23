import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getPanelCached, loadAll, DEFAULT_W } from "@/lib/momentum/signals/io"
import { crossIC, timingCorr, promote } from "@/lib/momentum/signals/engine"
import { learnWeights, type SignalWeights } from "@/lib/momentum/signals/weights"
import { emitEvent } from "@/lib/research/events"
import { liveFreezeFlag, type LiveFreezeFlag } from "@/lib/research/freeze"
import { mayPersistOnGet } from "@/lib/security/request-principal"
import type { IcResponse, SignalIcSummary } from "@/lib/momentum/contracts"

export const dynamic = "force-dynamic"
export const maxDuration = 120

const SIGNS = { mom: 1, mfd: -1, sec: 1, vol: -1 } as const
const SIGNAL_KEYS = ["mom", "mfd", "sec", "vol"] as const

function verdict(r: SignalIcSummary, sign: 1 | -1): "PROMOTE" | "FLIP-CHECK" | "KILL" {
  if (promote(r, sign)) return "PROMOTE"
  if (Math.abs(r.ICIR) > 0.25 && r.n >= 120 && Math.sign(r.meanIC) !== sign) return "FLIP-CHECK"
  return "KILL"
}

// GET /api/signals/ic?hold=10
// สอบสัญญาณด้วย cross-sectional IC (Spearman รายวัน vs forward return) + timing corr
// ผลบันทึกเป็น pre-registered policy (Setting.signals_policy) + Decision Q_SIGNAL/policy
// บันทึกเฉพาะผู้ดูแลที่เรียกจากหน้าเว็บนี้/สคริปต์ — hold มาจาก query string: ถ้าไม่กัน ผู้ชมหรือเว็บอื่น
// ที่พา browser มาเปิด ?hold=60 จะเปลี่ยนสัญญาณ/น้ำหนักที่ Jev ใช้ได้ (ได้ผลคำนวณแต่ policySaved=false)
// ล็อกช่วงเก็บผลจริง (src/lib/research/freeze.ts) = ไม่บันทึกเลยแม้เป็นผู้ดูแล — เปิดแท็บ/สลับ hold ได้ปลอดภัย
// (frozen=true + freezeNote · Jev อ่าน policy ที่ล็อกไว้ต่อ · freezeDrift = ค่าที่ถูกแก้ข้ามด่าน)
export async function GET(req: Request) {
  const t0 = Date.now()
  try {
    const holdRaw = Number(new URL(req.url).searchParams.get("hold") ?? 10)
    const hold = isFinite(holdRaw) ? Math.min(60, Math.max(5, Math.round(holdRaw))) : 10

    // rows ใช้ร่วมกันทุกการวัดภายใน request เดียว — ผ่าน loadAll() ที่ cache ตาม dataKey
    // (เดิมเก็บไว้ในตัวแปรระดับโมดูลตลอดอายุ server → forward return มาจากข้อมูลเก่าหลัง ingest/reseed
    //  ขณะที่ panel สร้างจากข้อมูลใหม่)
    const [panel, { rows }] = await Promise.all([getPanelCached(DEFAULT_W), loadAll()])

    const ic = {
      mom: crossIC(panel, (s) => s.mom, hold, rows),
      mfd: crossIC(panel, (s) => s.mfd, hold, rows),
      sec: crossIC(panel, (s) => s.rotZ, hold, rows),
      vol: crossIC(panel, (s) => s.symVolPct, hold, rows),
    }
    const timing = {
      breadthZ: timingCorr(panel, (m) => m.breadthZ, hold, rows),
      crossZ: timingCorr(panel, (m) => m.crossZ, hold, rows),
      volPct: timingCorr(panel, (m) => -m.volPct, hold, rows),
      overlapZ: timingCorr(panel, (m) => m.overlapZ, hold, rows),
    }

    const verdicts: Record<string, "PROMOTE" | "FLIP-CHECK" | "KILL"> = {}
    for (const k of SIGNAL_KEYS) verdicts[k] = verdict(ic[k], SIGNS[k])
    const timingVerdicts: Record<string, "USE" | "KILL"> = {}
    for (const [k, v] of Object.entries(timing))
      timingVerdicts[k] = Math.abs(v.corr) > 0.08 && v.n >= 200 ? "USE" : "KILL"

    const promoted = SIGNAL_KEYS.filter((k) => verdicts[k] === "PROMOTE")
    const weights = learnWeights(ic, SIGNS)

    // ---------- เขียน policy (กติกาล็อกไว้ก่อนเห็นผล ตาม pre-registered policy) ----------
    const latest = panel.dates[panel.dates.length - 1] ?? ""
    let policySaved = false
    // เช็กล็อก "หลัง" คำนวณเสร็จ (ก่อนเขียนทันที) — ล็อกที่เกิดระหว่างคำนวณก็ยังกันได้
    const freeze: LiveFreezeFlag = await liveFreezeFlag()
    if (latest && !freeze.frozen && mayPersistOnGet(req)) {
      const stats: Record<string, SignalIcSummary> = {}
      for (const k of SIGNAL_KEYS) stats[k] = ic[k]
      const policy = {
        promoted,
        signs: SIGNS as Record<string, 1 | -1>,
        weights: weights as SignalWeights,
        hold,
        v2: promoted.length > 0,
        updatedAt: new Date().toISOString(),
        stats,
      }
      await db.setting.upsert({
        where: { key: "signals_policy" },
        create: { key: "signals_policy", value: JSON.stringify(policy) },
        update: { value: JSON.stringify(policy) },
      })
      // ลบ Q_SIGNAL ของวันล่าสุดเดิม (รันสอบซ้ำ = แทนที่ผลชุดเดิม) แล้ว log ชุดใหม่
      // ทำใน batch transaction เดียว — request ที่ซ้อนกัน (สลับ hold เร็ว ๆ) เดิม delete ก่อนแล้ว
      // create สลับกันจนเหลือ Q_SIGNAL ซ้ำ (เช่น 6 แถวแทน 4)
      await db.$transaction([
        db.decision.deleteMany({ where: { date: latest, question: "Q_SIGNAL" } }),
        ...SIGNAL_KEYS.map((k) =>
          db.decision.create({
            data: {
              date: latest,
              question: "Q_SIGNAL",
              target: k,
              action: verdicts[k].toLowerCase(),
              conf: Math.min(1, Math.abs(ic[k].ICIR)),
              reason: `meanIC=${ic[k].meanIC.toFixed(3)} t=${ic[k].t.toFixed(1)} n=${ic[k].n} | น้ำหนัก=${weights[k].toFixed(3)}`,
              executed: verdicts[k] === "PROMOTE",
              source: "policy",
            },
          })
        ),
      ])
      await emitEvent("signals_policy", "policy", {
        date: latest,
        hold,
        promoted,
        weights,
        verdicts,
        timingVerdicts,
      })
      policySaved = true
    }

    const res: IcResponse & LiveFreezeFlag = {
      hold,
      ic,
      timing,
      verdicts,
      timingVerdicts,
      promoted,
      weights: weights as unknown as Record<string, number>,
      policySaved,
      tookMs: Date.now() - t0,
      ...freeze,
    }
    return NextResponse.json(res)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
