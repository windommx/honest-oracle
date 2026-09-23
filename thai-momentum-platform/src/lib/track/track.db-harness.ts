// ============================================================
// สคริปต์ทดสอบ track record กับ SQLite จริง — รันเป็น subprocess โดย track.db.test.ts เท่านั้น
// ใช้: DATABASE_URL=file:/tmp/x.db bun track.db-harness.ts track → พิมพ์ JSON บรรทัดสุดท้าย
// ชุดข้อมูลสังเคราะห์ deterministic + การตัดสินใจที่เขียนแบบเดียวกับ /api/jev/run (Decision/Trade/Position)
// ============================================================

import { createHash } from "node:crypto"
import { db } from "@/lib/db"
import * as core from "@/lib/momentum/core"

const scenario = process.argv[2] ?? ""
const expectedFile = (process.env.DATABASE_URL ?? "").replace(/^file:/, "")

async function guard() {
  const list = (await db.$queryRawUnsafe(`PRAGMA database_list`)) as { name: string; file: string }[]
  const main = list.find((d) => d.name === "main")?.file ?? ""
  if (!expectedFile || main !== expectedFile) throw new Error(`guard: connected to "${main}", expected "${expectedFile}"`)
}

/** เขียน EventLog ด้วยเวลาที่กำหนด — hash ตามสูตรเดียวกับ src/lib/research/events.ts (auditEvents ต้องผ่าน) */
async function appendEventAt(kind: string, actor: string, payload: unknown, ts: Date) {
  const payloadStr = JSON.stringify(payload)
  const last = await db.eventLog.findFirst({ orderBy: { id: "desc" }, select: { hash: true } })
  const prevHash = last?.hash ?? "GENESIS"
  const body = JSON.stringify({ kind, actor, payload: payloadStr, ts: ts.toISOString() })
  const hash = createHash("sha256").update(prevHash + body).digest("hex")
  await db.eventLog.create({ data: { kind, actor, payload: payloadStr, prevHash, hash, ts } })
}

function weekdays(from: string, n: number): string[] {
  const out: string[] = []
  for (let t = Date.parse(`${from}T00:00:00Z`); out.length < n; t += 86_400_000) {
    const d = new Date(t)
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) out.push(d.toISOString().slice(0, 10))
  }
  return out
}

