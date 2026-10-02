// ============================================================
// Component tests (React Testing Library บน happy-dom — preload src/test/setup.ts)
// ครอบคลุมส่วน UI ที่เพิ่ม/แก้ในรอบปิดช่องว่าง: ป้ายข้อมูลจาก provenance, สิทธิ์ผู้ชม, กติกา/robustness,
// journal P&L (commit ตอน blur), a11y ที่ axe เคยจับได้ (ปุ่มซ้อนปุ่ม, ticker ซ้ำ, slider ไม่มีชื่อ), หน้า error/404/terms
// fetch ถูกแทนด้วย stub ต่อ test (คืนค่าเดิมทุกครั้ง) — ไม่มีเครือข่ายจริง
// ============================================================

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { AppFooter } from "@/components/app-footer"
import { FirstRunGuide } from "@/components/first-run-guide"
import { AppMetaProvider, dataKindTag, type AppMeta } from "@/components/providers/app-meta"
import { PnlInput } from "@/components/quant/backtest-journal-tab"
import { GateChips, KpiCard, Panel, SignalBadge } from "@/components/quant/quant-widgets"
import { RobustnessPanel, RulesPanel, RulesStatusBadge } from "@/components/quant/research-integrity"
import { TickerTape } from "@/components/dashboard/primitives"
import { Watchlist } from "@/components/terminal/watchlist"
import { Slider } from "@/components/ui/slider"
import { Toaster } from "@/components/ui/toaster"
import RouteError from "@/app/error"
import { AuditorTab } from "@/components/quant/auditor-tab"
import { AiPanel } from "@/components/terminal/ai-panel"
import NotFound from "@/app/not-found"
import TermsPage from "@/app/terms/page"
import { errorText } from "@/hooks/use-api"
import type { QuoteRowT, RobustnessReportT, RulesResponseT } from "@/lib/quant/api-types"

// ───────── fixtures ─────────

const RULES_HASH = "7aa407b1494de3145c2396a03daf127296487f88464f6846a648b57201f16e97"

function meta(over: Partial<AppMeta> = {}): AppMeta {
  return {
    app: { name: "Omniscient Quant Engine", version: "9.9.9", commit: null },
    data: {
      kind: "synthetic",
      label: "ข้อมูลจำลองเพื่อการสาธิต · seed 20250902 · 22 หุ้น × 750 วัน",
      source: "generator seed 20250902",
      license: null,
      stocks: 22,
      firstDate: "2023-11-13",
      lastDate: "2026-09-25",
      freshness: { status: "synthetic", lagSessions: null, expectedSession: "2026-09-28", notes: ["ข้อมูลจำลอง"] },
      coverage: { fundamentals: 22, flows: 22 },
    },
    rules: { hash: RULES_HASH, hashShort: RULES_HASH.slice(0, 12), version: "2026-09-28.1", registered: null, matchesRegistered: false, tunedOn: "synthetic" },
    llm: { provider: null, configured: false },
    access: { mode: "local", actor: "local", canWrite: true },
    ...over,
  }
}

const rulesResponse = (over: Partial<RulesResponseT> = {}): RulesResponseT => ({
  hash: RULES_HASH,
  hashShort: RULES_HASH.slice(0, 12),
  version: "2026-09-28.1",
  registered: null,
  matchesRegistered: false,
  tunedOn: "ข้อมูลจำลอง (synthetic) seed 20250902 · 22 หุ้น × 750 วัน",
  provenance: { tunedOn: "ข้อมูลจำลอง (synthetic) seed 20250902 · 22 หุ้น × 750 วัน", note: "จูนบนข้อมูลชุดเดียวกัน", source: "worklog" },
  rules: { seed: 20250902 },
  history: [],
  ...over,
})

