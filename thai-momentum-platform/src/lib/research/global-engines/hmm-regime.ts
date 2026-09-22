// 2-State Gaussian HMM Regime — Hamilton (1989), Econometrica 57(2)
// (ประยุกต์กับ factor investing: Wang et al. 2020, MDPI)
// อินพุต: ผลตอบแทนตลาด equal-weight รายวัน → สถานะซ่อน 2 แบบ
//   state "calm" (เฉลี่ยสูง/ผันผวนต่ำ) vs "stress" (เฉลี่ยต่ำ/ผันผวนสูง)
// EM (Baum-Welch) แบบสเกลกัน underflow + หลาย initial เลือก log-likelihood สูงสุด
// พื้น sd ≥ 0.2%/วัน กัน state ยุบเป็น spike รอบหาง
// ใช้เป็น "ความเห็นที่สอง" ของ regime composite เดิม (second-opinion gate)

import { mean, stdD1 } from "./helpers"
import type { EngineEval, EngineStats } from "./types"

const MAX_ITER = 60
const TOL = 1e-7
const SD_FLOOR = 0.002 // 0.2% ต่อวัน — กัน state ยุบเป็น spike

interface HmmFit {
  mu: [number, number]
  sd: [number, number]
  a: [number, number, number, number] // row-major [[a00,a01],[a10,a11]]
  gammaLast: [number, number]
  logLik: number
}

const normPdf = (v: number, m: number, s: number): number => {
  const z = (v - m) / s
  return Math.exp(-0.5 * z * z) / (s * Math.sqrt(2 * Math.PI))
}

function emRun(x: number[], mu0: [number, number], sd0: [number, number], floor: number): HmmFit {
  const T = x.length
  let mu: [number, number] = [...mu0]
  let sd: [number, number] = [...sd0]
  let a: [number, number, number, number] = [0.95, 0.05, 0.05, 0.95]
  let pi: [number, number] = [0.5, 0.5]
  let logLik = -Infinity

  for (let iter = 0; iter < MAX_ITER; iter++) {
    const B: number[][] = Array.from({ length: T }, (_, t) => [
      normPdf(x[t] ?? 0, mu[0], sd[0]) + 1e-300,
      normPdf(x[t] ?? 0, mu[1], sd[1]) + 1e-300,
    ])
    const alpha: number[][] = Array.from({ length: T }, () => [0, 0])
    const beta: number[][] = Array.from({ length: T }, () => [0, 0])
    const c: number[] = new Array(T).fill(1)
    // forward (scaled)
    const a00 = pi[0] * (B[0][0] ?? 0)
    const a01 = pi[1] * (B[0][1] ?? 0)
    const c0 = a00 + a01 || 1e-300
    alpha[0] = [a00 / c0, a01 / c0]
    c[0] = c0
    for (let t = 1; t < T; t++) {
      const prev = alpha[t - 1]
      const p0 = (prev[0] ?? 0) * a[0] + (prev[1] ?? 0) * a[2]
      const p1 = (prev[0] ?? 0) * a[1] + (prev[1] ?? 0) * a[3]
      const ct = p0 * (B[t][0] ?? 0) + p1 * (B[t][1] ?? 0) || 1e-300
      alpha[t] = [(p0 * (B[t][0] ?? 0)) / ct, (p1 * (B[t][1] ?? 0)) / ct]
      c[t] = ct
    }
    // backward (scaled)
    beta[T - 1] = [1, 1]
    for (let t = T - 2; t >= 0; t--) {
      const nxt = beta[t + 1]
      const bt = B[t + 1]
      beta[t] = [
        (a[0] * (bt[0] ?? 0) * (nxt[0] ?? 0) + a[1] * (bt[1] ?? 0) * (nxt[1] ?? 0)) / (c[t + 1] || 1e-300),
        (a[2] * (bt[0] ?? 0) * (nxt[0] ?? 0) + a[3] * (bt[1] ?? 0) * (nxt[1] ?? 0)) / (c[t + 1] || 1e-300),
      ]
    }
    // M-step
    let ll = 0
    for (let t = 0; t < T; t++) ll += Math.log(c[t] || 1e-300)
    const newA: [number, number, number, number] = [0, 0, 0, 0]
    for (let s = 0; s < 2; s++) {
      const xi = [0, 0]
      for (let t = 0; t < T - 1; t++) {
        const num0 =
          ((alpha[t][s] ?? 0) *
            (s === 0 ? a[0] : a[2]) *
            (B[t + 1][0] ?? 0) *
            (beta[t + 1][0] ?? 0)) /
          (c[t + 1] || 1e-300)
        const num1 =
          ((alpha[t][s] ?? 0) *
            (s === 0 ? a[1] : a[3]) *
            (B[t + 1][1] ?? 0) *
            (beta[t + 1][1] ?? 0)) /
          (c[t + 1] || 1e-300)
        xi[0] += num0
        xi[1] += num1
      }
      const den = xi[0] + xi[1] || 1e-300
      newA[s === 0 ? 0 : 2] = xi[0] / den
      newA[s === 0 ? 1 : 3] = xi[1] / den
    }
    // Gaussian params จาก posterior
    const newMu: [number, number] = [mu[0], mu[1]]
    const newSd: [number, number] = [sd[0], sd[1]]
    for (let s = 0; s < 2; s++) {
      let gSum = 0
      let mSum = 0
      for (let t = 0; t < T; t++) {
        const g = (alpha[t][s] ?? 0) * (beta[t][s] ?? 0)
        gSum += g
        mSum += g * (x[t] ?? 0)
      }
      const m = gSum > 1e-12 ? mSum / gSum : mu[s]
      let vSum = 0
      for (let t = 0; t < T; t++) {
        const g = (alpha[t][s] ?? 0) * (beta[t][s] ?? 0)
        vSum += g * Math.pow((x[t] ?? 0) - m, 2)
      }
      newMu[s] = m
      newSd[s] = Math.max(gSum > 1e-12 ? Math.sqrt(vSum / gSum) : sd[s], floor)
    }
    pi = [
      (alpha[0][0] ?? 0) * (beta[0][0] ?? 0),
      (alpha[0][1] ?? 0) * (beta[0][1] ?? 0),
    ]
    const piSum = pi[0] + pi[1] || 1
    pi = [pi[0] / piSum, pi[1] / piSum]
    a = newA
    mu = newMu
    sd = newSd
    const delta = ll - logLik
    logLik = ll
    if (iter > 2 && Math.abs(delta) < TOL * Math.abs(ll)) break
  }

  // posterior ณ วันสุดท้าย
  const B0 = normPdf(x[T - 1] ?? 0, mu[0], sd[0]) + 1e-300
  const B1 = normPdf(x[T - 1] ?? 0, mu[1], sd[1]) + 1e-300
  const g0 = pi[0] * B0
  const g1 = pi[1] * B1
  const norm = g0 + g1 || 1
  return { mu, sd, a, gammaLast: [g0 / norm, g1 / norm], logLik }
}

