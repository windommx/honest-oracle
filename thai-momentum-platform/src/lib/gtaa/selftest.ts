// Self-test invariant suite — เครื่องมือวัดความน่าเชื่อถือของ engine แบบฝังใน
// ทุกข้อเป็น closed-form / invariant ที่พิสูจน์ความถูกต้องของกฎ ไม่ใช่การเดาผล

import { backtestReturns, runBacktest } from "./backtest"
import { retK, smaAt } from "./math"
import { computeMonthSignals } from "./signals"
import { blockBootstrap } from "./montecarlo"
import { runWalkForward } from "./walkforward"
import { computeMacroState, monthDiff, nextMonthLabel } from "./macro"
import { evaluateTracking, type StoredSignalLike } from "./tracking"
import { ALL_ASSETS, GTAA_UNIVERSE } from "./defaults"
import { DEFAULT_GTAA_CONFIG, type GtaaConfig, type GtaaPanel, type SelfTestResult } from "./types"
import { monthLabels } from "./synthetic"

/** สร้าง mini panel จากสเปคซีรีส์ — ใช้ในเทส */
function miniPanel(specs: Record<string, number[]>, notes: string[] = []): GtaaPanel {
  const n = Math.max(...Object.values(specs).map((s) => s.length))
  const closes: Record<string, (number | null)[]> = {}
  for (const [ticker, series] of Object.entries(specs)) {
    closes[ticker] = Array.from({ length: n }, (_, i) => series[i] ?? null)
  }
  return {
    meta: { source: "synthetic", seed: 0, fetchedAt: new Date().toISOString(), notes },
    dates: monthLabels(n),
    assets: ALL_ASSETS,
    closes,
  }
}

/** สร้างซีรีส์ราคาจากอัตราผลตอบแทนรายเดือน */
function seriesFrom(returns: number[], start = 100): number[] {
  const out = [start]
  let p = start
  for (const r of returns) {
    p *= 1 + r
    out.push(p)
  }
  return out
}

const BIL_RET = 0.0016