const robustness: RobustnessReportT = {
  rulesHash: RULES_HASH,
  demoSeed: 20250902,
  seeds: [20250902, 11],
  runs: [
    { seed: 20250902, nSignals: 73, hitRate: 61.6, hitRateCI: [50.2, 71.9], sharpe: 0.73, maxDD: 5.7, cumStrat: 6.1, cumBase: 38.6, regime: "RECOVERY", attribution: [], tookMs: 3000 },
    { seed: 11, nSignals: 19, hitRate: 31.6, hitRateCI: [15.4, 54], sharpe: -0.98, maxDD: 6.8, cumStrat: -5.8, cumBase: 27.9, regime: "DISTRIBUTION", attribution: [], tookMs: 3000 },
  ],
  summary: {
    hitRate: { mean: 46.6, min: 31.6, max: 61.6, std: 21.2 },
    sharpe: { mean: -0.1, min: -0.98, max: 0.73, std: 1.2 },
    maxDD: { mean: 6.2, min: 5.7, max: 6.8 },
    beatsBuyHold: 0,
    gates: [
      { gate: "G1", speaksTruth: 2, positiveEdge: 2, meanEdge: 0.246, minEdge: 0.1, maxEdge: 0.4, label: "ROBUST" },
      { gate: "G2", speaksTruth: 0, positiveEdge: 1, meanEdge: -0.037, minEdge: -0.09, maxEdge: 0.02, label: "NOISE" },
    ],
    verdict: "MIXED",
    note: "ผลกระจายข้าม seed",
  },
  computedAt: "2026-09-29T03:00:00.000Z",
  tookMs: 6000,
}

function quote(symbol: string, over: Partial<QuoteRowT> = {}): QuoteRowT {
  return {
    symbol, name: `${symbol} PCL`, sector: "Energy", theme: "Energy-Chain", price: 10, chg1d: 1.2, chg5d: 2, chg21d: 3, rsi: 55,
    signal: "NO_TRADE", phase: "IDLE", phaseNum: 0, probUp: 0.5, decoupled: false,
    gates: { g1: true, g2: false, g3: true, g4: true, g5: false },
    entryLow: 9.5, entryHigh: 9.8, stopStruct: 9, stopHard: 8.8, maxSizePct: 5, volume: 1.2, adv20: 1, volRatio: 1.2,
    spark: [9, 9.5, 10], valueM: 12, ...over,
  }
}

// ───────── fetch stub ─────────

type Route = (url: string, init?: RequestInit) => { status?: number; body: unknown } | undefined
const realFetch = globalThis.fetch
let calls: Array<{ url: string; method: string; body?: string }> = []

function stubFetch(route: Route) {
  calls = []
  globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
    calls.push({ url, method: init?.method ?? "GET", body: typeof init?.body === "string" ? init.body : undefined })
    const hit = route(url, init)
    if (!hit) return new Response(JSON.stringify({ error: "not stubbed" }), { status: 500 })
    return new Response(JSON.stringify(hit.body), { status: hit.status ?? 200, headers: { "content-type": "application/json" } })
  }) as unknown as typeof fetch
}

beforeEach(() => {
  try {
    window.localStorage.clear()
  } catch {}
})
afterEach(() => {
  cleanup()
  globalThis.fetch = realFetch
})

// ───────── tests ─────────

describe("quant-widgets", () => {
  test("KpiCard: ป้าย ค่า คำอธิบาย และสีตาม tone", () => {
    render(<KpiCard label="Hit Rate" value="61.6%" sub="95% CI 50.2–71.9%" tone="warn" />)
    expect(screen.getByText("Hit Rate")).toBeDefined()
    expect(screen.getByText("61.6%").className).toContain("text-amber-300")
    expect(screen.getByText("95% CI 50.2–71.9%")).toBeDefined()
  })

  test("Panel: หัวข้อเป็น heading + ส่วนขวา + เนื้อหา", () => {
    render(
      <Panel title="กติกา" subtitle="คำอธิบาย" right={<button type="button">ล็อก</button>}>
        <p>เนื้อหา</p>
      </Panel>,
    )
    expect(screen.getByRole("heading", { name: "กติกา" })).toBeDefined()
    expect(screen.getByRole("button", { name: "ล็อก" })).toBeDefined()
    expect(screen.getByText("เนื้อหา")).toBeDefined()
  })

  test("GateChips: 5 ชิป บอกผ่าน/ตกใน title · SignalBadge แปลชื่อสัญญาณ", () => {
    render(
      <>
        <GateChips gates={{ g1: true, g2: false, g3: true, g4: true, g5: false }} />
        <SignalBadge signal="ENTRY_PULLBACK" />
      </>,
    )
    expect(screen.getByTitle("G1 Regime: ผ่าน")).toBeDefined()
    expect(screen.getByTitle("G2 Dependence: ตก")).toBeDefined()
    expect(screen.getByText("เข้าแบบ Pullback")).toBeDefined()
  })
})

