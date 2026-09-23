import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { closePivot, computeRegimeState, logistic, snapshotMembers } from "@/lib/momentum/core"
import { emitEvent } from "@/lib/research/events"
import { freezeFlagFrom, hashValues, readFreezeValues } from "@/lib/research/freeze"
import { liveMetaProbability, metaSizeMultiplier } from "@/lib/research/features"
import {
  applySectorConstraints,
  computeGroupExposure,
  computeSectorExposure,
  getSectorMap,
  sectorOf,
  type SectorConstraintResult,
} from "@/lib/risk/sector"
import { TH_STRATEGY } from "@/lib/config/thai"
import { DEFAULT_CONFIG, getConfigTh, type ThaiConfig } from "@/lib/config/thai-config"
import type { JevDecision, JevRunResponse, PendingFillRow, RegimeAction } from "@/lib/momentum/contracts"
import { calendarMult, snapback } from "@/lib/momentum/signals/thai"
import { snapbackInputsForDate } from "@/lib/momentum/signals/thai-panel"
import {
  getPanelCached,
  readSignalsPolicy,
  loadAll,
  loadSectorOf,
  dataKey,
  DEFAULT_W,
} from "@/lib/momentum/signals/io"
import { GATES, type Panel, type StockDay } from "@/lib/momentum/signals/engine"
import { getCachedScan } from "@/lib/momentum/arb/pairs"
import {
  getBucketPosteriors,
  persistClosedTrade,
  readStopPolicy,
} from "@/lib/momentum/stops/engine"
import { liveExit, liveBackstop, type Posterior } from "@/lib/momentum/stops/bayes"
import { lastKnownIndex } from "@/lib/portfolio/returns"
import { applyTimeExit, exitKind, legacyExitDecision, noPriceStreak } from "@/lib/jev/exit"
import {
  currentEpochId,
  enqueuePendingFill,
  previewPendingFills,
  processPendingFills,
  readPendingFills,
} from "@/lib/jev/fills"
import { CANCEL_ACTION, FILL_ACTION, previewPendingFill, queuedDecisionReason } from "@/lib/jev/fill-rules"

export const dynamic = "force-dynamic"
export const maxDuration = 120

const TH_CONF = { Q_ENTRY: 0.7, Q_EXIT: 0.75 } as const
const MAX_SLOTS = TH_STRATEGY.maxPos // 7 — sector risk layer ใช้งบ slots เดียวกัน
const IDEMPOTENT_MSG = "Jev รันไปแล้วสำหรับวันนี้ — ใช้ปุ่มต่อไปนี้เพื่อจัดการ pending"

type Dec = JevDecision

// รันทีละรอบต่อโปรเซส — กดซ้ำ/หลายแท็บยิงพร้อมกันเคยผ่าน idempotency guard ทั้งคู่
// (log/gate ซ้ำ, exit ซ้ำ) → รอบถัดไปรอรอบก่อนจบ แล้วเจอ guard ตอบ IDEMPOTENT_MSG ตามปกติ
let runChain: Promise<unknown> = Promise.resolve()

// POST /api/jev/run → สมอง Jev ตัดสินใจรอบวันล่าสุด (PAPER mode, log ทุก decision)
// Signals v2: composite regime (grossMult ต่อเนื่อง) + risk filters เปิดเสมอ
// (distribution/sector-outflow block, vol-aware sizing/stop) + alpha boosts
// เฉพาะสัญญาณที่ผ่าน IC ตาม pre-registered policy + shadow A/B + Q_PAIRS
// Entry แบบ T+1 (2026-09-23 — src/lib/jev/fills.ts): ตอนเริ่มรอบเติมคำสั่งค้างที่ราคาปิดวันทำการแรกหลัง afterDate
// ก่อนทุกอย่าง · การซื้ออัตโนมัติของรอบนี้ = ส่งคำสั่งเข้าคิว (ยังไม่ใช่ Position) เติมรอบถัดไป — เหมือน runBacktest
// · exit ยังเป็น T+0 ที่ราคาปิดของวันที่ทริกเกอร์ (เหมือน stop/time exit ของ backtest)
export async function POST() {
  const job = runChain.then(() => runJev())
  runChain = job.catch(() => undefined)
  return job
}

