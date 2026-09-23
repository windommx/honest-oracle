import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { emitEvent } from "@/lib/research/events"
import { frozenWriteError, liveFreezeFlag } from "@/lib/research/freeze"
import { buildMetaPanel } from "@/lib/research/features"
import { runCpcv, DEFAULT_CPCV, MIN_PANEL_ROWS, type CpcvParams } from "@/lib/research/cpcv"
import { fitLogistic, auc, predictProba } from "@/lib/research/logistic"
import type { CpcvListResponse, CpcvResponse, MetaModelStatus } from "@/lib/momentum/contracts"

export const dynamic = "force-dynamic"
export const maxDuration = 300

async function modelStatus(): Promise<MetaModelStatus> {
  const row = await db.setting.findUnique({ where: { key: "meta_model" } })
  if (!row) {
    return { enabled: false, trainedAt: null, hold: null, panelN: null, auc: null, hitGate: null }
  }
  try {
    const m = JSON.parse(row.value) as {
      hold?: number
      panelN?: number
      auc?: number
      hitGate?: number
      trainedAt?: string
    }
    return {
      enabled: true,
      trainedAt: m.trainedAt ?? null,
      hold: m.hold ?? null,
      panelN: m.panelN ?? null,
      auc: m.auc ?? null,
      hitGate: m.hitGate ?? null,
    }
  } catch {
    return { enabled: false, trainedAt: null, hold: null, panelN: null, auc: null, hitGate: null }
  }
}