describe("research integrity — กติกา + robustness", () => {
  test("RulesStatusBadge: ยังไม่ล็อก / ตรง / ถูกแก้หลังล็อก", () => {
    const reg = { hash: RULES_HASH, hashShort: "x", at: "2026-09-29T00:00:00Z", note: null, actor: "local", version: "v" }
    const { rerender } = render(<RulesStatusBadge rules={{ registered: null, matchesRegistered: false }} />)
    expect(screen.getByText("ยังไม่ล็อก")).toBeDefined()
    rerender(<RulesStatusBadge rules={{ registered: reg, matchesRegistered: true }} />)
    expect(screen.getByText("ตรงกับที่ล็อกไว้")).toBeDefined()
    rerender(<RulesStatusBadge rules={{ registered: reg, matchesRegistered: false }} />)
    expect(screen.getByText("ถูกแก้หลังล็อก")).toBeDefined()
  })

  test("RulesPanel: แสดง hash + ป้ายจูนบนข้อมูลจำลอง · กดล็อก → POST พร้อมเหตุผล แล้วโหลดใหม่", async () => {
    let locked = false
    stubFetch((url, init) => {
      if (url === "/api/rules" && init?.method === "POST") {
        locked = true
        return { status: 201, body: { registration: { hash: RULES_HASH } } }
      }
      if (url === "/api/rules") {
        const reg = { hash: RULES_HASH, hashShort: RULES_HASH.slice(0, 12), at: "2026-09-29T00:00:00Z", note: "ก่อน forward test", actor: "local", version: "2026-09-28.1" }
        return { body: rulesResponse(locked ? { registered: reg, matchesRegistered: true } : {}) }
      }
      if (url === "/api/meta") return { body: meta() }
    })
    render(
      <AppMetaProvider>
        <RulesPanel />
        <Toaster />
      </AppMetaProvider>,
    )
    await screen.findByText(RULES_HASH.slice(0, 12))
    expect(screen.getByText("จูนบนข้อมูลจำลอง")).toBeDefined()
    expect(screen.getByText("ยังไม่ล็อก")).toBeDefined()
    fireEvent.change(screen.getByLabelText("บันทึกเหตุผลการล็อก (ไม่บังคับ)"), { target: { value: "ก่อน forward test" } })
    fireEvent.click(screen.getByRole("button", { name: "ล็อกกติกาชุดนี้" }))
    await screen.findByText("ตรงกับที่ล็อกไว้")
    const post = calls.find((c) => c.method === "POST")
    expect(post?.body).toBe(JSON.stringify({ note: "ก่อน forward test" }))
  })

  test("RulesPanel: ผู้ชม (อ่านอย่างเดียว) → ปุ่มล็อกถูกปิด", async () => {
    stubFetch((url) => (url === "/api/rules" ? { body: rulesResponse() } : url === "/api/meta" ? { body: meta({ access: { mode: "auth", actor: "viewer", canWrite: false } }) } : undefined))
    render(
      <AppMetaProvider>
        <RulesPanel />
      </AppMetaProvider>,
    )
    await screen.findByText(RULES_HASH.slice(0, 12))
    await waitFor(() => expect((screen.getByRole("button", { name: "ล็อกกติกาชุดนี้" }) as HTMLButtonElement).disabled).toBe(true))
  })

  test("RobustnessPanel: ไม่ยิงคำขอจนกว่าจะกด · กดแล้วแสดงคำตัดสิน ตาราง seed (ติดป้าย demo) และป้าย gate", async () => {
    stubFetch((url) => (url === "/api/research/robustness" ? { body: robustness } : undefined))
    render(<RobustnessPanel />)
    expect(calls).toHaveLength(0)
    fireEvent.click(screen.getByRole("button", { name: "รันทดสอบ 5 seed" }))
    await screen.findByText("ปนกัน (MIXED)")
    const seeds = screen.getByRole("region", { name: "ผลต่อ seed" })
    expect(within(seeds).getByText("demo")).toBeDefined()
    expect(within(seeds).getAllByRole("row")).toHaveLength(3)
    const gates = screen.getByRole("region", { name: "ความทนทานต่อ gate" })
    expect(within(gates).getByText("ROBUST")).toBeDefined()
    expect(within(gates).getByText("NOISE")).toBeDefined()
    expect(within(gates).getByText("24.6")).toBeDefined() // meanEdge % → bp
  })
})

