// Fetcher ข้อมูลจริงรายเดือน — Yahoo chart API (adjclose) แล้ว fallback Stooq (PoW แบบ browser)
// หมายเหตุ sandbox: ถ้าทั้งสองแหล่งโดนบล็อก จะรายงานเหตุผลตรง ๆ พร้อมวิธีทางเลือก (รัน CLI บนเครื่องผู้ใช้ / อัปโหลด CSV)

import { ALL_ASSETS, GTAA_UNIVERSE } from "./defaults"
import type { GtaaPanel } from "./types"

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 12_000): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}

/** เดือน YYYY-MM จาก unix timestamp (UTC) */
function tsToMonth(ts: number): string {
  const d = new Date(ts * 1000)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}

async function fetchYahooMonthly(ticker: string): Promise<{ months: string[]; closes: number[] }> {
  const hosts = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]
  let lastErr = "unknown"
  for (const host of hosts) {
    try {
      const url = `https://${host}/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1mo&range=30y`
      const r = await fetchWithTimeout(url, { headers: { "User-Agent": UA, Accept: "application/json" } })
      if (!r.ok) {
        lastErr = `HTTP ${r.status}`
        continue
      }
      const j = (await r.json()) as {
        chart?: {
          result?: {
            timestamp?: number[]
            indicators?: { adjclose?: { adjclose?: (number | null)[] }[] }
          }[]
        }
      }
      const res = j.chart?.result?.[0]
      const ts = res?.timestamp
      const adj = res?.indicators?.adjclose?.[0]?.adjclose
      if (!ts || !adj || ts.length !== adj.length) {
        lastErr = "รูปแบบ response ไม่ครบ"
        continue
      }
      const months: string[] = []
      const closes: number[] = []
      for (let i = 0; i < ts.length; i++) {
        const v = adj[i]
        if (v === null || v === undefined || !Number.isFinite(v) || v <= 0) continue
        months.push(tsToMonth(ts[i]))
        closes.push(v)
      }
      if (months.length > 24) return { months, closes }
      lastErr = "ข้อมูลสั้นเกินไป"
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
    }
  }
  throw new Error(lastErr)
}

/** แก้ Stooq PoW challenge แบบเดียวกับ browser (sha256 proof) */
async function stooqCookie(referer: string): Promise<string | null> {
  try {
    const r1 = await fetchWithTimeout("https://stooq.com/q/?s=spy.us", {
      headers: { "User-Agent": UA, Accept: "text/html" },
    })
    const html = await r1.text()
    const cm = html.match(/c="([^"]+)"/)
    const dm = html.match(/d=(\d+)/)
    if (!cm || !dm) return null
    const c = cm[1]
    const d = parseInt(dm[1], 10)
    const target = "0".repeat(d)
    const enc = new TextEncoder()
    let n = 0
    while (true) {
      const h = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(c + n))))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
      if (h.startsWith(target)) break
      n++
      if (n > 5_000_000) return null
    }
    const r2 = await fetchWithTimeout("https://stooq.com/__verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": UA,
        Origin: "https://stooq.com",
        Referer: referer,
      },
      body: `c=${encodeURIComponent(c)}&n=${n}`,
    })
    const cookies = (r2.headers.getSetCookie?.() ?? []).map((x) => x.split(";")[0])
    return cookies.length > 0 ? cookies.join("; ") : null
  } catch {
    return null
  }
}

async function fetchStooqMonthly(ticker: string, cookie: string): Promise<{ months: string[]; closes: number[] }> {
  const url = `https://stooq.com/q/d/l/?s=${ticker.toLowerCase()}.us&i=m`
  const r = await fetchWithTimeout(url, {
    headers: { "User-Agent": UA, Accept: "text/csv,*/*", Referer: "https://stooq.com/q/?s=spy.us", Cookie: cookie },
  })
  const text = await r.text()
  if (text.includes("Access denied")) throw new Error("endpoint ปิดสำหรับ IP นี้ (Access denied)")
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 25) throw new Error("CSV สั้นเกินไป")
  const months: string[] = []
  const closes: number[] = []
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",")
    const d = cells[0] ?? ""
    const m = d.match(/^(\d{4})-(\d{2})/)
    const v = Number(cells[4])
    if (!m || !Number.isFinite(v) || v <= 0) continue
    months.push(`${m[1]}-${m[2]}`)
    closes.push(v)
  }
  if (months.length < 25) throw new Error("ข้อมูลสั้นเกินไป")
  return { months, closes }
}

export interface FetchOutcome {
  ok: boolean
  panel: GtaaPanel | null
  attempts: { source: string; detail: string }[]
  tickersOk: string[]
  tickersFail: { ticker: string; detail: string }[]
}