function fitHmm(x: number[]): HmmFit | null {
  const T = x.length
  if (T < 100) return null
  // init 1: แบ่งจาก |x| ครึ่ง (low-vol vs high-vol)
  const absX = [...x].sort((a, b) => Math.abs(a) - Math.abs(b))
  const med = Math.abs(absX[Math.floor(T / 2)] ?? 0)
  const lo: number[] = []
  const hi: number[] = []
  for (const v of x) {
    if (Math.abs(v) <= med) lo.push(v)
    else hi.push(v)
  }
  // init 2: แบ่งจากเครื่องหมาย (down-day vs up-day)
  const dn: number[] = []
  const up: number[] = []
  for (const v of x) {
    if (v < 0) dn.push(v)
    else up.push(v)
  }
  const floor = Math.max(SD_FLOOR, 0.5 * stdD1(x))
  const sdOf = (g: number[]) => Math.max(stdD1(g), floor, 1e-4)
  const candidates: HmmFit[] = []
  if (lo.length >= 20 && hi.length >= 20) {
    candidates.push(emRun(x, [mean(lo), mean(hi)], [sdOf(lo), sdOf(hi)], floor))
  }
  if (dn.length >= 20 && up.length >= 20) {
    candidates.push(emRun(x, [mean(dn), mean(up)], [sdOf(dn), sdOf(up)], floor))
  }
  if (candidates.length === 0) return null
  return candidates.reduce((best, f) => (f.logLik > best.logLik ? f : best))
}