describe("app meta — ป้ายข้อมูล/สิทธิ์จาก /api/meta", () => {
  test("dataKindTag: จำลอง / ข้อมูลจริง / ไม่ทราบ", () => {
    expect(dataKindTag(null)).toBe("")
    expect(dataKindTag(meta())).toBe("จำลอง")
    expect(dataKindTag(meta({ data: { ...meta().data, kind: "real" } }))).toBe("ข้อมูลจริง")
    expect(dataKindTag(meta({ data: { ...meta().data, kind: "unknown" } }))).toBe("ไม่ทราบที่มา")
  })

  test("AppFooter: เวอร์ชัน ป้ายข้อมูล กติกา LLM ลิงก์ข้อกำหนด · ผู้ชมเห็นป้ายอ่านอย่างเดียว", async () => {
    stubFetch((url) => (url === "/api/meta" ? { body: meta({ access: { mode: "auth", actor: "viewer", canWrite: false } }) } : undefined))
    render(
      <AppMetaProvider>
        <AppFooter busy={false} />
      </AppMetaProvider>,
    )
    await screen.findByText("OQE v9.9.9")
    expect(screen.getByText(/ข้อมูลจำลองเพื่อการสาธิต/)).toBeDefined()
    expect(screen.getByText(/ยังไม่ล็อก/)).toBeDefined()
    expect(screen.getByText(/LLM: ไม่ได้ตั้งค่า/)).toBeDefined()
    expect(screen.getByText("ผู้ชม (อ่านอย่างเดียว)")).toBeDefined()
    expect(screen.getByRole("link", { name: "ข้อกำหนดและข้อจำกัด" }).getAttribute("href")).toBe("/terms")
  })

  test("AppFooter: ข้อมูลจริงที่ค้าง → สีเตือน + ข้อความจาก provenance (ไม่เขียนตายตัว)", async () => {
    const stale = meta({ data: { ...meta().data, kind: "real", label: "ข้อมูลจริง · csv · 30 หุ้น · ถึง 2026-09-18 (ค้าง 6 วันซื้อขาย)", freshness: { status: "stale", lagSessions: 6, expectedSession: "2026-09-28", notes: ["ข้อมูลค้าง"] } } })
    stubFetch((url) => (url === "/api/meta" ? { body: stale } : undefined))
    render(
      <AppMetaProvider>
        <AppFooter busy />
      </AppMetaProvider>,
    )
    const label = await screen.findByText(/ค้าง 6 วันซื้อขาย/)
    expect(label.className).toContain("text-rose-300")
    expect(screen.getByRole("status").textContent).toContain("pipeline running")
  })
})