async function runJev() {
  try {
    // กติกาที่รอบนี้อ่าน (sha256 ของค่าใน Setting) + สถานะล็อก — ลง event jev_run ให้ตรวจย้อนหลังได้ทีละรอบ
    // (การแก้ค่าตรงใน DB แล้วแก้กลับระหว่างสองจุดตรวจ ยังเห็นได้จาก hash ของแต่ละรอบ)
    const rulesAtStart = await readFreezeValues().catch(() => null)
    const rules = rulesAtStart
      ? {
          hashes: hashValues(rulesAtStart.values),
          frozen: rulesAtStart.freezeRaw !== null,
          drift: freezeFlagFrom(rulesAtStart.freezeRaw, rulesAtStart.values).freezeDrift,
        }
      : null
    // ---------- Thai config-as-data (Task 9-c) — โหลดไม่ได้ → ใช้ค่า default ----------
    let TH: ThaiConfig
    try {
      TH = await getConfigTh()
    } catch {
      TH = DEFAULT_CONFIG
    }
    // ตัวหาร max ของ tfScore = ผลรวมน้ำหนักสายสั้น (tf ≤ 80) ของ config ปัจจุบัน (ไม่ hardcode)
    const shortCapRaw = [5, 10, 20, 40, 80].reduce((s, t) => s + (TH.tfWeights[String(t)] ?? 0), 0)
    const shortCap = shortCapRaw > 0 ? shortCapRaw : 1
    // honesty block — config ที่รอบนี้ใช้ แนบกลับใน response ทุกเส้นทาง
    const configSummary = {
      updatedBy: TH.updatedBy,
      holdDefault: TH.holdDefault,
      calendarOverlay: TH.calendarOverlay,
      reversalEnabled: TH.reversalEnabled,
    }

    const { dates, byDate } = await snapshotMembers()
    const latest = dates[dates.length - 1]
    if (!latest) return NextResponse.json({ error: "ยังไม่มีข้อมูล snapshot" }, { status: 400 })

    const regime = await computeRegimeState()
    if (!regime) return NextResponse.json({ error: "คำนวณ regime ไม่ได้" }, { status: 500 })

    // ---------- Signals v2 panel + policy ----------
    const policy = await readSignalsPolicy().catch(() => null)
    let panel: Panel | null = null
    try {
      panel = await getPanelCached(policy?.weights ?? DEFAULT_W)
    } catch {
      panel = null
    }
    // regime/calendar ต้องเป็นของวันเดียวกับ decisions (latest = วันล่าสุดที่มี snapshot) — ไม่ใช่แถวท้ายของ
    // panel (RawDaily ล่าสุด): แถววันหยุดจาก Yahoo (volume 0 → ไม่มี snapshot) เคยทำให้ regime มาจากอีกวัน
    const panelIdx = panel ? panel.dates.lastIndexOf(latest) : -1
    const marketNow = panel && panelIdx >= 0 ? (panel.market[panelIdx] ?? null) : null
    const sdBySym = new Map<string, StockDay>()
    if (panel) for (const s of panel.byDateStock.get(latest) ?? []) sdBySym.set(s.symbol, s)
    const promoted = new Set<string>(policy?.promoted ?? [])
    const v2Alpha = !!marketNow && !!policy?.v2 && promoted.size > 0

    // Composite regime ต่อเนื่องแทน binary — grossMult ทำให้งบไหลตาม score
    const regimeAction: RegimeAction = marketNow ? marketNow.label : regime.action
    const regimeConf = marketNow
      ? Math.round(Math.min(0.99, 0.5 + 0.35 * Math.abs(marketNow.regimeScore)) * 100) / 100
      : regime.conf
    // งบ slots ของรอบ — บังคับจริงใน sector layer (maxSlots) · ไม่เกิน MAX_SLOTS (grossMult สูงสุด 1.25 → 8 > 7)
    let slotBudget =
      marketNow && Number.isFinite(marketNow.grossMult)
        ? Math.min(MAX_SLOTS, Math.max(2, Math.floor(MAX_SLOTS * marketNow.grossMult)))
        : MAX_SLOTS

    // Calendar overlay (H3) — TH.calendarOverlay → คูณงบ slots ด้วยตัวคูณ TOM/January
    // (panel สร้างไม่สำเร็จ → ข้าม overlay อย่างเงียบ ๆ) · clamp ผลลัพธ์เสมอ [1, MAX_SLOTS]
    let calMult = 1
    if (TH.calendarOverlay && panel && panelIdx >= 0) {
      calMult = calendarMult(panel.dates, panelIdx, regimeAction)
      slotBudget = Math.min(MAX_SLOTS, Math.max(1, Math.round(slotBudget * calMult)))
    }
    const calPart = TH.calendarOverlay && panel && panelIdx >= 0 ? ` calendarMult:${calMult.toFixed(2)}` : ""

    // Sector risk layer — โหลดแผนที่ symbol → sector ครั้งเดียวต่อรัน
    const sectorMap = await getSectorMap()

    // ---------- 0) เติมคำสั่งค้าง T+1 ก่อนทุกอย่าง ----------
    // ราคาปิดของวันทำการแรกใน pivot ที่หลัง afterDate (ไม่มีราคาวันนั้น = ยกเลิก) · ทำก่อน idempotency guard:
    // เติมซ้ำไม่ได้อยู่แล้ว (คำสั่งถูกลบจากคิวหลังเติม) และการตัดสินใจ/exit ของรอบนี้ต้องเห็นพอร์ตหลังเติม
    const fillStep = await processPendingFills()
    const fills = { filled: fillStep.filled, cancelled: fillStep.cancelled }
    const fillPart =
      fills.filled.length + fills.cancelled.length > 0
        ? ` | เติม T+1 ${fills.filled.length}${fills.cancelled.length > 0 ? ` (ยกเลิก ${fills.cancelled.length})` : ""}`
        : ""

    // Idempotency guard: รันซ้ำวันเดียวกัน → ตอบกลับแบบไม่ทำอะไร
    // นับเฉพาะแถวที่รอบของ Jev เขียนเอง — แถวเติม/ยกเลิกคำสั่ง (ลงวันเติม) และการอนุมัติของมนุษย์ (ลงวันข้อมูลล่าสุด
    // ตอนอนุมัติ = อาจเป็นวันนี้ถ้าอนุมัติหลังข้อมูลเข้าแต่ก่อนรัน) ไม่ใช่หลักฐานว่ารอบของวันนี้ตัดสินใจไปแล้ว
    // (เดิมอนุมัติหลังข้อมูลเข้า → รอบของวันนั้นถูกข้ามทั้งรอบ)
    const dup = await db.decision.findFirst({
      where: {
        date: latest,
        question: "Q_ENTRY",
        source: { not: "human" },
        action: { notIn: [FILL_ACTION, CANCEL_ACTION] },
      },
      select: { id: true },
    })
    if (dup) {
      // รันซ้ำวันเดียวกัน — ไม่ตัดสินใจใหม่ แต่ยังคำนวณ exposure สดจากพอร์ตปัจจุบัน (หลังเติม)
      // เพื่อให้ UI มีข้อมูล sector/group เสมอ
      const posNow = await db.position.findMany()
      const itemsNow = posNow.map((p) => ({ symbol: p.symbol, slots: p.slots }))
      const dupResp: JevRunResponse = {
        date: latest,
        regime: regimeAction,
        message: `${IDEMPOTENT_MSG}${fillPart}`,
        executed: fillStep.executed,
        gated: [],
        blocked: [],
        sectorExposure: computeSectorExposure(itemsNow, sectorMap),
        groupExposure: computeGroupExposure(itemsNow, sectorMap),
        queued: [],
        fills,
        pendingFills: await previewPendingFills(),
      }
      return NextResponse.json({ ...dupResp, config: configSummary })
    }

    const pivot = await closePivot()
    const pi = pivot.dateIdx.get(latest)
    const lastPxOf = (sym: string): number => {
      if (pi === undefined) return NaN
      const si = pivot.symIdx.get(sym)
      return si === undefined ? NaN : pivot.px[pi][si]
    }
    // ราคาปิดล่าสุดที่มีจริง ณ/ก่อนวันล่าสุด (หุ้นพัก/หยุดซื้อขายไม่มีแถววันล่าสุด) — ใช้เขียนเหตุผล และเป็นราคา
    // ของการบังคับปิดเมื่อไม่มีราคาติดกันครบ NO_PRICE_EXIT_DAYS วัน (persistClosedTrade fillAtLastKnown ใช้ราคาเดียวกัน)
    const lastKnownOf = (sym: string): { px: number; date: string } | null => {
      const si = pivot.symIdx.get(sym)
      if (pi === undefined || si === undefined) return null
      const k = lastKnownIndex(pivot.px, si, pi)
      return k < 0 ? null : { px: pivot.px[k][si], date: pivot.dates[k] }
    }

    // ---------- 1) candidates: นับ n_tf + best rank ของวันล่าสุด ----------
    const snaps = await db.snapshot.findMany({ where: { date: latest } })
    const stat = new Map<string, { n: number; bestRank: number }>()
    const tfs = new Map<string, Set<number>>() // timeframes ที่ติดโผวันล่าสุด ต่อหุ้น (สำหรับ tfWeights)
    for (const s of snaps) {
      const cur = stat.get(s.symbol) ?? { n: 0, bestRank: Number.POSITIVE_INFINITY }
      cur.n += 1
      if (s.rank < cur.bestRank) cur.bestRank = s.rank
      stat.set(s.symbol, cur)
      let t = tfs.get(s.symbol)
      if (!t) {
        t = new Set<number>()
        tfs.set(s.symbol, t)
      }
      t.add(s.timeframe)
    }
    const candidates = [...stat.entries()]
      .filter(([, v]) => v.n >= 1)
      .sort((a, b) => b[1].n - a[1].n || a[1].bestRank - b[1].bestRank)
      .slice(0, 40)

    // streak: จำนวนวันทำการต่อเนื่องที่ติดโผ (union ทุก tf) ย้อนจากวันล่าสุด สูงสุด 60
    const streakOf = (sym: string): number => {
      let n = 0
      for (let i = dates.length - 1; i >= 0 && n < 60; i--) {
        const set = byDate.get(dates[i])
        if (set && set.has(sym)) n++
        else break
      }
      return n
    }

    // ---------- 2) สร้าง decisions ทั้งหมดก่อน แล้วค่อย orchestrate ----------
    // Q_ENTRY + Q_ESCALATE
    const entryDecs: Dec[] = []
    const escalateDecs: Dec[] = []
    const entryMeta = new Map<string, { nTf: number; streak: number }>()
    for (const [sym, v] of candidates) {
      const streak = streakOf(sym)
      entryMeta.set(sym, { nTf: v.n, streak })
      // TF-weighted mom (config_th): 0.7·(ผลรวมน้ำหนัก tf ที่ติดโผ / ผลรวมสายสั้น) + 0.3·streak
      const tfScore = [...(tfs.get(sym) ?? [])].reduce((s, tf) => s + (TH.tfWeights[String(tf)] ?? 0), 0)
      const mom = 0.7 * (tfScore / shortCap) + 0.3 * (Math.min(streak, 10) / 10)
      // โครง logistic เดิม — แทน term n_tf ด้วย mom (1.4 = 0.9+0.5 คงสเกล linear เดิม + จุดปลายเท่าเดิม)
      const conf = Math.round(logistic(6 * (1.4 * mom - 0.45)) * 100) / 100
      const action = conf >= 0.5 ? "buy" : conf >= 0.35 ? "watch" : "ignore"
      const sector = sectorOf(sectorMap, sym)
      const sd = sdBySym.get(sym)
      entryDecs.push({
        question: "Q_ENTRY",
        target: sym,
        action,
        conf,
        reason: sd
          ? `n_tf=${v.n} streak=${streak} mom=${mom.toFixed(2)} [${sector}] score=${sd.score.toFixed(2)} mfd=${sd.mfd.toFixed(2)} sec=${sd.sectorRank}/${panel?.sectors.length ?? 0}`
          : `n_tf=${v.n} streak=${streak} mom=${mom.toFixed(2)} [${sector}]`,
      })
      if (v.n >= 5 && streak === 1) {
        escalateDecs.push({
          question: "Q_ESCALATE",
          target: sym,
          action: "review",
          conf: 0.8,
          reason: "เพิ่งโผล่วันแรกแต่ติดหลายโผพร้อมกัน",
        })
      }
    }

    // Q_EXIT จากพอร์ตที่เปิดอยู่ (ก่อนรัน)
    // ---- Bayesian stop layer (Zambelli): ทำงานเมื่อ policy adopt bayes arm เท่านั้น ----
    //   ถือต่อเมื่อ EV_hold > 0 · ปิดเมื่อ ≤ 0 หรือ dd ≥ s_live = 0.85·s* · pL > 0.60 → tighten
    //   (dd = 0 = ยังไม่ติดลบ → ใช้กฎ legacy ปกติ) — policy = fixed10 / ไม่มีข้อมูล → legacy ทั้งหมด
    // ---- กฎปิดที่ตัดสินเมื่อ 2026-09-23 (src/lib/jev/exit.ts · docs/research/methodology.md) ----
    //   ไม่มีราคาติดกัน ≥ NO_PRICE_EXIT_DAYS วันทำการ → exit ที่ราคาปิดล่าสุดที่มี (Trade บันทึกด้วยราคานั้น)
    //   ถือครบ TH.holdDefault วันทำการ → time exit (ตรง runBacktest) — ใช้หลังกฎอื่น: exit ของ Bayes/legacy
    //   คงเหตุผลเดิม (stop มาก่อน time) · hold/tighten ที่ครบกำหนด → exit · ไม่มีราคาวันนี้ → ยังออกไม่ได้
    const stopPolicy = await readStopPolicy().catch(() => null)
    let bayesPost: Posterior | null = null
    if (
      stopPolicy?.adopted &&
      (stopPolicy.arm === "bayesT" || stopPolicy.arm === "bayesR")
    ) {
      try {
        const bp = await getBucketPosteriors("pooled")
        bayesPost = stopPolicy.arm === "bayesR" ? bp.postR : bp.postT
        if (bayesPost.nTrades === 0) bayesPost = null
      } catch {
        bayesPost = null
      }
    }
    const posRows = await db.position.findMany()
    const posSymbols = new Set(posRows.map((p) => p.symbol))
    // คำสั่งที่ยังรอเติม (เช่นมนุษย์อนุมัติหลังข้อมูลวันนี้เข้า → เติมวันทำการถัดไป) = ภาระผูกพัน:
    // นับในงบ slots / sector layer / กันซื้อซ้ำ แต่ไม่ใช่สถานะ (ไม่ประเมิน exit ไม่นับใน exposure/NAV)
    const pendingOrders = await readPendingFills()
    const pendingSymbols = new Set(pendingOrders.map((o) => o.symbol))
    const committed = [
      ...posRows.map((p) => ({ symbol: p.symbol, slots: p.slots })),
      ...pendingOrders.map((o) => ({ symbol: o.symbol, slots: o.slots })),
    ]
    const usedStart = committed.reduce((a, p) => a + p.slots, 0)
    const latestSet = byDate.get(latest) ?? new Set<string>()
    const exitDecs: Dec[] = []
    for (const p of posRows) {
      const lp = lastPxOf(p.symbol)
      // วันทำการที่ถือแล้วตามปฏิทินข้อมูล (index วันล่าสุด − index วันเข้า) — นิยามเดียวกับ `i − ei` ของ runBacktest
      const eiPos = pivot.dateIdx.get(p.entryDate)
      const heldDays = pi !== undefined && eiPos !== undefined ? pi - eiPos : null
      let dec: Dec | null = null
      if (bayesPost && isFinite(lp)) {
        const dNow = Math.max(0, 1 - lp / p.entryPx)
        if (dNow > 0.005) {
          const lv = liveExit(bayesPost, dNow)
          const bs = liveBackstop(bayesPost)
          const evTxt = lv.evHold !== null ? (lv.evHold * 100).toFixed(2) : "—"
          const pLTxt = lv.pL !== null ? lv.pL.toFixed(2) : "—"
          const bsTxt = bs !== null ? `${(bs * 100).toFixed(1)}%` : "—"
          if (dNow >= 0.25 || (bs !== null && dNow >= bs) || lv.exit) {
            dec = {
              question: "Q_EXIT",
              target: p.symbol,
              action: "exit",
              conf: 0.85,
              reason: `bayes: dd=${(dNow * 100).toFixed(1)}% EV_hold=${evTxt}% pL=${pLTxt} ≥ s_live=${bsTxt} [${stopPolicy?.arm}] → ออก`,
            }
          } else if ((lv.pL ?? 0) > 0.6) {
            dec = {
              question: "Q_EXIT",
              target: p.symbol,
              action: "tighten",
              conf: 0.8,
              reason: `bayes: โอกาสแพ้สูง pL=${pLTxt} EV_hold=${evTxt}% [${stopPolicy?.arm}] เลื่อน stop ล็อกกำไร`,
            }
          } else {
            dec = {
              question: "Q_EXIT",
              target: p.symbol,
              action: "hold",
              conf: 0.6,
              reason: `bayes: dd=${(dNow * 100).toFixed(1)}% EV_hold=${evTxt}% pL=${pLTxt} > 0 [${stopPolicy?.arm}] → ถือต่อ`,
            }
          }
        }
      }
      if (!dec) {
        // กฎ legacy (src/lib/jev/exit.ts): ไม่มีราคา → ไม่มีราคาติดกัน ≥ 10 วันทำการ = exit ที่ราคาปิดล่าสุด
        // ไม่งั้น hold พร้อมราคาล่าสุดที่มีจริง · หลุด stop ที่บันทึกไว้ → exit · กำไร > 25% → exit
        // · หลุดโผ & กำไร → tighten · ≤ −6% → exit · อื่น ๆ → hold
        const si = pivot.symIdx.get(p.symbol)
        const noPriceDays = !isFinite(lp) && si !== undefined && pi !== undefined ? noPriceStreak(pivot.px, si, pi) : null
        dec = legacyExitDecision(
          p,
          lp,
          latestSet.has(p.symbol),
          isFinite(lp) ? null : lastKnownOf(p.symbol),
          noPriceDays
        )
      }
      // time exit (TH.holdDefault — config-as-data) หลังกฎอื่นทั้งหมด: stop/Bayes exit มาก่อน
      exitDecs.push(applyTimeExit(dec, heldDays, TH.holdDefault, isFinite(lp)))
    }

    // ---------- 3) orchestrate (PAPER mode: ทุก decision ลง Decision source='lite') ----------
    await db.pendingGate.updateMany({
      where: { status: "pending", date: { lt: latest } },
      data: { status: "expired" },
    })

    const executed: Dec[] = []
    const gated: (Dec & { id: number })[] = []
    const blocked: Dec[] = []
    const queued: PendingFillRow[] = []
    let used = usedStart
    // ยุคข้อมูลตอนส่งคำสั่ง (ถามครั้งเดียวเมื่อมีคำสั่งแรก)
    let epochMemo: { v: number | null } | null = null
    const epochNow = async () => (epochMemo ??= { v: await currentEpochId() }).v
    let riskBlocked = 0
    let shadowLogged = 0
    let reversalHits = 0
    let reversalQueued = 0

    const logDecision = async (d: Dec, ok: boolean, source: string = "lite") => {
      await db.decision.create({
        data: {
          date: latest,
          question: d.question,
          target: d.target,
          action: d.action,
          conf: d.conf,
          reason: d.reason,
          executed: ok,
          source,
        },
      })
    }

    // Q_REGIME ก่อนเสมอ (log อย่างเดียว) — v2 ใช้ composite score ต่อเนื่อง
    await logDecision(
      marketNow
        ? {
            question: "Q_REGIME",
            target: "market",
            action: regimeAction,
            conf: regimeConf,
            reason: `composite=${marketNow.regimeScore.toFixed(2)} gross×${marketNow.grossMult.toFixed(2)} breadthZ=${marketNow.breadthZ.toFixed(2)} volPct=${marketNow.volPct.toFixed(2)} overlapZ=${marketNow.overlapZ.toFixed(2)} crossZ=${marketNow.crossZ.toFixed(2)} budget=${slotBudget}/${MAX_SLOTS} slots${calPart}`,
          }
        : {
            question: "Q_REGIME",
            target: "market",
            action: regime.action,
            conf: regime.conf,
            reason: `repeat_z=${regime.repeatZ} mkt20d=${regime.mktMom20} (legacy)${calPart}`,
          },
      false
    )

    // Q_ENTRY — pre-checks: risk filters (v2 เปิดเสมอ) → มีสถานะอยู่แล้ว / regime / งบ slots
    const buyCands: {
      dec: Dec
      base: number
      sd: StockDay | null
      src?: "lite" | "reversal"
      stopPct?: number
    }[] = []
    for (const dec of entryDecs) {
      if (dec.action !== "buy") {
        // watch / ignore → log อย่างเดียว
        await logDecision(dec, false)
        continue
      }
      const sd = sdBySym.get(dec.target)

      // ---- Risk filters (เปิดเสมอ ไม่ขึ้นกับ flag — กันขาดทุน ไม่ต้องมี alpha) ----
      if (sd && sd.mfd > GATES.blockMfd) {
        const blockedDec: Dec = {
          ...dec,
          action: "watch",
          reason: `${dec.reason} | risk filter: distribution MFD=${sd.mfd.toFixed(2)} > ${GATES.blockMfd} (ราคาขึ้นแต่เงินออก)`,
        }
        await logDecision(blockedDec, false)
        blocked.push(blockedDec)
        riskBlocked++
        continue
      }
      // sectorRank 1 = sector แรงสุด → "2 กลุ่มท้าย" คือ rank > nSec − 2 (เกณฑ์เดียวกับ G3 ของ flagship/funnel.ts)
      const nSec = panel?.sectors.length ?? 0
      if (sd && nSec > GATES.blockSectorBottom && sd.sectorRank > nSec - GATES.blockSectorBottom && sd.rotZ < 0) {
        const blockedDec: Dec = {
          ...dec,
          action: "watch",
          reason: `${dec.reason} | risk filter: sector เงินไหลออก (rank=${sd.sectorRank}/${nSec} rotZ=${sd.rotZ.toFixed(2)})`,
        }
        await logDecision(blockedDec, false)
        blocked.push(blockedDec)
        riskBlocked++
        continue
      }

      // ---- A/B shadow: log การตัดสินใจฉบับ v2 คู่ขนานเสมอ (source='lite+v2-shadow') ----
      if (sd) {
        const boost = v2Alpha && promoted.has("mfd") && sd.mfd < GATES.boostMfd
        await db.decision.create({
          data: {
            date: latest,
            question: "Q_ENTRY",
            target: dec.target,
            action: "buy",
            conf: Math.min(1, Math.max(0, (sd.score + 1) / 2)),
            reason: `v2 shadow: score=${sd.score.toFixed(2)} mfd=${sd.mfd.toFixed(2)} sec=${sd.sectorRank} vol=${(sd.symVolPct * 100).toFixed(0)}%${boost ? ` boost×${GATES.boostMult}` : ""}`,
            executed: false,
            source: "lite+v2-shadow",
          },
        })
        shadowLogged++
      }

      if (posSymbols.has(dec.target)) {
        await logDecision({ ...dec, reason: `${dec.reason} (มีสถานะอยู่แล้ว)` }, false)
      } else if (pendingSymbols.has(dec.target)) {
        await logDecision({ ...dec, reason: `${dec.reason} (มีคำสั่งรอเติม T+1 อยู่แล้ว)` }, false)
      } else if (regimeAction === "risk_off" || dec.conf < TH_CONF.Q_ENTRY || used >= slotBudget) {
        const downgraded: Dec = { ...dec, action: "watch" }
        await logDecision(downgraded, false)
        blocked.push(downgraded)
      } else {
        buyCands.push({ dec, base: dec.conf >= 0.85 ? 1.0 : 0.5, sd: sd ?? null })
      }
    }

    // ---------- Snap-back reversal candidates (H2, config_th.reversalEnabled) ----------
    // สแกนทุกหุ้นที่มีราคาวันล่าสุด (สัญญาณกลับตัวเกิดกับหุ้นที่ย่อลึก — มักไม่อยู่ในโผโมเมนตัม)
    // เข้า human-gate/pending flow เดียวกับ entry อื่น ๆ (ไม่ bypass PendingGate)
    // + cap ขนาดรวมไม่ให้ slot budget เกิน (คิวซื้อหลักได้สิทธิ์ก่อน ส่วนที่เหลือเท่านั้น)
    if (TH.reversalEnabled) {
      try {
        const revInputs = await snapbackInputsForDate(latest)
        const revRoom = slotBudget - usedStart // งบคงเหลือโดยประมาณ (ก่อน exit รอบนี้ — conservative)
        let revSlots = 0
        for (const [sym, inp] of revInputs) {
          if (stat.has(sym) || posSymbols.has(sym) || pendingSymbols.has(sym)) continue // ติดโผ / มีสถานะ / มีคำสั่งรอเติมอยู่แล้ว
          const lp = lastPxOf(sym)
          if (!isFinite(lp) || lp <= 1) continue // นิยามเดียวกับ research: close > 1
          const sb = snapback(inp)
          if (!sb) continue
          reversalHits++
          const base = sb.conf >= 0.85 ? 1.0 : 0.5
          const dec: Dec = {
            question: "Q_ENTRY",
            target: sym,
            action: "buy",
            conf: Math.round(sb.conf * 100) / 100,
            reason: JSON.stringify({
              engine: "snapback",
              exitWhen: sb.exitWhen,
              stop: sb.stop,
              hold: sb.hold,
              holdDefault: TH.holdDefault,
              zRet5: Math.round(inp.zRet5 * 100) / 100,
              turnoverPct: Math.round(inp.turnoverPct * 1000) / 1000,
              mfd: Math.round(inp.mfd * 100) / 100,
            }),
          }
          if (revSlots + base > revRoom + 1e-9) {
            // cap: งบ slots เต็ม → บันทึก watch ไว้ก่อน (ไม่เข้าคิวซื้อ)
            const capped: Dec = {
              ...dec,
              action: "watch",
              reason: `${dec.reason} | งบ slots เต็ม (budget=${slotBudget})`,
            }
            await logDecision(capped, false, "reversal")
            blocked.push(capped)
            continue
          }
          revSlots += base
          reversalQueued++
          buyCands.push({ dec, base, sd: sdBySym.get(sym) ?? null, src: "reversal", stopPct: sb.stop })
        }
      } catch {
        // reversal scan ล้มเหลว = ข้าม (ไม่กระทบการตัดสินใจหลัก)
      }
    }

    // v2 alpha: เรียงคิวซื้อด้วย meta-score (ต่อเมื่อสัญญาณผ่าน IC)
    if (v2Alpha) buyCands.sort((a, b) => (b.sd?.score ?? -Infinity) - (a.sd?.score ?? -Infinity))

    // ขนาดจริงที่จะซื้อ (risk_on เท่านั้น) คำนวณ "ก่อน" sector layer — เดิมคูณ boost/meta หลังผ่าน
    // constraint ทำให้ขยายเกิน cap/งบที่เพิ่งตรวจ · neutral ส่ง human gate ด้วยขนาดฐานเหมือนเดิม
    // v2 sizing: vol regime หดไซส์เสมอ (risk), boost เฉพาะสัญญาณที่ผ่าน IC (alpha) + meta-model sizing
    const sizing = new Map<
      string,
      { want: number; volMult: number; boostMult: number; p: number | null; mult: number }
    >()
    if (regimeAction === "risk_on") {
      for (const c of buyCands) {
        const sd = c.sd
        const volMult = sd ? GATES.volSizeMult(sd.symVolPct) : 1
        const boostMult =
          v2Alpha && sd && promoted.has("mfd") && sd.mfd < GATES.boostMfd ? GATES.boostMult : 1
        const meta = entryMeta.get(c.dec.target)
        let p: number | null = null
        if (meta) {
          // โมเดล meta ใช้ไม่ได้ (throw/NaN) = ไม่มี meta sizing — ไม่ล้มทั้งรอบหลัง log ไปแล้วครึ่งทาง
          p = await liveMetaProbability({
            symbol: c.dec.target,
            date: latest,
            nTf: meta.nTf,
            streak: meta.streak,
          }).catch(() => null)
          if (p !== null && !Number.isFinite(p)) p = null
        }
        const mult = p !== null ? metaSizeMultiplier(p) : 1
        const want = Math.round(Math.min(1.5, c.base * volMult * boostMult * mult) * 100) / 100
        sizing.set(c.dec.target, { want, volMult, boostMult, p, mult })
      }
    }

    // Sector constraints: จำลองการรับ candidate ทีละตัวบนพอร์ตเดิม + คำสั่งที่รอเติม
    // (จำนวนชื่อ/sector ≤ 3 → งบ slotBudget → น้ำหนัก sector ≤ 30% → น้ำหนักกลุ่ม ≤ cap กลุ่ม)
    let constraint: SectorConstraintResult = {
      accepted: [],
      downsized: [],
      rejected: [],
      sectorExposure: [],
      groupExposure: [],
    }
    if (buyCands.length > 0) {
      constraint = applySectorConstraints(
        buyCands.map((c) => ({ symbol: c.dec.target, slots: sizing.get(c.dec.target)?.want ?? c.base })),
        committed,
        sectorMap,
        { maxSlots: slotBudget }
      )
    }
    const candBySymbol = new Map(buyCands.map((c) => [c.dec.target, c]))
    const acceptedBySymbol = new Map(constraint.accepted.map((a) => [a.symbol, a]))
    const downsizeBySymbol = new Map(constraint.downsized.map((d) => [d.symbol, d]))
    const allowedSymbols = new Set([
      ...constraint.accepted.map((a) => a.symbol),
      ...constraint.downsized.map((d) => d.symbol),
    ])

    // ถูก sector layer ตัด → downgrade เป็น watch พร้อมเหตุผลเชิงความเสี่ยง
    for (const rej of constraint.rejected) {
      const c = candBySymbol.get(rej.symbol)
      // reversal: คง reason JSON {engine:'snapback',...} ไว้ท้ายแถวที่ถูก sector layer ตัด
      const reason = c?.src === "reversal" ? `${rej.reason} | ${c.dec.reason}` : rej.reason
      const dec: Dec = {
        question: "Q_ENTRY",
        target: rej.symbol,
        action: "watch",
        conf: c?.dec.conf ?? 0.5,
        reason,
      }
      await logDecision(dec, false, c?.src ?? "lite")
      blocked.push(dec)
    }

    // ผ่าน sector layer → เดินตาม regime (composite) — risk_on ซื้อ / neutral gate
    for (const c of buyCands) {
      if (!allowedSymbols.has(c.dec.target)) continue
      const dec = c.dec
      const sd = c.sd
      const src = c.src ?? "lite"
      const down = downsizeBySymbol.get(dec.target)
      // ขนาดที่ sector layer อนุมัติจริง (accepted อาจถูกจำกัดด้วยพื้นที่พอร์ต — ห้ามย้อนกลับไปใช้ c.base)
      const base = down ? down.slots : (acceptedBySymbol.get(dec.target)?.slots ?? c.base)
      const downPart = down ? ` | ${down.reason}` : ""
      if (regimeAction === "neutral") {
        // gate reason นำด้วยเหตุผลการลดขนาด (ถ้ามี) ตามด้วยเหตุผลสัญญาณเดิม
        const reason = down ? `${down.reason} | ${dec.reason}` : dec.reason
        const gate = await db.pendingGate.create({
          data: {
            date: latest,
            question: dec.question,
            target: dec.target,
            action: "buy",
            conf: dec.conf,
            reason,
          },
        })
        await logDecision({ ...dec, reason }, false, src)
        gated.push({ ...dec, reason, id: gate.id })
      } else if (regimeAction !== "risk_on") {
        // defensive (risk_off ถูกกรองใน pre-check แล้ว)
        const downgraded: Dec = { ...dec, action: "watch" }
        await logDecision(downgraded, false, src)
        blocked.push(downgraded)
      } else {
        // risk_on → สั่งซื้ออัตโนมัติ (vol-aware sizing + alpha boost + meta-model sizing)
        // T+1: ส่งคำสั่งเข้าคิว เติมที่ราคาปิดวันทำการถัดไป (รอบหน้า) — ราคาปิดวันนี้ซื้อไม่ได้จริงหลังเห็นสัญญาณ EOD
        const lastPx = lastPxOf(dec.target)
        if (!isFinite(lastPx)) {
          await logDecision({ ...dec, reason: `${dec.reason} (ราคาไม่พร้อม)` }, false, src)
        } else {
          // ขนาด = ที่ sector layer อนุมัติ (คำนวณ vol/boost/meta ไว้ก่อนเข้า constraint แล้ว)
          const sz = sizing.get(dec.target)
          const volMult = sz?.volMult ?? 1
          const boostMult = sz?.boostMult ?? 1
          const p = sz?.p ?? null
          const mult = sz?.mult ?? 1
          const slots = base
          const v2Part = sd
            ? ` v2[mfd=${sd.mfd.toFixed(2)} sec=${sd.sectorRank} vol×${volMult}${boostMult > 1 ? ` boost×${boostMult}` : ""}]`
            : ""
          const metaPart = p !== null ? ` meta_p=${p.toFixed(2)} ×${mult.toFixed(2)}` : ""
          // TH.holdDefault (config_th) — บันทึกลง reason ของ entry ที่ถือจริง (reversal มี hold ใน JSON แล้ว)
          const holdPart = src === "reversal" ? "" : ` hold=${TH.holdDefault}`
          const reason = `${dec.reason}${v2Part}${metaPart}${downPart}${holdPart}`
          // v2 stop: vol พุ่ง (pct > 0.8) → stop แคบลง ×0.8 · reversal ใช้ sb.stop (-8%)
          // บันทึก stop % + ตัวคูณของวันนี้ไว้กับคำสั่ง — ราคา stop คิดจากราคาเติม (T+1) ตอนเติม
          const stopMult = sd ? GATES.volStopMult(sd.symVolPct) : 1
          // ส่งคำสั่งไม่สำเร็จ (ข้อมูลคำสั่งไม่ถูกต้อง/คิวถูกแก้พร้อมกัน) = บันทึกเหตุผลแล้วไปต่อ — ไม่ทิ้งรอบครึ่งทาง
          // (รอบที่ล้มกลางทางจะถูก idempotency guard กันไม่ให้รันซ้ำ → คำสั่งที่เหลือหายเงียบ)
          const order = await enqueuePendingFill({
            symbol: dec.target,
            slots,
            stopPct: c.stopPct ?? TH_STRATEGY.stopPct,
            stopMult,
            source: src === "reversal" ? "reversal" : "auto",
            decisionDate: latest,
            afterDate: latest,
            gateId: null,
            conf: dec.conf,
            reason,
            maxSlots: slotBudget,
            epoch: await epochNow(),
          }).catch((e: Error) => e)
          if (order instanceof Error) {
            await logDecision({ ...dec, reason: `${reason} (ส่งคำสั่ง T+1 ไม่สำเร็จ: ${order.message})` }, false, src)
          } else if (!order) {
            await logDecision({ ...dec, reason: `${reason} (มีคำสั่งรอเติม T+1 อยู่แล้ว)` }, false, src)
          } else {
            pendingSymbols.add(dec.target)
            used += slots
            // executed=false: คำสั่งยังไม่ใช่การซื้อ — แถว "fill" วันเติมคือไม้เข้าจริงของ ledger/NAV
            await logDecision({ ...dec, reason: queuedDecisionReason(reason, order.id) }, false, src)
            queued.push(previewPendingFill(order, pivot))
          }
        }
      }
    }

    // Q_ESCALATE (กัน gate ซ้ำ)
    for (const dec of escalateDecs) {
      await logDecision(dec, false)
      const dupGate = await db.pendingGate.findFirst({
        where: { date: latest, question: dec.question, target: dec.target, action: dec.action, status: "pending" },
        select: { id: true },
      })
      if (!dupGate) {
        const gate = await db.pendingGate.create({
          data: {
            date: latest,
            question: dec.question,
            target: dec.target,
            action: dec.action,
            conf: dec.conf,
            reason: dec.reason,
          },
        })
        gated.push({ ...dec, id: gate.id })
      }
    }

    // Q_PAIRS — Pairs Stat-Arb scanner (alert-only: รอ human approve เสมอ)
    try {
      const [{ rows: pairRows }, sectorOfFn] = await Promise.all([loadAll(), loadSectorOf()])
      const scan = getCachedScan(await dataKey(), pairRows, sectorOfFn)
      const actionable = scan.pairs.filter((p) => p.action === "ENTER").slice(0, 3)
      for (const p of actionable) {
        const target = `${p.a}/${p.b}`
        const reason = `z=${p.z.toFixed(2)} hl=${p.hl.toFixed(0)}d corr=${p.corr.toFixed(2)} β=${p.beta.toFixed(2)} [${p.sector}] — dollar-neutral spread (ENTER |z|>2, TAKE |z|<0.5, STOP |z|>3.5)`
        await logDecision(
          { question: "Q_PAIRS", target, action: "spread-trade", conf: 0.7, reason },
          false
        )
        const dupGate = await db.pendingGate.findFirst({
          where: { date: latest, question: "Q_PAIRS", target, status: "pending" },
          select: { id: true },
        })
        if (!dupGate) {
          const gate = await db.pendingGate.create({
            data: {
              date: latest,
              question: "Q_PAIRS",
              target,
              action: "spread-trade",
              conf: 0.7,
              reason,
            },
          })
          gated.push({
            question: "Q_PAIRS",
            target,
            action: "spread-trade",
            conf: 0.7,
            reason,
            id: gate.id,
          })
        }
      }
    } catch {
      // pairs scan ล้มเหลว = ข้าม (ไม่กระทบการตัดสินใจหลัก)
    }

    // Q_EXIT
    let nTimeExit = 0
    let nNoPriceExit = 0
    for (const dec of exitDecs) {
      if ((dec.action === "exit" || dec.action === "tighten") && dec.conf >= TH_CONF.Q_EXIT) {
        if (dec.action === "exit") {
          const pos = posRows.find((p) => p.symbol === dec.target)
          if (pos) {
            // บันทึกเทรดที่ปิดเข้า Trade log → posterior ของ Bayesian stop เรียนรู้จากเทรดจริงของตัวเอง
            // หุ้นไม่มีราคาวันนี้ (บังคับปิดเพราะหยุดซื้อขาย) → บันทึกด้วยราคาปิดล่าสุดที่มี (วันออก = วันนี้)
            const noPxToday = !isFinite(lastPxOf(dec.target))
            await persistClosedTrade(pos, latest, regimeAction, { fillAtLastKnown: noPxToday }).catch(() => null)
            await db.position.deleteMany({ where: { symbol: dec.target } })
            posSymbols.delete(dec.target)
          }
          const kind = exitKind(dec)
          if (kind === "time") nTimeExit++
          else if (kind === "no_price") nNoPriceExit++
        } else {
          const pos = posRows.find((p) => p.symbol === dec.target)
          if (pos) await db.position.update({ where: { symbol: dec.target }, data: { stop: pos.entryPx * 1.02 } })
        }
        await logDecision(dec, true)
        executed.push(dec)
      } else {
        await logDecision(dec, false)
      }
    }

    const nQueued = queued.length
    const nExit = executed.filter((d) => d.question === "Q_EXIT").length

    // Sector exposure หลังปิดรอบ (พอร์ตสุดท้าย: เดิม + เติม T+1 − exit · คำสั่งที่รอเติมไม่ใช่สถานะ ไม่นับ)
    const finalPositions = await db.position.findMany()
    const finalItems = finalPositions.map((p) => ({ symbol: p.symbol, slots: p.slots }))
    const sectorExposure = computeSectorExposure(finalItems, sectorMap)
    const groupExposure = computeGroupExposure(finalItems, sectorMap)
    const sectorBreached = sectorExposure.filter((r) => r.breached).length
    const groupBreached = groupExposure.filter((r) => r.breached).length

    const v2Part = marketNow
      ? ` | v2: composite=${marketNow.regimeScore.toFixed(2)} gross×${marketNow.grossMult.toFixed(2)} riskBlocked=${riskBlocked} shadow=${shadowLogged}${v2Alpha ? ` alpha=[${[...promoted].join(",")}]` : " alpha=OFF"}`
      : ""
    const revPart = TH.reversalEnabled ? ` | rev: hits=${reversalHits} queued=${reversalQueued}` : ""
    // แยกนับ exit ตามกฎที่ตัดสินเมื่อ 2026-09-23 (แสดงเฉพาะเมื่อเกิด — message รอบปกติคงรูปเดิม)
    const exitKindsPart =
      nTimeExit + nNoPriceExit > 0 ? ` (time ${nTimeExit} · หยุดซื้อขาย ${nNoPriceExit})` : ""
    const message = `regime=${regimeAction} | สั่งซื้ออัตโนมัติ ${nQueued} (รอเติม T+1)${fillPart} | รออนุมัติ ${gated.length} | ถูก gate ${blocked.length} | exit ${nExit}${exitKindsPart}${v2Part}${revPart}`
    await emitEvent("jev_run", v2Alpha ? "jev_lite+v2" : "jev_lite", {
      date: latest,
      rules,
      regime: regimeAction,
      conf: regimeConf,
      // คำสั่งซื้ออัตโนมัติที่ส่งเข้าคิว T+1 รอบนี้ (ยังไม่ใช่สถานะ) · filledT1/cancelledT1 = ผลเติมคำสั่งค้างตอนเริ่มรอบ
      autoBuy: nQueued,
      filledT1: fills.filled.length,
      cancelledT1: fills.cancelled.length,
      gated: gated.length,
      blocked: blocked.length,
      exit: nExit,
      timeExit: nTimeExit,
      noPriceExit: nNoPriceExit,
      sectorRejected: constraint.rejected.length,
      sectorDownsized: constraint.downsized.length,
      sectorBreached,
      groupBreached,
      v2: marketNow
        ? {
            composite: marketNow.regimeScore,
            grossMult: marketNow.grossMult,
            slotBudget,
            riskBlocked,
            shadowLogged,
            promoted: [...promoted],
            alphaOn: v2Alpha,
          }
        : null,
      th: {
        holdDefault: TH.holdDefault,
        calendarOverlay: TH.calendarOverlay,
        reversalEnabled: TH.reversalEnabled,
        reversalHits,
        reversalQueued,
      },
    })

    const resp: JevRunResponse = {
      date: latest,
      regime: regimeAction,
      message,
      executed: [...fillStep.executed, ...executed],
      gated,
      blocked,
      sectorExposure,
      groupExposure,
      queued,
      fills,
      pendingFills: await previewPendingFills(),
    }
    // Task 9-c honesty: config-as-data ที่รอบนี้ใช้ (JevRunResponse เป็น closed type ใน contracts.ts
    // — กระจาย object แล้วเติมฟิลด์ config ตอน serialize แทนการแก้ contracts)
    return NextResponse.json({ ...resp, config: configSummary })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
