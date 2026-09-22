// GTAA CLI — รันบนเครื่องที่เข้าเน็ตปกติ (sandbox นี้ดึงข้อมูลจริงไม่ได้)
// ใช้: bun run gtaa -- fetch          → ดึง Yahoo/Stooq รายเดือน 30 ปี → data/gtaa/panel.json (ผ่าน quality gate)
//      bun run gtaa -- run           → backtest config default + ตารางสัญญาณเดือนล่าสุด
//      bun run gtaa -- macro         → สถานะมหภาค (stance/เงินสด/พอร์ตเดือนหน้า/รอบถัดไป) — เหมาะยิงจาก cron ท้ายเดือน
//      bun run gtaa -- sensitivity   → grid Top N × SMA
//      bun run gtaa -- selftest      → invariant suite ของ engine
//      bun run gtaa -- reset         → ลบ panel.json กลับไป synthetic

import { runBacktest } from "../src/lib/gtaa/backtest"
import { runSensitivity } from "../src/lib/gtaa/sensitivity"
import { runSelfTests } from "../src/lib/gtaa/selftest"
import { checkQuality } from "../src/lib/gtaa/quality"
import { computeMacroState } from "../src/lib/gtaa/macro"
import { clearPanel, loadPanel, savePanel } from "../src/lib/gtaa/data"
import { fetchRealPanel } from "../src/lib/gtaa/fetcher"
import { DEFAULT_GTAA_CONFIG } from "../src/lib/gtaa/types"

const cmd = process.argv[2] ?? "run"

function pct(x: number, digits = 2): string {
  return `${(x * 100).toFixed(digits)}%`
}