describe("FirstRunGuide", () => {
  test("แสดงครั้งแรก · ลิงก์พาไปแท็บ · ปิดแล้วจำใน localStorage และไม่แสดงอีก", async () => {
    stubFetch((url) => (url === "/api/meta" ? { body: meta() } : undefined))
    const onNavigate = mock((_v: string) => {})
    const { unmount } = render(
      <AppMetaProvider>
        <FirstRunGuide onNavigate={onNavigate} />
      </AppMetaProvider>,
    )
    const guide = await screen.findByRole("region", { name: "เริ่มต้นใช้งานใน 1 นาที" })
    await within(guide).findByText(/ข้อมูลจำลองเพื่อการสาธิต/)
    fireEvent.click(within(guide).getByRole("button", { name: /^Apex/ }))
    expect(onNavigate).toHaveBeenCalledWith("apex")
    fireEvent.click(within(guide).getByRole("button", { name: "เข้าใจแล้ว ไม่ต้องแสดงอีก" }))
    expect(screen.queryByRole("region", { name: "เริ่มต้นใช้งานใน 1 นาที" })).toBeNull()
    expect(window.localStorage.getItem("oqe-first-run-v1")).toBe("done")
    unmount()
    await act(async () => {
      render(
        <AppMetaProvider>
          <FirstRunGuide onNavigate={onNavigate} />
        </AppMetaProvider>,
      )
      await new Promise((r) => setTimeout(r, 0)) // ให้ fetch ของ provider ตัวใหม่จบภายใน act
    })
    expect(screen.queryByRole("region", { name: "เริ่มต้นใช้งานใน 1 นาที" })).toBeNull()
  })

  test("ปุ่ม X ปิดได้เหมือนกัน", async () => {
    stubFetch((url) => (url === "/api/meta" ? { body: meta() } : undefined))
    render(
      <AppMetaProvider>
        <FirstRunGuide onNavigate={() => {}} />
      </AppMetaProvider>,
    )
    await screen.findByText(/ข้อมูลจำลองเพื่อการสาธิต/)
    fireEvent.click(screen.getByRole("button", { name: "ปิดคำแนะนำ" }))
    expect(screen.queryByRole("region", { name: "เริ่มต้นใช้งานใน 1 นาที" })).toBeNull()
  })
})

describe("PnlInput — ไม่ยิง PATCH ทุกตัวอักษร", () => {
  test("พิมพ์ได้อิสระ · บันทึกครั้งเดียวตอน blur · Enter = blur", () => {
    const onCommit = mock((_v: number | null) => {})
    render(<PnlInput initial={null} symbol="PTT" disabled={false} onCommit={onCommit} />)
    const input = screen.getByRole("spinbutton", { name: "P&L % ของ PTT" })
    fireEvent.change(input, { target: { value: "-" } })
    fireEvent.change(input, { target: { value: "-1" } })
    fireEvent.change(input, { target: { value: "-1.5" } })
    expect(onCommit).not.toHaveBeenCalled()
    fireEvent.blur(input)
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledWith(-1.5)
  })

  test("ค่าเดิม = ไม่บันทึก · ลบค่า = ส่ง null · ปิดเมื่อเป็นผู้ชม", () => {
    const onCommit = mock((_v: number | null) => {})
    const { rerender } = render(<PnlInput initial={2} symbol="AOT" disabled={false} onCommit={onCommit} />)
    const input = screen.getByRole("spinbutton", { name: "P&L % ของ AOT" }) as HTMLInputElement
    fireEvent.blur(input)
    expect(onCommit).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { value: "" } })
    fireEvent.blur(input)
    expect(onCommit).toHaveBeenCalledWith(null)
    rerender(<PnlInput initial={2} symbol="AOT" disabled onCommit={onCommit} />)
    expect((screen.getByRole("spinbutton", { name: "P&L % ของ AOT" }) as HTMLInputElement).disabled).toBe(true)
  })
})

