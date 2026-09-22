// Data-quality gate — ก่อนใช้ข้อมูลจริงต้องผ่านก่อน (แผน Step 0.2):
// แต่ละ ticker มีเดือนครบไม่มีรู · adjclose ไม่ติดลบ/ไม่กระโดดผิดปกติ (split ที่ไม่ถูก adjust)
// เดือนล่าสุดตรงกันทุกตัว

import { GTAA_UNIVERSE } from "./defaults"
import type { GtaaPanel, QualityIssue, QualityReport } from "./types"

export function checkQuality(panel: GtaaPanel): QualityReport {
  const issues: QualityIssue[] = []
  const T = panel.dates.length
  const lastMonth = panel.dates[T - 1] ?? "—"

  for (const asset of [...GTAA_UNIVERSE, { ticker: "SPY" }, { ticker: "BIL" }]) {
    const series = panel.closes[asset.ticker]
    if (!series || series.length === 0) {
      issues.push({ ticker: asset.ticker, type: "short", detail: "ไม่มีข้อมูลเลยในไฟล์" })
      continue
    }
    const first = series.findIndex((v) => v !== null && v !== undefined)
    const last = (() => {
      for (let i = series.length - 1; i >= 0; i--) {
        if (series[i] !== null && series[i] !== undefined) return i
      }
      return -1
    })()

    if (first === -1) {
      issues.push({ ticker: asset.ticker, type: "short", detail: "ไม่มีข้อมูลเลยในไฟล์" })
      continue
    }

    let nonNull = 0
    for (let i = first; i <= last; i++) {
      const v = series[i]
      if (v === null || v === undefined) {
        issues.push({ ticker: asset.ticker, type: "hole", detail: `เดือน ${panel.dates[i]} หาย (รูกลางซีรีส์)` })
        continue
      }
      nonNull++
      if (!(v > 0)) {
        issues.push({ ticker: asset.ticker, type: "nonpositive", detail: `ราคา ≤ 0 ที่ ${panel.dates[i]} (${v})` })
        continue
      }
      if (i > first) {
        const prev = series[i - 1]
        if (prev && prev > 0) {
          const jump = Math.abs(Math.log(v / prev))
          if (jump > 0.5) {
            issues.push({
              ticker: asset.ticker,
              type: "jump",
              detail: `กระโดด ${Math.round((Math.exp(jump) - 1) * 100)}% ที่ ${panel.dates[i]} — อาจเป็น split ที่ไม่ถูก adjust`,
            })
          }
        }
      }
    }

    if (nonNull < 24) {
      issues.push({ ticker: asset.ticker, type: "short", detail: `มีแค่ ${nonNull} เดือน — สั้นกว่า 2 ปี` })
    }
    if (last !== T - 1) {
      issues.push({
        ticker: asset.ticker,
        type: "misaligned",
        detail: `เดือนล่าสุดของตัวนี้คือ ${panel.dates[last]} ≠ ${lastMonth} ของไฟล์`,
      })
    }
  }

  const blocking = issues.filter((i) => i.type === "hole" || i.type === "nonpositive" || i.type === "jump")
  return {
    ok: blocking.length === 0,
    months: T,
    tickers: panel.assets.filter((a) => a.role === "universe").length,
    lastMonth,
    issues,
    checkedAt: new Date().toISOString(),
  }
}