export function runSelfTests(): SelfTestResult[] {
  const results: SelfTestResult[] = []
  const add = (id: string, name: string, pass: boolean, detail: string) =>
    results.push({ id, name, pass, detail })

  // 1) ไม่มี look-ahead: (ก) สินทรัพย์ +1%/เดือน คงที่ ต้อง compound เป๊ะ 1.01^n
  //    (ข) กับดัก: เดือน crash −20% ที่ไม่มีสัญญาณล่วงหน้า — engine ที่ไม่แอบดูอนาคตต้องกินเต็ม ๆ
  //        (ซีรีส์คงที่อย่างเดียวจับ look-ahead ไม่ได้ เพราะผลตอบแทนทุกเดือนเท่ากัน)
  {
    const n = 60
    const risky = seriesFrom(Array(n).fill(0.01))
    const bil = seriesFrom(Array(n).fill(BIL_RET))
    const spy = seriesFrom(Array(n).fill(0.01))
    const panel = miniPanel({ VTV: risky, BIL: bil, SPY: spy })
    const cfg: GtaaConfig = { ...DEFAULT_GTAA_CONFIG, topN: 1, smaMonths: 3, skipMonths: 0, costBps: 0, tranches: 1 }
    const { strat } = backtestReturns(panel, cfg)
    const expected = Math.pow(1.01, strat.length)
    const got = strat.reduce((a, b) => a * (1 + b), 1)
    const err = Math.abs(got / expected - 1)

    const crashAt = 40 // closes[40] = closes[39] × 0.8 — ตัดสินใจที่ปิดเดือน 39 ยังเห็นแต่ขาขึ้น
    const trap = seriesFrom(Array.from({ length: n }, (_, k) => (k === crashAt - 1 ? -0.2 : 0.01)))
    const trapRun = backtestReturns(miniPanel({ VTV: trap, BIL: bil, SPY: spy }), cfg)
    const crashRet = trapRun.strat[crashAt - 1 - trapRun.startIdx]
    const trapOk = crashRet !== undefined && Math.abs(crashRet - -0.2) < 1e-9
    add(
      "no-lookahead",
      "ไม่มี look-ahead — +1%/เดือน คงที่ต้อง compound เป็น 1.01^n เป๊ะ และเดือน crash ที่ยังไม่รู้ล่วงหน้าต้องโดนเต็ม −20%",
      err < 1e-9 && trapOk,
      `ผลลัพธ์ ${got.toFixed(8)} vs คำตอบปิดรูป ${expected.toFixed(8)} (คลาดเคลื่อน ${(err * 100).toExponential(2)}%) · เดือน crash = ${crashRet !== undefined ? (crashRet * 100).toFixed(2) : "—"}% (ต้อง −20.00%)`,
    )
  }

  // 2) trend gate: ราคาลง monotone ต้องไม่ถูกเลือกเลย (ทั้งหมดไปเงินสด)
  {
    const n = 40
    const risky = Array.from({ length: n }, (_, i) => 100 * Math.pow(0.97, i))
    const bil = seriesFrom(Array(n).fill(BIL_RET))
    const spy = risky
    const panel = miniPanel({ VTV: risky, BIL: bil, SPY: spy })
    const cfg: GtaaConfig = { ...DEFAULT_GTAA_CONFIG, topN: 1, smaMonths: 10, costBps: 0 }
    const { strat } = backtestReturns(panel, cfg)
    const maxDev = Math.max(...strat.map((r) => Math.abs(r - BIL_RET)))
    add(
      "trend-gate",
      "SMA filter — หุ้นขาลง monotone ต้องโดนเตะไปเงินสดทุกเดือน",
      strat.length > 0 && maxDev < 1e-9, // strat ว่าง → Math.max() = −Infinity จะผ่านแบบไม่ได้ทดสอบอะไร
      `ผลตอบแทนทุกเดือนเบี่ยงจาก BIL มากสุด ${(maxDev * 100).toExponential(1)}%`,
    )
  }

  // 3) crash → cash: MaxDD ของกลยุทธ์ต้องเบากว่าถือตายตัวชัดเจน
  {
    const up = Array(50).fill(0.01)
    const crash = Array(40).fill(-0.06)
    const risky = seriesFrom([...up, ...crash])
    const bil = seriesFrom(Array(90).fill(BIL_RET))
    const spy = risky
    const panel = miniPanel({ VTV: risky, BIL: bil, SPY: spy })
    const cfg: GtaaConfig = { ...DEFAULT_GTAA_CONFIG, topN: 1, smaMonths: 10, costBps: 0 }
    const bt = runBacktest(panel, cfg)
    const buyHoldDD = Math.pow(0.94, 40) - 1
    add(
      "crash-to-cash",
      "crash → cash — กลยุทธ์ออกไปเงินสดหลังเทรนด์แตก MaxDD ต้องเบากว่าถือตายตัวมาก",
      bt.stats.maxDD > -0.55 && buyHoldDD < -0.85 && bt.stats.maxDD > buyHoldDD,
      `MaxDD กลยุทธ์ ${(bt.stats.maxDD * 100).toFixed(1)}% vs ถือตายตัว ${(buyHoldDD * 100).toFixed(1)}%`,
    )
  }

  // 4) ต้นทุน: CAGR ที่ cost 50bps < cost 0 เสมอ บนพาเนลเดียวกัน
  {
    const panel = miniPanel({
      VTV: seriesFrom(Array.from({ length: 200 }, (_, i) => 0.008 + 0.02 * Math.sin(i / 5))),
      EFA: seriesFrom(Array.from({ length: 200 }, (_, i) => 0.006 + 0.02 * Math.sin(i / 7 + 1))),
      GLD: seriesFrom(Array.from({ length: 200 }, (_, i) => 0.005 + 0.018 * Math.sin(i / 4 + 2))),
      TLT: seriesFrom(Array.from({ length: 200 }, (_, i) => 0.003 + 0.015 * Math.sin(i / 6 + 3))),
      BIL: seriesFrom(Array(200).fill(BIL_RET)),
      SPY: seriesFrom(Array.from({ length: 200 }, (_, i) => 0.007 + 0.03 * Math.sin(i / 9))),
    })
    const cfg0: GtaaConfig = { ...DEFAULT_GTAA_CONFIG, costBps: 0, topN: 2, smaMonths: 8 }
    const cfg50: GtaaConfig = { ...cfg0, costBps: 50 }
    const r0 = runBacktest(panel, cfg0)
    const r50 = runBacktest(panel, cfg50)
    add(
      "costs-monotonic",
      "ต้นทุนเทรด — CAGR ที่ cost 50bps ต้องต่ำกว่า cost 0 บนพาเนลเดียวกัน",
      r0.stats.cagr > r50.stats.cagr,
      `CAGR cost 0 = ${(r0.stats.cagr * 100).toFixed(2)}% · cost 50bps = ${(r50.stats.cagr * 100).toFixed(2)}% (ห่าง ${((r0.stats.cagr - r50.stats.cagr) * 100).toFixed(2)}pp)`,
    )
  }

  // 5) น้ำหนักรวม = 1 ทุกเดือน (สินทรัพย์ + เงินสด)
  {
    const panel = miniPanel({
      VTV: seriesFrom(Array.from({ length: 80 }, (_, i) => 0.01 * Math.sin(i / 3) + 0.004)),
      EFA: seriesFrom(Array.from({ length: 80 }, (_, i) => 0.012 * Math.sin(i / 4) + 0.003)),
      BIL: seriesFrom(Array(80).fill(BIL_RET)),
      SPY: seriesFrom(Array.from({ length: 80 }, (_, i) => 0.008 * Math.sin(i / 5) + 0.004)),
    })
    const cfg: GtaaConfig = { ...DEFAULT_GTAA_CONFIG, topN: 1, smaMonths: 10 }
    let worst = 0
    for (let t = 14; t < 78; t++) {
      const s = computeMonthSignals(panel, t, cfg)
      const sum = Object.values(s.weights).reduce((a, b) => a + b, 0)
      worst = Math.max(worst, Math.abs(sum - 1))
      for (const w of Object.values(s.weights)) {
        if (w < -1e-12) worst = 99
      }
    }
    add(
      "weights-sum",
      "น้ำหนักสินทรัพย์ + เงินสด รวม = 100% ทุกเดือน และไม่ติดลบ",
      worst < 1e-9,
      `ผลรวมเบี่ยงจาก 1 มากสุด ${(worst * 100).toExponential(1)}%`,
    )
  }

  // 6) momentum 12-1 closed form: r12 ที่ skip=1 = c[t-1]/c[t-13] - 1
  {
    const closes = Array.from({ length: 25 }, (_, i) => 100 + i * 1.3)
    const t = 20
    const got = retK(closes, t, 12, 1)
    const expected = closes[t - 1] / closes[t - 13] - 1
    add(
      "momentum-12-1",
      "Momentum 12-1 (skip 1 เดือน) ตรงคำตอบปิดรูป c[t-1]/c[t-13]−1",
      got !== null && Math.abs(got - expected) < 1e-12,
      `r12 = ${((got ?? 0) * 100).toFixed(6)}% vs คำตอบปิดรูป ${(expected * 100).toFixed(6)}%`,
    )
  }

  // 7) SMA closed form — closes = [1..20], t=9 (ค่า 10), n=5 → หน้าต่าง [6..10] เฉลี่ย = 8
  {
    const closes = Array.from({ length: 20 }, (_, i) => i + 1)
    const got = smaAt(closes, 9, 5)
    const expected = (6 + 7 + 8 + 9 + 10) / 5
    add(
      "sma-closed-form",
      "SMA ตรงค่าเฉลี่ยเลขคณิตของ 5 เดือนสุดท้าย",
      got === expected,
      `SMA = ${got} vs ${expected}`,
    )
  }

  // 8) walk-forward: หน้าต่าง OOS เรียงเวลาและไม่ทับกัน
  {
    const panel = miniPanel({
      VTV: seriesFrom(Array.from({ length: 160 }, (_, i) => 0.009 + 0.03 * Math.sin(i / 8))),
      EFA: seriesFrom(Array.from({ length: 160 }, (_, i) => 0.007 + 0.028 * Math.sin(i / 6 + 2))),
      BIL: seriesFrom(Array(160).fill(BIL_RET)),
      SPY: seriesFrom(Array.from({ length: 160 }, (_, i) => 0.008 + 0.035 * Math.sin(i / 7 + 1))),
    })
    const wf = runWalkForward(panel, DEFAULT_GTAA_CONFIG)
    let okWindows = wf.windows.length >= 5
    let detail = `${wf.windows.length} หน้าต่าง`
    if (okWindows) {
      for (let i = 1; i < wf.windows.length; i++) {
        const prev = wf.windows[i - 1]
        const cur = wf.windows[i]
        if (cur.oosStart <= prev.oosEnd) {
          okWindows = false
          detail += " — เจอหน้าต่าง OOS ทับกัน!"
          break
        }
      }
      if (okWindows) detail += " — เรียงเวลา ไม่ทับกัน ✅"
    }
    add("walkforward-windows", "Walk-forward — หน้าต่าง OOS ไม่ทับกันและเรียงตามเวลา", okWindows, detail)
  }

  // 9) Monte Carlo deterministic ต่อ seed
  {
    const returns = Array.from({ length: 120 }, (_, i) => 0.008 + 0.03 * Math.sin(i / 5))
    const a = blockBootstrap(returns, 120, 6, 777)
    const b = blockBootstrap(returns, 120, 6, 777)
    const same = Math.abs(a.cagr.p50 - b.cagr.p50) < 1e-12 && Math.abs(a.maxDD.p50 - b.maxDD.p50) < 1e-12
    add(
      "mc-deterministic",
      "Monte Carlo deterministic ต่อชุด seed (รันซ้ำได้ผลเดิมเป๊ะ)",
      same,
      `p50 CAGR รอบ 1/2 = ${(a.cagr.p50 * 100).toFixed(6)}% / ${(b.cagr.p50 * 100).toFixed(6)}%`,
    )
  }

  // 10) cashMode trendedBond — เงินสดที่ปลดล็อกจากตัวสอบตก ต้องไป IEF เมื่อ IEF ยืนเหนือ SMA ตัวเอง ไม่งั้น BIL
  {
    const n = 40
    const strong = seriesFrom(Array(n).fill(0.015)) // VTV แรงสุด
    const mild = seriesFrom(Array(n).fill(0.004)) // GLD ผ่านเทรนด์ แต่คะแนนรอง
    const iefDown = Array.from({ length: n }, (_, i) => 100 * Math.pow(0.985, i)) // IEF ขาลง → FAIL
    const iefUp = seriesFrom(Array(n).fill(0.003)) // IEF ขาขึ้น → PASS เทรนด์ของตัวเอง

    const cfg: GtaaConfig = { ...DEFAULT_GTAA_CONFIG, cashMode: "trendedBond", topN: 4, smaMonths: 10 }

    // กรณี A: IEF หลุด SMA ตัวเอง → pool = {VTV, GLD} → เงินสด 2/4 ต้องไป BIL
    const panelA = miniPanel({ VTV: strong, GLD: mild, IEF: iefDown, BIL: seriesFrom(Array(n).fill(BIL_RET)), SPY: strong })
    const a = computeMonthSignals(panelA, n - 2, cfg)
    const wentBil = a.cashTicker === "BIL" && Math.abs((a.weights["BIL"] ?? 0) - 1 / 2) < 1e-9 && (a.weights["IEF"] ?? 0) === 0

    // กรณี B: IEF ผ่านเทรนด์ → pool = {VTV, GLD, IEF} → เงินสด 1/4 ไปหา IEF (รวม slot ถือ = 1/2)
    const panelB = miniPanel({ VTV: strong, GLD: mild, IEF: iefUp, BIL: seriesFrom(Array(n).fill(BIL_RET)), SPY: strong })
    const b = computeMonthSignals(panelB, n - 2, cfg)
    const wentIef = b.cashTicker === "IEF" && Math.abs((b.weights["IEF"] ?? 0) - 1 / 2) < 1e-9 && (b.weights["BIL"] ?? 0) === 0

    add(
      "cash-trended-bond",
      "cashMode trendedBond — เงินสดไป IEF เมื่อ IEF เหนือ SMA10 ตัวเอง ไม่งั้นกลับ BIL (ไม่ถือบอนด์ดื้อ ๆ)",
      wentBil && wentIef,
      `A: cash→${a.cashTicker} w=${((a.weights[a.cashTicker] ?? 0) * 100).toFixed(1)}% · B: cash→${b.cashTicker} w=${((b.weights[b.cashTicker] ?? 0) * 100).toFixed(1)}%`,
    )
  }

  // 11) จักรวาลครบ: universe 13 ตัวตรงรายชื่อสเปคทุกตัว (ป้องกันการแก้ universe พังโดยไม่รู้ตัว)
  {
    const SPEC = ["VTV", "MTUM", "VBR", "DWAS", "EFA", "EEM", "TLT", "IEF", "LQD", "IGOV", "DBC", "GLD", "VNQ"]
    const got = GTAA_UNIVERSE.map((a) => a.ticker)
    const missing = SPEC.filter((t) => !got.includes(t))
    const extra = got.filter((t) => !SPEC.includes(t))
    const ok = got.length === SPEC.length && missing.length === 0 && extra.length === 0
    add(
      "universe-intact",
      "Universe 13 สินทรัพย์ตามสเปค Faber (VTV/MTUM/VBR/DWAS/EFA/EEM/TLT/IEF/LQD/IGOV/DBC/GLD/VNQ)",
      ok,
      `นับได้ ${got.length} ตัว${ok ? " ✅" : ` ❌ ขาด [${missing.join(", ")}] เกิน [${extra.join(", ")}]`}`,
    )
  }

  // 12) คณิตเดือน — nextMonthLabel / monthDiff ตรงคำตอบ (รวมข้ามปี)
  {
    const n1 = nextMonthLabel("2024-12")
    const n2 = nextMonthLabel("2025-07")
    const d1 = monthDiff("2024-01", "2025-03") // 12 + 2
    const d2 = monthDiff("2025-03", "2024-01") // ติดลบเมื่อย้อนกลับ
    const ok = n1 === "2025-01" && n2 === "2025-08" && d1 === 14 && d2 === -14
    add(
      "month-math",
      "คณิตเดือนของ Macro Gate — nextMonthLabel ข้ามปีถูกทาง · monthDiff รวม 14 เดือนและติดลบเมื่อย้อนกลับ",
      ok,
      `next(2024-12)=${n1} · next(2025-07)=${n2} · diff(2024-01→2025-03)=${d1} · diff ย้อนกลับ=${d2}`,
    )
  }

  // 13) Macro Gate stance — crash ต้อง risk_off (เงินสด 100% + SPY หลุดเส้น), bull ต้อง risk_on
  {
    const n = 30
    const down = Array.from({ length: n }, (_, i) => 100 * Math.pow(0.97, i))
    const up = seriesFrom(Array(n).fill(0.012))
    const bil = seriesFrom(Array(n).fill(BIL_RET))

    // กรณี crash: ทุก asset + SPY ขาลง → เงินสด 100% และ SPY หลุด SMA → risk_off
    const crashPanel = miniPanel({ VTV: down, EFA: down, BIL: bil, SPY: down })
    const crash = computeMacroState(crashPanel, { ...DEFAULT_GTAA_CONFIG, topN: 6, smaMonths: 10 })
    const crashOk = crash.stance === "risk_off" && Math.abs(crash.cashPct - 1) < 1e-9 && !crash.benchPass

    // กรณี bull: ทุก asset + SPY ขาขึ้น → ถือครบ Top N → risk_on
    const bullPanel = miniPanel({ VTV: up, EFA: up, BIL: bil, SPY: up })
    const bull = computeMacroState(bullPanel, { ...DEFAULT_GTAA_CONFIG, topN: 1, smaMonths: 10 })
    const bullOk = bull.stance === "risk_on" && bull.benchPass && bull.holdings.length === 1

    // กรณี caution: SPY หลุดเส้นแต่ cash ไม่หนัก (มี asset อื่นแรง) → เตือนช่องทางเดียว
    const cautionPanel = miniPanel({ VTV: up, EFA: up, BIL: bil, SPY: down })
    const caution = computeMacroState(cautionPanel, { ...DEFAULT_GTAA_CONFIG, topN: 1, smaMonths: 10 })
    const cautionOk = caution.stance === "caution" && !caution.benchPass

    add(
      "macro-stance",
      "Macro Gate — crash → risk_off (เงินสด 100% + SPY หลุดเส้น) · bull → risk_on · SPY หลุดอย่างเดียว → caution",
      crashOk && bullOk && cautionOk,
      `crash=${crash.stance} cash=${(crash.cashPct * 100).toFixed(0)}% · bull=${bull.stance} · spy-fail-only=${caution.stance}`,
    )
  }

  // 14) Tracking evaluation — สัญญาณที่บันทึกไว้ต้องได้ผลตอบแทนตรงกับราคาจริงใน panel
  {
    const n = 40
    // เดือน i→i+1 ของ decisionMonth: VTV +1.2% (คงที่), SPY +0.5% (คงที่)
    const vtv = seriesFrom(Array(n).fill(0.012))
    const bil = seriesFrom(Array(n).fill(BIL_RET))
    const spy = seriesFrom(Array(n).fill(0.005))
    const base = miniPanel({ VTV: vtv, BIL: bil, SPY: spy })
    const i = n - 2 // decision ที่ปิดเดือนรองจากท้าย → มีเดือนถัดไปให้วัด
    // "ตอนนี้" = วันแรกหลังเดือนสุดท้ายของ panel ปิด (miniPanel จบที่เดือนปัจจุบันซึ่งยังไม่ปิด)
    const [ly, lm] = base.dates[n - 1].split("-").map(Number)
    const afterClose = new Date(Date.UTC(ly, lm, 1))
    const midApplies = new Date(Date.UTC(ly, lm - 1, 15))
    // panel ที่ดึงหลังปิดเดือน (แท่งสุดท้ายสมบูรณ์) กับ panel ที่ดึงกลางเดือน (แท่งสุดท้ายยังเป็นราคากลางเดือน)
    const panel: GtaaPanel = { ...base, meta: { ...base.meta, fetchedAt: afterClose.toISOString() } }
    const panelMid: GtaaPanel = { ...base, meta: { ...base.meta, fetchedAt: midApplies.toISOString() } }

    // รูปแบบเดียวกับที่ persistSignalSnapshot บันทึกจริง: holdings มีเฉพาะ universe — เงินสด (BIL) อยู่ใน cashPct/cashTicker
    const rows: StoredSignalLike[] = [
      {
        id: 1,
        decisionMonth: panel.dates[i],
        appliesMonth: panel.dates[i + 1],
        cashPct: 0.5,
        cashTicker: "BIL",
        holdings: JSON.stringify([{ ticker: "VTV", weight: 0.5 }]),
        failed: JSON.stringify(["EFA"]),
        stance: "risk_on",
        dataSource: "synthetic",
        configHash: "cfgtest",
        createdAt: new Date().toISOString(),
      },
    ]
    const [ev] = evaluateTracking(panel, rows, afterClose)
    // แถวเก่าที่ใส่ BIL ใน holdings เองต้องได้ผลเท่ากัน (ไม่นับเงินสดซ้ำ)
    const [evExplicit] = evaluateTracking(
      panel,
      [{ ...rows[0], id: 3, holdings: JSON.stringify([{ ticker: "VTV", weight: 0.5 }, { ticker: "BIL", weight: 0.5 }]) }],
      afterClose,
    )
    const expVtv = vtv[i + 1] / vtv[i] - 1
    const expSpy = spy[i + 1] / spy[i] - 1
    const expPort = 0.5 * expVtv + 0.5 * BIL_RET
    const ok =
      ev !== undefined &&
      ev.realized?.state === "scored" &&
      Math.abs((ev.realized.portfolioRet ?? -9) - expPort) < 1e-12 &&
      Math.abs((ev.realized.spyRet ?? -9) - expSpy) < 1e-12 &&
      Math.abs((ev.realized.delta ?? -9) - (expPort - expSpy)) < 1e-12 &&
      ev.realized.hit === true &&
      Math.abs((evExplicit?.realized?.portfolioRet ?? -9) - expPort) < 1e-12
    // แถวที่ยังรอผล: (ก) decision ที่ปิดเดือนสุดท้ายของ panel (ข) เดือนที่ใช้ยังไม่ปิดตามปฏิทิน แม้ panel มีแท่งของเดือนนั้นแล้ว
    // (ค) ปฏิทินปิดเดือนแล้วแต่ panel ดึงมากลางเดือน (แท่งยังไม่สมบูรณ์)
    const pending = evaluateTracking(panel, [{ ...rows[0], id: 2, decisionMonth: panel.dates[panel.dates.length - 1], appliesMonth: "2099-01" }], afterClose)[0]
    const pendingOpen = evaluateTracking(panelMid, rows, midApplies)[0]
    const pendingStale = evaluateTracking(panelMid, rows, afterClose)[0]
    const pendingOk = pending.realized === null && pendingOpen.realized === null && pendingStale.realized === null

    add(
      "tracking-eval",
      "Tracking Log — พอร์ตที่บันทึกไว้คำนวณผลย้อนหลังตรงราคาปิดรูป (Σw·r) · สัญญาณรอเดือนถัดไป = ยังไม่ให้คะแนน",
      ok && pendingOk,
      `portfolio ${(expPort * 100).toFixed(4)}% (รวมเงินสด 50%) · spy ${(expSpy * 100).toFixed(4)}% · delta ${(((expPort - expSpy) * 100)).toFixed(4)}% · pending=${pendingOk}`,
    )
  }

  return results
}