describe("a11y regressions (จากผล axe)", () => {
  test("Watchlist: ปุ่มดาวกับปุ่มเลือกแถวเป็นพี่น้องกัน ไม่มีปุ่มซ้อนปุ่ม · กดดาวไม่เลือกแถว", () => {
    const onSelect = mock((_s: string) => {})
    const onToggleFav = mock((_s: string) => {})
    const { container } = render(
      <Watchlist
        quotes={[quote("PTT"), quote("AOT", { chg1d: -0.5 })]}
        lastDate="2026-09-25"
        loading={false}
        symbol="PTT"
        onSelect={onSelect}
        favorites={["AOT"]}
        onToggleFav={onToggleFav}
        activeTab="market"
        onTabChange={() => {}}
      />,
    )
    expect(container.querySelectorAll("button button, [role=button] button, button [role=button]")).toHaveLength(0)
    const star = screen.getByRole("button", { name: "เก็บ PTT ไว้ในรายการโปรด" })
    expect(star.getAttribute("aria-pressed")).toBe("false")
    expect(screen.getByRole("button", { name: "เอา AOT ออกจากรายการโปรด" }).getAttribute("aria-pressed")).toBe("true")
    fireEvent.click(star)
    expect(onToggleFav).toHaveBeenCalledWith("PTT")
    expect(onSelect).not.toHaveBeenCalled()
  })

  test("TickerTape: ชุดซ้ำสำหรับวิ่งต่อเนื่องเป็น inert + aria-hidden และปุ่มในชุดนั้นไม่รับโฟกัส", () => {
    const { container } = render(<TickerTape items={[{ symbol: "PTT", price: 33.5, chg1d: 1.2 }]} onSelectSymbol={() => {}} />)
    const hidden = container.querySelector('div[aria-hidden="true"]')!
    expect(hidden.hasAttribute("inert")).toBe(true)
    expect(hidden.querySelector("button")!.getAttribute("tabindex")).toBe("-1")
    expect(screen.getAllByRole("button", { name: /^PTT ราคา 33.50/ })).toHaveLength(1)
  })

  test("Slider: thumb (role=slider) มีชื่อและค่าที่อ่านออกเสียงได้", () => {
    render(<Slider thumbLabel="งบเสี่ยงต่อไม้" thumbValueText="1.00% ของพอร์ต" value={[1]} min={0.25} max={3} step={0.25} />)
    const slider = screen.getByRole("slider", { name: "งบเสี่ยงต่อไม้" })
    expect(slider.getAttribute("aria-valuetext")).toBe("1.00% ของพอร์ต")
  })
})

describe("หน้า error / 404 / terms", () => {
  test("RouteError: แสดง digest ไม่แสดงข้อความภายใน · กดลองอีกครั้งเรียก reset", () => {
    const reset = mock(() => {})
    const origError = console.error
    console.error = () => {}
    try {
      render(<RouteError error={Object.assign(new Error("SQLITE_BUSY: database is locked at /srv/db"), { digest: "abc123" })} reset={reset} />)
    } finally {
      console.error = origError
    }
    expect(screen.getByRole("alert").textContent).toContain("abc123")
    expect(screen.getByRole("alert").textContent).not.toContain("SQLITE_BUSY")
    fireEvent.click(screen.getByRole("button", { name: "ลองอีกครั้ง" }))
    expect(reset).toHaveBeenCalledTimes(1)
  })

  test("NotFound: ข้อความ 404 + ลิงก์กลับหน้าหลัก", () => {
    render(<NotFound />)
    expect(screen.getByRole("heading", { name: "ไม่พบหน้าที่ต้องการ" })).toBeDefined()
    expect(screen.getByRole("link", { name: "กลับหน้าหลัก" }).getAttribute("href")).toBe("/")
  })

  test("Terms: h1 เดียว + 6 หัวข้อ + บอกชัดว่าไม่ใช่คำแนะนำการลงทุน/ข้อมูลจำลอง/ไม่มี license", () => {
    render(<TermsPage />)
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1)
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(6)
    const text = document.body.textContent ?? ""
    expect(text).toContain("ไม่ใช่คำแนะนำการลงทุน")
    expect(text).toContain("ไม่ใช่ราคาตลาดจริง")
    expect(text).toContain("ยังไม่ได้ระบุสัญญาอนุญาต")
  })
})