export function evalHmmRegime(mkt: number[]): EngineEval {
  const fit = fitHmm(mkt)
  if (!fit) {
    return {
      id: "hmm_regime",
      name: "HMM Regime (2-state)",
      source: { authors: "Hamilton", year: 1989, title: "Regime switching", venue: "Econometrica 57(2)" },
      thesis: "—",
      verdict: "INFO",
      verdictWhy: "ข้อมูลตลาดไม่พอฟิต HMM (ต้อง ≥100 วัน)",
      stats: { nDays: mkt.length },
      integration: { target: "regime", how: "—" },
    }
  }
  // state "stress" = mean ต่ำกว่า
  const stressIdx = fit.mu[0] <= fit.mu[1] ? 0 : 1
  const calmIdx = 1 - stressIdx
  const pStress = fit.gammaLast[stressIdx] ?? 0

  // สถิติเชิงพรรณนา: hard assignment ต่อวัน → ตลาด fwd 10 วันต่อ state
  const fwd10: { state: 0 | 1; fwd: number }[] = []
  for (let t = 0; t < mkt.length - 10; t++) {
    const x = mkt[t] ?? 0
    const l0 = Math.abs(x - fit.mu[0]) / fit.sd[0]
    const l1 = Math.abs(x - fit.mu[1]) / fit.sd[1]
    const state: 0 | 1 = l0 <= l1 ? 0 : 1
    let cum = 1
    for (let k = t + 1; k <= t + 10; k++) cum *= 1 + (mkt[k] ?? 0)
    fwd10.push({ state, fwd: cum - 1 })
  }
  const sFwd = fwd10.filter((f) => f.state === stressIdx).map((f) => f.fwd)
  const cFwd = fwd10.filter((f) => f.state === calmIdx).map((f) => f.fwd)
  const mS = mean(sFwd)
  const mC = mean(cFwd)
  const se = Math.sqrt(
    Math.pow(stdD1(sFwd), 2) / Math.max(sFwd.length, 1) +
      Math.pow(stdD1(cFwd), 2) / Math.max(cFwd.length, 1),
  )
  const tStat = se > 1e-12 ? (mS - mC) / se : 0

  // เกณฑ์ลงทะเบียน: PASS = state stress แยกชัด (t ≤ −2 และ mean stress < 0)
  let verdict: EngineEval["verdict"] = "FAIL"
  let why = `fwd10 stress ${((mS - mC) * 100).toFixed(2)}pp เทียบ calm, t = ${tStat.toFixed(2)} — state ไม่แยกข้อมูล (honest)`
  if (tStat <= -2 && mS < 0) {
    verdict = "PASS"
    why = `วัน stress มีตลาด fwd10 ${(mS * 100).toFixed(2)}% vs calm ${(mC * 100).toFixed(2)}% (t = ${tStat.toFixed(2)} ≤ −2, เกณฑ์ลงทะเบียน)`
  } else if (tStat <= -1.5) {
    verdict = "WEAK"
    why = `ทิศทางเข้าเกณฑ์ (t = ${tStat.toFixed(2)} ≤ −1.5) แต่ไม่ถึง −2 — ใช้ second-opinion ได้`
  }

  const stats: EngineStats = {
    pStressNow: Math.round(pStress * 1000) / 10,
    stateNow: pStress >= 0.5 ? "STRESS" : "CALM",
    muCalm: Math.round((fit.mu[calmIdx] ?? 0) * 10000) / 10000,
    sdCalm: Math.round((fit.sd[calmIdx] ?? 0) * 10000) / 10000,
    muStress: Math.round((fit.mu[stressIdx] ?? 0) * 10000) / 10000,
    sdStress: Math.round((fit.sd[stressIdx] ?? 0) * 10000) / 10000,
    stayCalm: Math.round((fit.a[calmIdx === 0 ? 0 : 3] ?? 0) * 1000) / 10,
    stayStress: Math.round((fit.a[stressIdx === 0 ? 0 : 3] ?? 0) * 1000) / 10,
    nDaysStress: sFwd.length,
    fwdStress: Math.round(mS * 10000) / 10000,
    fwdCalm: Math.round(mC * 10000) / 10000,
    tSpread: Math.round(tStat * 100) / 100,
    nDays: mkt.length,
  }

  return {
    id: "hmm_regime",
    name: "HMM Regime (2-state)",
    source: {
      authors: "Hamilton (1989); Wang et al. (2020)",
      year: 1989,
      title: "Regime-Switching · HMM factor investing",
      venue: "Econometrica 57(2) · MDPI (regime-switching factor investing)",
    },
    thesis:
      "ตลาดสลับสถานะซ่อน (calm/stress) ไม่ใช่ไล่เรียงเส้นตรง — HMM อ่านสถานะจากการกระจายผลตอบแทนรายวัน ใช้เป็นความเห็นที่สองยืนยัน regime composite ก่อนลด gross",
    verdict,
    verdictWhy: why,
    stats,
    integration: {
      target: "regime composite (second opinion)",
      how: "ถ้า PASS → เมื่อ HMM พูด STRESS ≥60% และ composite ยัง risk_on → บังคับลด gross เป็น neutral (ป้องกัน composite หลง)",
    },
  }
}
