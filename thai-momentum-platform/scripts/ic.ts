// ============================================================
// bun run ic — สอบสัญญาณ Signals v2 จาก CLI (ไม่ต้องเปิด server)
// คืนตาราง cross-sectional IC + timing correlation + weights ที่เรียนได้
// ตาม pre-registered policy:
//   PROMOTE  = ถูกเครื่องหมาย + |ICIR|>0.25 + |meanIC|>0.02 + n≥120
//   FLIP-CHECK = |ICIR| ผ่านแต่เครื่องหมายกลับ → ต้องรันยืนยันซ้ำ
//   KILL     = ที่เหลือ (น้ำหนัก 0 ไม่มีสิทธิ์ออกเสียง)
// ============================================================

import { loadAll, loadSectorOf, DEFAULT_W } from "../src/lib/momentum/signals/io"
import { buildPanel, crossIC, timingCorr, promote, type IcSummary } from "../src/lib/momentum/signals/engine"
import { learnWeights } from "../src/lib/momentum/signals/weights"

const S = { mom: 1, mfd: -1, sec: 1, vol: -1 } as const

function verdict(r: IcSummary, sign: 1 | -1): string {
  if (promote(r, sign)) return "PROMOTE"
  if (Math.abs(r.ICIR) > 0.25 && r.n >= 120 && Math.sign(r.meanIC) !== sign) return "FLIP-CHECK"
  return "KILL"
}

// clamp เหมือน GET /api/signals/ic (5..60) — ค่าไม่ใช่ตัวเลข/≤0 เดิมให้ n=0 หรือ "forward" ย้อนหลัง
const holdRaw = Number(process.argv[2] ?? 10)
const hold = Number.isFinite(holdRaw) ? Math.min(60, Math.max(5, Math.round(holdRaw))) : 10

const { rows, snap, crossZ } = await loadAll()
if (rows.length === 0) {
  console.error("ไม่มีข้อมูล — รัน POST /api/seed ก่อน")
  process.exit(1)
}
console.log(`สอบสัญญาณ: hold=${hold}d · raw rows=${rows.length} · snapshot rows=${snap.length}`)

const sectorOf = await loadSectorOf()
const t0 = Date.now()
const panel = buildPanel(rows, snap, sectorOf, crossZ, DEFAULT_W)
console.log(`buildPanel ${Date.now() - t0}ms · dates=${panel.dates.length} · sectors=${panel.sectors.length}`)

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

console.table(
  Object.entries(ic).map(([k, v]) => ({
    signal: k,
    meanIC: v.meanIC.toFixed(3),
    ICIR: v.ICIR.toFixed(2),
    t: v.t.toFixed(1),
    n: v.n,
    hit: v.hit.toFixed(2),
    expect_sign: S[k as keyof typeof S],
    verdict: verdict(v, S[k as keyof typeof S]),
  }))
)
console.table(
  Object.entries(timing).map(([k, v]) => ({
    market_signal: k,
    corr: v.corr.toFixed(3),
    n: v.n,
    t: v.t.toFixed(1),
    verdict: Math.abs(v.corr) > 0.08 && v.n >= 200 ? "USE" : "KILL",
  }))
)

const w = learnWeights(ic, S)
console.log("weights (normalize จาก |ICIR| ของสัญญาณที่ PROMOTE):", JSON.stringify(w))
const promoted = Object.keys(ic).filter((k) => verdict(ic[k as keyof typeof ic], S[k as keyof typeof S]) === "PROMOTE")
console.log(
  promoted.length > 0
    ? `PROMOTE: ${promoted.join(", ")} → เปิด alpha ชั้นของตัวเหล่านั้นได้ (v2=${promoted.length > 0})`
    : "ไม่มีสัญญาณผ่านเกณฑ์ → alpha ยังปิด (risk filters ยังเปิดอยู่เสมอ)"
)