describe("use-api errorText — ข้อความ error ที่อ่านรู้เรื่อง", () => {
  const res = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
  test("400 จาก zod: message + ช่องที่ผิด", async () => {
    expect(await errorText(res(400, { error: "bad_request", message: "ข้อมูลไม่ถูกต้อง", issues: [{ path: "price", message: "ต้องไม่ติดลบ" }] }))).toBe("ข้อมูลไม่ถูกต้อง — price: ต้องไม่ติดลบ")
  })
  test("proxy 403 / LLM 503 / 500 พร้อม errorId / body ไม่ใช่ JSON", async () => {
    expect(await errorText(res(403, { error: "ผู้ชม: อ่านอย่างเดียว", code: "read_only" }))).toBe("ผู้ชม: อ่านอย่างเดียว")
    expect(await errorText(res(503, { error: "llm_unavailable", detail: "ยังไม่ได้ตั้งค่า LLM" }))).toBe("ยังไม่ได้ตั้งค่า LLM")
    expect(await errorText(res(500, { error: "journal create failed", errorId: "a1b2c3d4" }))).toBe("journal create failed (errorId a1b2c3d4)")
    expect(await errorText(new Response("oops", { status: 502 }))).toBe("HTTP 502")
  })
})

describe("act() sanity", () => {
  test("provider ที่ fetch ล้มเหลวไม่ทำให้ UI พัง (meta = null → ใช้ค่าเริ่มต้นที่ปลอดภัย)", async () => {
    stubFetch(() => ({ status: 500, body: { error: "down" } }))
    await act(async () => {
      render(
        <AppMetaProvider>
          <AppFooter busy={false} />
        </AppMetaProvider>,
      )
    })
    expect(screen.getByText("กำลังโหลดที่มาของข้อมูล…")).toBeDefined()
    expect(screen.getByRole("link", { name: "ข้อกำหนดและข้อจำกัด" })).toBeDefined()
  })
})

describe("สิทธิ์และ LLM ที่ปุ่ม AI", () => {
  test("AuditorTab: ระหว่างโหลดประวัติไม่บอกว่า 'ยังไม่มีรายงาน' · ไม่มี LLM → ปุ่มปิด + คำอธิบายที่มองเห็น", async () => {
    stubFetch((url) => (url === "/api/meta" ? { body: meta() } : undefined))
    const { rerender } = render(
      <AppMetaProvider>
        <AuditorTab reports={null} loading onDone={() => {}} />
      </AppMetaProvider>,
    )
    expect(screen.getByText("กำลังโหลดประวัติรายงาน…")).toBeDefined()
    expect(screen.queryByText("ยังไม่มีรายงาน audit")).toBeNull()
    await screen.findByText(/ยังไม่ได้ตั้งค่า LLM/)
    expect((screen.getByRole("button", { name: "รัน Audit ตอนนี้" }) as HTMLButtonElement).disabled).toBe(true)
    rerender(
      <AppMetaProvider>
        <AuditorTab reports={[]} loading={false} onDone={() => {}} />
      </AppMetaProvider>,
    )
    expect(screen.getByText("ยังไม่มีรายงาน audit")).toBeDefined()
  })

  test("AiPanel: ผู้ชม → ช่องแชทปิดพร้อมเหตุผล", async () => {
    stubFetch((url) => (url === "/api/meta" ? { body: meta({ llm: { provider: "openai-compatible · gpt", configured: true }, access: { mode: "auth", actor: "viewer", canWrite: false } }) } : undefined))
    render(
      <AppMetaProvider>
        <AiPanel data={null} loading={false} onAsk={async () => "x"} />
      </AppMetaProvider>,
    )
    await waitFor(() => expect((screen.getByRole("textbox", { name: "ถาม AI นักวิเคราะห์" }) as HTMLInputElement).disabled).toBe(true))
    expect(screen.getByText(/ผู้ชม: อ่านอย่างเดียว/)).toBeDefined()
  })

  test("AiPanel: ตั้งค่า LLM แล้ว → Enter ส่งคำถาม คำตอบแสดงในบทสนทนา (role=log)", async () => {
    stubFetch((url) => (url === "/api/meta" ? { body: meta({ llm: { provider: "openai-compatible · gpt", configured: true } }) } : undefined))
    const onAsk = mock(async (q: string) => `ตอบ: ${q}`)
    render(
      <AppMetaProvider>
        <AiPanel data={null} loading={false} onAsk={onAsk} />
      </AppMetaProvider>,
    )
    const input = screen.getByRole("textbox", { name: "ถาม AI นักวิเคราะห์" }) as HTMLInputElement
    await waitFor(() => expect(input.disabled).toBe(false))
    fireEvent.change(input, { target: { value: "แนวรับอยู่ไหน" } })
    fireEvent.keyDown(input, { key: "Enter" })
    await within(screen.getByRole("log", { name: "บทสนทนากับ AI" })).findByText("ตอบ: แนวรับอยู่ไหน")
    expect(onAsk).toHaveBeenCalledTimes(1)
  })
})

