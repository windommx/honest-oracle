import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { emitEvent } from "@/lib/research/events"
import { buildMetaPanel } from "@/lib/research/features"
import { runCpcv, DEFAULT_CPCV, type CpcvParams } from "@/lib/research/cpcv"
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
      body = (await req.json()) as Record<string, unknown>
    } catch {
      body = {}
    }
    const t0 = Date.now()

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
    const hold = num("hold", 10, 2, 60)
    const params: CpcvParams = {
      nGroups: Math.round(num("nGroups", DEFAULT_CPCV.nGroups, 4, 10)),
      nTestGroups: Math.round(num("nTestGroups", DEFAULT_CPCV.nTestGroups, 1, 4)),
      purge: Math.round(num("purge", Math.max(hold, DEFAULT_CPCV.purge), 3, 60)),
      embargo: Math.round(num("embargo", Math.round(hold / 2), 0, 60)),
      hitGate: num("hitGate", DEFAULT_CPCV.hitGate, 0.5, 0.8),
    }

    const panel = await buildMetaPanel(hold)
    const cpcv = runCpcv(panel, params)

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
