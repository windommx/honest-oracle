// ============================================================
// bun run fetch:cross — ดึงข้อมูลจริง SPX / USDTHB / GOLD จาก Yahoo Finance
// แล้ว upsert ลงตาราง CrossAsset (ใช้แทนชุด synthetic จาก seed ได้ทันที)
// ถ้า sandbox/เครือข่ายไม่อนุญาต → แจ้งเตือนแล้วจบ (crossZ ยังใช้ข้อมูลเดิมได้)
// ============================================================

import { db } from "../src/lib/db"

const ASSETS: Record<string, string> = { SPX: "^GSPC", USDTHB: "THB=X", GOLD: "GC=F" }

type YahooChart = {
  chart?: {
    result?: {
      timestamp?: number[]
      indicators?: { quote?: { close?: (number | null)[] }[] }
    }[]
    error?: unknown
  }
}

let upserted = 0
for (const [asset, sym] of Object.entries(ASSETS)) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=3y&interval=1d`
    const j = (await fetch(url, { signal: AbortSignal.timeout(10000) }).then((r) => r.json())) as YahooChart
    const res = j.chart?.result?.[0]
    const ts = res?.timestamp ?? []
    const closes = res?.indicators?.quote?.[0]?.close ?? []
    if (ts.length === 0) throw new Error("ไม่มีข้อมูลจาก Yahoo")
    let n = 0
    for (let i = 0; i < ts.length; i++) {
      const close = closes[i]
      if (close == null || !isFinite(close)) continue
      const date = new Date(ts[i] * 1000).toISOString().slice(0, 10)
      await db.crossAsset.upsert({
        create: { date, asset, close },
        update: { close },
        where: { date_asset: { date, asset } },
      })
      n++
    }
    upserted += n
    console.log(`${asset}: upsert ${n} แถว`)
  } catch (e) {
    console.warn(`⚠️ ${asset} ดึงไม่สำเร็จ (${(e as Error).message}) — ข้าม (crossZ ยังใช้ข้อมูลที่มีอยู่)`)
  }
}
console.log(`รวม upsert ${upserted} แถว`)
process.exit(0)