describe("กรณีเพิ่มเติม", () => {
  test("Watchlist แท็บรายการโปรด: แสดงเฉพาะตัวที่ติดดาว", () => {
    render(
      <Watchlist
        quotes={[quote("PTT"), quote("AOT"), quote("SCB")]}
        lastDate="2026-09-25"
        loading={false}
        symbol="PTT"
        onSelect={() => {}}
        favorites={["AOT"]}
        onToggleFav={() => {}}
        activeTab="favorites"
        onTabChange={() => {}}
      />,
    )
    expect(screen.getByRole("button", { name: "เอา AOT ออกจากรายการโปรด" })).toBeDefined()
    expect(screen.queryByRole("button", { name: "เก็บ PTT ไว้ในรายการโปรด" })).toBeNull()
  })

  test("RobustnessPanel: server ล้ม → ข้อความ error แบบ role=alert (ไม่ค้างหมุน)", async () => {
    stubFetch(() => ({ status: 500, body: { error: "robustness failed", errorId: "deadbeef" } }))
    render(<RobustnessPanel />)
    fireEvent.click(screen.getByRole("button", { name: "รันทดสอบ 5 seed" }))
    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toContain("robustness failed (errorId deadbeef)")
  })

  test("RulesPanel: ประวัติการล็อก — hash ปัจจุบันเน้นสี · มีเหตุผลกำกับ", async () => {
    const history = [
      { id: "1", createdAt: "2026-09-29T00:00:00Z", rulesHash: RULES_HASH, hashShort: RULES_HASH.slice(0, 12), rulesVersion: "2026-09-28.1", note: "ล็อกรอบ ต.ค.", actor: "basic" },
      { id: "2", createdAt: "2026-09-01T00:00:00Z", rulesHash: "f".repeat(64), hashShort: "ffffffffffff", rulesVersion: "old", note: null, actor: "local" },
    ]
    stubFetch((url) => (url === "/api/rules" ? { body: rulesResponse({ history }) } : url === "/api/meta" ? { body: meta() } : undefined))
    render(
      <AppMetaProvider>
        <RulesPanel />
      </AppMetaProvider>,
    )
    await screen.findByText("ประวัติการล็อก")
    expect(screen.getByText("— ล็อกรอบ ต.ค.")).toBeDefined()
    expect(screen.getByText("ffffffffffff").className).toContain("text-zinc-400")
    expect(screen.getAllByText(RULES_HASH.slice(0, 12)).some((el) => el.className.includes("text-emerald-300"))).toBe(true)
  })

  test("AppFooter: ตั้งค่า LLM + ผู้ดูแล → แสดงผู้ให้บริการ ไม่มีป้ายผู้ชม", async () => {
    stubFetch((url) => (url === "/api/meta" ? { body: meta({ llm: { provider: "openai-compatible · gpt-4o-mini", configured: true } }) } : undefined))
    render(
      <AppMetaProvider>
        <AppFooter busy={false} />
      </AppMetaProvider>,
    )
    await screen.findByText("LLM: openai-compatible · gpt-4o-mini")
    expect(screen.queryByText("ผู้ชม (อ่านอย่างเดียว)")).toBeNull()
  })
})