/** ดึงข้อมูลจริงทุกตัว (Yahoo → Stooq) แล้วประกอบเป็น panel — ok=false เมื่อ universe < 4 ตัว */
export async function fetchRealPanel(): Promise<FetchOutcome> {
  const attempts: FetchOutcome["attempts"] = []
  const tickers = [...GTAA_UNIVERSE.map((a) => a.ticker), "BIL", "SPY"]
  const data = new Map<string, { months: string[]; closes: number[] }>()
  const tickersFail: { ticker: string; detail: string }[] = []

  // Yahoo ก่อน
  let yahooBlocked = 0
  for (const ticker of tickers) {
    try {
      data.set(ticker, await fetchYahooMonthly(ticker))
    } catch (e) {
      yahooBlocked++
      tickersFail.push({ ticker, detail: `yahoo: ${e instanceof Error ? e.message : String(e)}` })
    }
  }
  // เหตุผลจริงจากแต่ละตัว (เช่น HTTP 403 / 429 / timeout) — ไม่เดาว่าเป็น rate limit
  const yahooReasons = [...new Set(tickersFail.map((f) => f.detail.replace(/^yahoo: /, "")))].slice(0, 3).join(" · ")
  attempts.push({
    source: "yahoo",
    detail:
      yahooBlocked === tickers.length
        ? `ดึงไม่ได้ทั้งหมด (${yahooReasons})`
        : `ได้ ${tickers.length - yahooBlocked}/${tickers.length} ตัว`,
  })

  // Stooq เฉพาะตัวที่ยังขาด (ถ้า Yahoo ตายหมด = ทุกตัว)
  const fromStooq: string[] = []
  if (yahooBlocked > 0) {
    const cookie = await stooqCookie("https://stooq.com/q/?s=spy.us")
    if (cookie) {
      for (const ticker of tickers.filter((t) => !data.has(t))) {
        try {
          data.set(ticker, await fetchStooqMonthly(ticker, cookie))
          fromStooq.push(ticker)
          tickersFail.splice(tickersFail.findIndex((f) => f.ticker === ticker), 1)
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          const idx = tickersFail.findIndex((f) => f.ticker === ticker)
          if (idx >= 0) tickersFail[idx].detail = `stooq: ${msg}`
        }
      }
      attempts.push({ source: "stooq", detail: `ได้ ${[...data.keys()].length} ตัวรวม` })
    } else {
      attempts.push({ source: "stooq", detail: "แก้ PoW ไม่สำเร็จ" })
    }
  }

  const universeOk = GTAA_UNIVERSE.filter((a) => data.has(a.ticker))
  if (universeOk.length < 4) {
    return {
      ok: false,
      panel: null,
      attempts,
      tickersOk: [...data.keys()],
      tickersFail,
    }
  }

  // ประกอบ panel บนกริดเดือนร่วมของแต่ละตัว (leading null = ยังไม่ IPO)
  const allMonths = new Set<string>()
  for (const { months } of data.values()) for (const m of months) allMonths.add(m)
  const dates = [...allMonths].sort()

  const closes: Record<string, (number | null)[]> = {}
  const assets = ALL_ASSETS.filter((a) => data.has(a.ticker))
  for (const a of assets) {
    const d = data.get(a.ticker)!
    const map = new Map(d.months.map((m, i) => [m, d.closes[i]]))
    closes[a.ticker] = dates.map((m) => map.get(m) ?? null)
  }

  // ป้ายแหล่งข้อมูลตามจริง — Stooq เป็นราคาปิดไม่ปรับปันผล (docs §7) ห้ามติดป้าย "Yahoo adjclose" ให้ตัวที่มาจาก Stooq
  const yahooCount = data.size - fromStooq.length
  const notes: string[] = [
    `ดึงข้อมูลจริงเมื่อ ${new Date().toISOString()} — ${yahooCount > 0 ? "Yahoo adjclose (ปรับปันผล)" : "Stooq close (ไม่ปรับปันผล)"}`,
  ]
  if (fromStooq.length > 0 && yahooCount > 0) {
    notes.push(`${fromStooq.join(", ")} มาจาก Stooq — ราคาปิดไม่ปรับปันผล (โมเมนตัมบอนด์/REIT จะอ่านต่ำกว่าจริง)`)
  }
  if (!data.has("BIL")) notes.push("ไม่มี BIL — ควรเพิ่มในไฟล์ก่อนใช้จริง (engine จะใช้ชุดแทนไม่ได้เพราะไม่ได้เติมให้)")
  if (!data.has("SPY")) notes.push("ไม่มี SPY — benchmark จะแสดงเป็น 0")

  return {
    ok: true,
    panel: {
      meta: { source: yahooCount > 0 ? "yahoo" : "stooq", fetchedAt: new Date().toISOString(), notes },
      dates,
      assets,
      closes,
    },
    attempts,
    tickersOk: [...data.keys()],
    tickersFail,
  }
}