// GET /api/research/cpcv → ประวัติรัน + สถานะ meta model
export async function GET() {
  try {
    const [runs, model] = await Promise.all([
      db.researchRun.findMany({ where: { kind: "cpcv" }, orderBy: { createdAt: "desc" }, take: 5 }),
      modelStatus(),
    ])
    return NextResponse.json<CpcvListResponse>({
      runs: runs.map((r) => {
        let s: { meanHit?: number; paths?: number; avgGap?: number } = {}
        try {
          s = JSON.parse(r.result) as typeof s
        } catch {
          // ignore
        }
        return {
          id: r.id,
          verdict: r.verdict,
          meanHit: s.meanHit ?? 0,
          paths: s.paths ?? 0,
          avgGap: s.avgGap ?? 0,
          createdAt: r.createdAt.toISOString(),
        }
      }),
      model,
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

// POST /api/research/cpcv
//  body: { hold?, nGroups?, nTestGroups?, purge?, embargo?, hitGate?, deploy?, disableModel? }
//  purge/embargo ไม่ระบุ → ผูกกับ horizon: purge = hold, embargo = round(hold/2)
//  (label ซ้อนทับ horizon hold วัน — purge ต้อง ≥ hold จึงกัน leakage ได้ครบ)
export async function POST(req: Request) {
  try {
    let body: Record<string, unknown> = {}
    try {
      const parsed: unknown = await req.json()
      // JSON ที่ไม่ใช่ object (null, ตัวเลข, array) → ถือเป็น body ว่าง แทนที่จะพังเป็น 500
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) body = parsed as Record<string, unknown>
    } catch {
      body = {}
    }
    const t0 = Date.now()

    // meta_model = กติกาที่ Jev อ่าน (ปรับขนาดไม้) — ล็อกช่วงเก็บผลจริงอยู่ห้าม deploy/ถอด (รัน CPCV เพื่อดูผลได้ตามปกติ)
    if (body.disableModel === true || body.deploy === true) {
      const freeze = await liveFreezeFlag()
      if (freeze.frozen) {
        return NextResponse.json(
          { error: frozenWriteError(body.disableModel === true ? "ถอด meta_model" : "deploy meta_model", freeze), code: "live_frozen", frozenAt: freeze.frozenAt },
          { status: 409 }
        )
      }
    }

    if (body.disableModel === true) {
      await db.setting.deleteMany({ where: { key: "meta_model" } })
      await emitEvent("research", "human", { action: "meta_model_disabled" })
      return NextResponse.json<Omit<CpcvResponse, "id">>({
        params: { ...DEFAULT_CPCV, hold: 10 },
        panelN: 0, paths: 0, meanHit: 0, stdHit: 0, meanAuc: 0, pctAbove: 0,
        avgLong: 0, avgShort: 0, avgGap: 0, pooledHit: 0, pooledAuc: 0,
        pathRows: [], skipped: 0, metaPass: false, deployed: false,
        modelStatus: await modelStatus(),
        tookMs: Date.now() - t0,
      })
    }

    const num = (key: string, d: number, min: number, max: number): number => {
      const raw = body[key]
      if (raw === undefined || raw === null || raw === "") return d
      const v = Number(raw)
      if (!isFinite(v) || v < min || v > max) return d
      return v
    }
    // hold = จำนวนวันทำการ — ค่าเศษทำให้ buildMetaPanel อ่าน px[i + hold] ไม่ได้ (500)
    const hold = Math.round(num("hold", 10, 2, 60))
    const params: CpcvParams = {
      nGroups: Math.round(num("nGroups", DEFAULT_CPCV.nGroups, 4, 10)),
      nTestGroups: Math.round(num("nTestGroups", DEFAULT_CPCV.nTestGroups, 1, 4)),
      purge: Math.round(num("purge", Math.max(hold, DEFAULT_CPCV.purge), 3, 60)),
      embargo: Math.round(num("embargo", Math.round(hold / 2), 0, 60)),
      hitGate: num("hitGate", DEFAULT_CPCV.hitGate, 0.5, 0.8),
    }
    // ต้องเหลือกลุ่ม train ≥ 2 (เงื่อนไขของ runCpcv) — ไม่งั้นได้ 0 path แล้วถูกบันทึกเป็น FAIL ทั้งที่ไม่ได้ทดสอบ
    const maxTest = Math.min(4, params.nGroups - 2)
    if (params.nTestGroups > maxTest) {
      return NextResponse.json(
        { error: `test groups (k) ต้องไม่เกิน ${maxTest} เมื่อ N = ${params.nGroups} (N − 2 และไม่เกิน 4)` },
        { status: 400 }
      )
    }

    const panel = await buildMetaPanel(hold)
    const cpcv = runCpcv(panel, params)
    if (cpcv.paths === 0) {
      // ไม่มี path ที่วัดผลได้ → ไม่บันทึกผล/ไม่ emit (hit 0% · AUC 0 เป็นตัวเลขสมมติ ไม่ใช่ผลทดสอบ)
      const why =
        panel.rows.length < MIN_PANEL_ROWS
          ? `panel มี ${panel.rows.length} แถว (ต้องมีอย่างน้อย ${MIN_PANEL_ROWS})`
          : `ทุก path (${cpcv.skipped}) มีแถว train/test ไม่พอ`
      return NextResponse.json(
        { error: `ข้อมูลไม่พอสำหรับ CPCV — ${why} · นำเข้าข้อมูลย้อนหลังเพิ่มก่อน` },
        { status: 400 }
      )
    }

    // deploy: เทรนโมเดลสุดท้ายบน panel ทั้งชุด แล้วเก็บ weights ไว้ให้ Jev ใช้ sizing
    let deployed = false
    if (body.deploy === true && cpcv.metaPass && panel.rows.length > 0) {
      const model = fitLogistic(
        panel.rows.map((r) => r.x),
        panel.rows.map((r) => r.y),
        { epochs: 250 }
      )
      const ps = panel.rows.map((r) => predictProba(model, r.x))
      const ys = panel.rows.map((r) => r.y)
      await db.setting.upsert({
        where: { key: "meta_model" },
        create: {
          key: "meta_model",
          value: JSON.stringify({
            ...model,
            hold,
            panelN: panel.rows.length,
            auc: auc(ys, ps),
            hitGate: params.hitGate,
            trainedAt: new Date().toISOString(),
          }),
        },
        update: {
          value: JSON.stringify({
            ...model,
            hold,
            panelN: panel.rows.length,
            auc: auc(ys, ps),
            hitGate: params.hitGate,
            trainedAt: new Date().toISOString(),
          }),
        },
      })
      deployed = true
    }

    const run = await db.researchRun.create({
      data: {
        kind: "cpcv",
        paramsHash: `${params.nGroups}x${params.nTestGroups}/p${params.purge}/h${hold}`,
        params: JSON.stringify({ ...params, hold }),
        result: JSON.stringify({
          panelN: cpcv.panelN,
          paths: cpcv.paths,
          meanHit: cpcv.meanHit,
          stdHit: cpcv.stdHit,
          meanAuc: cpcv.meanAuc,
          pctAbove: cpcv.pctAbove,
          avgLong: cpcv.avgLong,
          avgShort: cpcv.avgShort,
          avgGap: cpcv.avgGap,
          pooledHit: cpcv.pooledHit,
          pooledAuc: cpcv.pooledAuc,
        }),
        verdict: cpcv.metaPass ? "PASS" : "FAIL",
      },
    })
    await emitEvent("research", "system", {
      kind: "cpcv",
      runId: run.id,
      paths: cpcv.paths,
      meanHit: Math.round(cpcv.meanHit * 1000) / 1000,
      pctAbove: Math.round(cpcv.pctAbove * 1000) / 1000,
      avgGap: Math.round(cpcv.avgGap * 1000) / 1000,
      metaPass: cpcv.metaPass,
      deployed,
    })

    return NextResponse.json<CpcvResponse>({
      id: run.id,
      params: { ...params, hold },
      panelN: cpcv.panelN,
      paths: cpcv.paths,
      meanHit: cpcv.meanHit,
      stdHit: cpcv.stdHit,
      meanAuc: cpcv.meanAuc,
      pctAbove: cpcv.pctAbove,
      avgLong: cpcv.avgLong,
      avgShort: cpcv.avgShort,
      avgGap: cpcv.avgGap,
      pooledHit: cpcv.pooledHit,
      pooledAuc: cpcv.pooledAuc,
      pathRows: cpcv.pathRows,
      skipped: cpcv.skipped,
      metaPass: cpcv.metaPass,
      deployed,
      modelStatus: await modelStatus(),
      tookMs: Date.now() - t0,
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