async function main() {
  if (cmd === "fetch") {
    console.log("ดึงข้อมูลจริงรายเดือน (Yahoo adjclose → Stooq fallback)…")
    const outcome = await fetchRealPanel()
    for (const a of outcome.attempts) console.log(`  [${a.source}] ${a.detail}`)
    if (!outcome.ok || !outcome.panel) {
      console.error("ดึงข้อมูลไม่ครบ (universe ต้องมี ≥ 4 ตัว):")
      for (const f of outcome.tickersFail) console.error(`  ${f.ticker}: ${f.detail}`)
      process.exit(2)
    }
    const quality = checkQuality(outcome.panel)
    if (!quality.ok) {
      console.error("ข้อมูลไม่ผ่าน quality gate — ไม่บันทึก:")
      for (const i of quality.issues) console.error(`  [${i.type}] ${i.ticker}: ${i.detail}`)
      process.exit(2)
    }
    await savePanel(outcome.panel)
    console.log(`บันทึก data/gtaa/panel.json — ${quality.months} เดือน × ${quality.tickers} ตัว (ถึง ${quality.lastMonth}) ✅`)
    return
  }

  if (cmd === "selftest") {
    const tests = runSelfTests()
    let pass = 0
    for (const t of tests) {
      console.log(`${t.pass ? "✅" : "❌"} ${t.name}`)
      console.log(`   ${t.detail}`)
      if (t.pass) pass++
    }
    console.log(`\n${pass}/${tests.length} ผ่าน`)
    if (pass < tests.length) process.exit(1)
    return
  }

  if (cmd === "reset") {
    await clearPanel()
    console.log("ลบ data/gtaa/panel.json แล้ว — กลับไปใช้ synthetic seed 42")
    return
  }

  const { panel, fromFile } = await loadPanel()
  console.log(
    `แหล่งข้อมูล: ${panel.meta.source}${panel.meta.seed ? ` (seed ${panel.meta.seed})` : ""} · ${panel.dates.length} เดือน ${panel.dates[0]} → ${panel.dates[panel.dates.length - 1]}${fromFile ? "" : "  [SYNTHETIC — ยังไม่มีข้อมูลจริง]"}`,
  )
  if (panel.meta.source === "synthetic") {
    console.log("  ⚠ ข้อมูลสังเคราะห์ — พิสูจน์แค่ว่าท่อต่อกันถูก ให้รัน `bun run gtaa -- fetch` บนเครื่องที่เน็ตปกติก่อน")
  }

  if (cmd === "macro") {
    const macro = computeMacroState(panel, DEFAULT_GTAA_CONFIG)
    const icon = macro.stance === "risk_on" ? "🟢" : macro.stance === "caution" ? "🟡" : "🔴"
    console.log(`\nGlobal Regime (GTAA) — ณ ปิดเดือน ${macro.asOfMonth} (แหล่งข้อมูล: ${macro.source})`)
    console.log(`${icon} stance: ${macro.stance.toUpperCase()} — ${macro.stanceWhy}`)
    console.log(
      `เงินสด: ${(macro.cashPct * 100).toFixed(1)}% (${macro.cashTicker}) · SPY ${macro.benchPass ? "ยืนเหนือ" : "หลุด"}เส้น${macro.benchGapPct !== null ? ` (${macro.benchGapPct >= 0 ? "+" : ""}${macro.benchGapPct.toFixed(1)}%)` : ""}`,
    )
    console.log(`สอบตกเทรนด์: ${macro.failed.length}/${macro.universeCount}${macro.failed.length > 0 ? ` (${macro.failed.join(", ")})` : ""}`)
    console.log(`พอร์ตเดือนหน้า: ${macro.holdings.map((h) => `${h.ticker} ${(h.weight * 100).toFixed(1)}%`).join(" · ") || "(ไม่มี — เงินสดทั้งหมด)"}`)
    console.log(`รอบถัดไป: ตัดสินใจปิดเดือน ${macro.nextDecisionMonth} → ใช้เดือน ${macro.nextAppliesMonth}`)
    if (macro.staleMonths > 0) {
      console.log(`⚠ ข้อมูลเกินรอบรีบาลานซ์ ${macro.staleMonths} รอบ — รัน 'bun run gtaa -- fetch' ก่อนตัดสินใจ`)
      process.exit(2)
    }
    return
  }

  if (cmd === "sensitivity") {
    const grid = runSensitivity(panel, DEFAULT_GTAA_CONFIG)
    console.log("\nSensitivity — Sharpe (CAGR | MaxDD) ตาม Top N × SMA:")
    const smas = [8, 10, 12]
    process.stdout.write("TopN".padEnd(6))
    for (const s of smas) process.stdout.write(`SMA ${s}`.padEnd(24))
    console.log()
    for (const topN of [3, 4, 5, 6, 7, 8, 9]) {
      process.stdout.write(String(topN).padEnd(6))
      for (const s of smas) {
        const c = grid.find((g) => g.topN === topN && g.smaMonths === s)!
        process.stdout.write(`${c.sharpe.toFixed(2)} (${pct(c.cagr, 1)} | ${pct(c.maxDD, 1)})`.padEnd(24))
      }
      console.log()
    }
    return
  }

  // run (default)
  const bt = runBacktest(panel, DEFAULT_GTAA_CONFIG)
  const cfg = bt.config
  console.log(`\nBacktest Top ${cfg.topN} · SMA ${cfg.smaMonths} · skip ${cfg.skipMonths} · cash ${cfg.cashMode} · cost ${cfg.costBps}bps · tranches ${cfg.tranches}`)
  console.log(`ช่วง ${bt.startMonth} → ${bt.endMonth}`)
  console.log(`กลยุทธ์ : CAGR ${pct(bt.stats.cagr)} · MaxDD ${pct(bt.stats.maxDD, 1)} · Sharpe ${bt.stats.sharpe.toFixed(2)} · turnover ${pct(bt.stats.turnoverAnnual, 0)}/ปี`)
  console.log(`SPY     : CAGR ${pct(bt.benchStats.cagr)} · MaxDD ${pct(bt.benchStats.maxDD, 1)} · Sharpe ${bt.benchStats.sharpe.toFixed(2)}`)

  console.log(`\nสัญญาณเดือน ${bt.lastDecisionMonth} (ใช้จัดพอร์ตเดือนหน้า):`)
  for (const s of bt.lastSignals) {
    const score = s.score !== null ? pct(s.score, 1) : "—"
    console.log(
      `  ${s.ticker.padEnd(5)} ${s.status.padEnd(8)} rank=${String(s.rank ?? "-").padEnd(3)} score=${score.padEnd(7)} trend=${s.trendPass ? "PASS" : "FAIL"} w=${pct(s.weight, 1)}`,
    )
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e))
  process.exit(1)
})