async function trackScenario() {
  const dates = weekdays("2026-01-05", 90)
  let seed = 11
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
  const rows: core.ParsedCsvRow[] = []
  const closes = new Map<string, number[]>()
  for (let s = 0; s < 40; s++) {
    const sym = `S${String(s).padStart(2, "0")}`
    let px = 10 + rnd() * 40
    const arr: number[] = []
    for (const date of dates) {
      px = Math.max(2, px * (1 + (rnd() - 0.49) * 0.05))
      const c = Math.round(px * 100) / 100
      arr.push(c)
      rows.push({ date, symbol: sym, close: c, open: null, high: null, low: null, val: 5e6 + Math.round(rnd() * 5e7) })
    }
    closes.set(sym, arr)
  }
  await core.ingestRows(rows)
  // ยุคข้อมูล: ingest จริงจาก yahoo ที่ล้าง demo (เวลาก่อนการตัดสินใจทั้งหมด)
  await appendEventAt("ingest", "system", { kind: "feed", source: "yahoo", insertedRaw: rows.length, latestDate: dates[89], replacedDemo: true }, new Date("2026-01-02T00:00:00Z"))

  const createdAt = (d: string, lag = 1) => new Date(Date.parse(`${d}T11:00:00Z`) + lag * 86_400_000)
  const mk = (date: string, question: string, target: string, action: string, conf: number, executed: boolean, source = "lite", reason = "") =>
    db.decision.create({ data: { date, question, target, action, conf, executed, source, reason, createdAt: createdAt(date) } })
  // การตัดสินใจก่อนยุคนี้ (โลกเก่า) — ต้องไม่ถูกนับ
  await db.decision.create({ data: { date: "2025-12-01", question: "Q_REGIME", target: "market", action: "neutral", conf: 0.5, source: "lite", createdAt: new Date("2025-12-01T11:00:00Z") } })
  for (let i = 60; i < 90; i++) {
    const d = dates[i]
    await mk(d, "Q_REGIME", "market", i % 3 ? "risk_on" : "neutral", 0.7, false)
    if (i === 60) await mk(d, "Q_ENTRY", "S01", "buy", 0.9, true, "lite", "n_tf=4 streak=2")
    if (i === 65) await mk(d, "Q_ENTRY", "S02", "buy", 0.72, true, "human", "human-approved")
    if (i === 66) await mk(d, "Q_ENTRY", "S03", "buy", 0.72, true, "lite", "n_tf=3 streak=1")
    if (i === 70) await mk(d, "Q_EXIT", "S01", "exit", 0.85, true, "lite", "กำไรใหญ่")
    if (i === 75) await mk(d, "Q_EXIT", "S03", "exit", 0.85, true, "human", "human-approved")
  }
  const c = (s: string, i: number) => (closes.get(s) as number[])[i]
  // ไม้ที่ /api/jev/run ปิดเอง → Trade (stopPolicy jev) · ไม้ที่มนุษย์ปิด → ไม่มี Trade (ตามโค้ดจริงของ /api/jev/pending)
  await db.trade.create({
    data: { symbol: "S01", entry: dates[60], exit: dates[70], entryPx: c("S01", 60), exitPx: c("S01", 70), ret: Math.round((c("S01", 70) / c("S01", 60) - 1 - 0.014) * 10000) / 100, mae: 0, regime: "risk_on", src: "auto", holdDays: 10, pathJson: "[]", stopPolicy: "jev" },
  })
  await db.trade.create({ data: { symbol: "S09", entry: dates[5], exit: dates[15], entryPx: 10, exitPx: 12, ret: 18.6, mae: 0, regime: "risk_on", src: "auto", holdDays: 10, pathJson: "[]", stopPolicy: "fixed15" } }) // seed
  await db.position.create({ data: { symbol: "S02", entryDate: dates[65], entryPx: c("S02", 65), slots: 0.75, stop: c("S02", 65) * 0.91 } })
  await db.position.create({ data: { symbol: "S39", entryDate: dates[10], entryPx: c("S39", 10), slots: 1, stop: 1 } }) // สถานะตัวอย่างของ seed

  // NAV คาดหวัง — คำนวณอิสระ (ลูปตรง ๆ): S01 1 slot (60→70], S03 0.5 slot ประมาณ (66→75], S02 0.75 slot (65→89]
  const C = 0.007
  const legs = [
    { s: "S01", ei: 60, xi: 70, w: 1 / 7, closed: true },
    { s: "S03", ei: 66, xi: 75, w: 0.5 / 7, closed: true },
    { s: "S02", ei: 65, xi: 89, w: 0.75 / 7, closed: false },
  ]
  let navExp = 1
  const navSeries: number[] = []
  for (let i = 60; i < 90; i++) {
    let r = 0
    for (const l of legs) {
      if (i > l.ei && i <= l.xi) r += l.w * (c(l.s, i) / c(l.s, i - 1) - 1)
      if (i === l.ei) r -= l.w * C
      if (i === l.xi && l.closed) r -= l.w * C
    }
    navExp *= 1 + r
    navSeries.push(navExp)
  }

  const { buildTrackRecord } = await import("./record")
  const { snapshotTrackRecord } = await import("./snapshot")
  const rec = await buildTrackRecord()
  const snap1 = await snapshotTrackRecord({ actor: "test", record: rec })
  const snap2 = await snapshotTrackRecord({ actor: "test" })
  const route = await import("@/app/api/track-record/route")
  const res = await route.GET()
  const viaRoute = (await res.json()) as { ledgerHash?: string; tamper: { ledgerHash: string } }
  const trustRoute = await import("@/app/api/data/trust/route")
  const tr = await trustRoute.GET()
  const trust = (await tr.json()) as { provenance: { evidenceLabel: string }; freshness: { dbLatest: string; universeSize: number } }

  // ราคาในฐานข้อมูลถูกแก้ย้อนหลัง (ผู้เขียนทุกทางต้องตรา data_version) → NAV ที่คำนวณใหม่ ≠ snapshot
  await db.rawDaily.update({ where: { date_symbol: { date: dates[80], symbol: "S02" } }, data: { close: c("S02", 80) * 1.2 } })
  await core.markDataChanged()
  const afterPrice = await buildTrackRecord()
  // แก้ประวัติการตัดสินใจย้อนหลัง → ledger hash ไม่ตรง snapshot
  await db.$executeRawUnsafe(`UPDATE "Decision" SET reason = 'แก้ย้อนหลัง' WHERE target = 'S03' AND question = 'Q_ENTRY'`)
  const afterEdit = await buildTrackRecord()

  return {
    status: rec.status,
    evidenceLabel: rec.provenance.evidenceLabel,
    epochKind: rec.provenance.epochKind,
    liveSince: rec.liveSince,
    expectedLiveSince: dates[60],
    sessions: rec.sessions,
    navLen: rec.nav.length,
    navFirst: rec.nav[0]?.nav,
    navLast: rec.nav[rec.nav.length - 1]?.nav,
    navExpFirst: navSeries[0],
    navExpLast: navSeries[navSeries.length - 1],
    exposureAt66: rec.nav[6]?.exposure,
    mode: rec.mode.label,
    decisions: rec.decisions,
    legs: rec.legs.map((l) => ({ symbol: l.symbol, status: l.status, slots: l.slots, slotsSource: l.slotsSource, recordedRetPct: l.recordedRetPct, netRetPct: l.netRetPct })),
    closedTrades: rec.stats.closedTrades,
    openTrades: rec.stats.openTrades,
    verdict: rec.confidence.verdict,
    tooEarly: rec.confidence.tooEarly,
    notes: rec.confidence.notes,
    audit: rec.tamper.audit,
    snap1: snap1.emitted,
    snap2: snap2.emitted,
    snap2Reason: snap2.reason,
    routeStatus: res.status,
    routeHashSame: viaRoute.tamper.ledgerHash === rec.tamper.ledgerHash,
    trustStatus: tr.status,
    trustLabel: trust.provenance.evidenceLabel,
    trustLatest: trust.freshness.dbLatest,
    trustUniverse: trust.freshness.universeSize,
    afterPrice: afterPrice.tamper.snapshots,
    afterEdit: afterEdit.tamper.snapshots,
    afterEditNotes: afterEdit.notes,
  }
}

async function main() {
  await guard()
  if (scenario === "track") return trackScenario()
  throw new Error(`unknown scenario ${scenario}`)
}

main()
  .then((r) => {
    console.log(JSON.stringify(r))
    process.exit(0)
  })
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
