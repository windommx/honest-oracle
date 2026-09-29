/// <reference types="bun-types" />
// ============================================================
// E2E + accessibility gate ของ build โปรดักชัน (Playwright + axe-core) — ใช้ใน CI และ bun run verify
//
//   bun deploy/e2e.ts                        # เปิด standalone server เองบนสำเนา db/custom.db (LLM ปิด)
//   bun deploy/e2e.ts --base-url http://127.0.0.1:3000
//   ตัวเลือก: --db <ไฟล์ .db | empty> --port 3220 --out .e2e --headed
//
// ผ่านเมื่อ:
//  - ทุกมุมมอง (12 แท็บ desktop + มือถือ 390px) ไม่มี axe violation ของ WCAG 2.0/2.1 A–AA + 2.2 target-size เกินงบ (AXE_BUDGET)
//  - มือถือไม่มี scroll แนวนอนทั้งหน้า · ไม่มี console error / page error
//  - interaction หลักทำงาน: คำแนะนำครั้งแรก, ⌘K, ล็อกกติกา, robustness, Apex size ใน Decision, journal P&L (commit ตอน blur),
//    ปุ่ม AI ถูกปิดพร้อมคำอธิบายเมื่อไม่มี LLM, /terms, 404
// ผลอยู่ที่ <out>/e2e-report.json + ภาพหน้าจอ (ไม่ commit — อยู่ใน .gitignore)
// ============================================================

import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import axe from "axe-core"
import { chromium, type Page } from "playwright"
import { APP_ROOT, startStandaloneServer, type ServerHandle } from "./server"

export const VIEWS: Array<{ key: string; label: string }> = [
  { key: "terminal", label: "ตลาดสด · Terminal" },
  { key: "overview", label: "ภาพรวม" },
  { key: "synthesis", label: "หลอมรวม" },
  { key: "decision", label: "Decision (L6)" },
  { key: "multiview", label: "Multi-View (L3)" },
  { key: "dependence", label: "Dependence (L2)" },
  { key: "risk", label: "Risk & Sizing (L5)" },
  { key: "metarisk", label: "Meta-Risk (L∞)" },
  { key: "apex", label: "Apex (L7)" },
  { key: "backtest", label: "Backtest & Journal" },
  { key: "auditor", label: "AI Auditor" },
  { key: "cot", label: "COT Report" },
  { key: "dashboard", label: "Command Center" },
]

/**
 * งบ violation ต่อ rule ของ axe (จำนวน node สูงสุดที่ยอมรับต่อมุมมอง) — ค่าเริ่มต้น 0 ทุก rule
 * เพิ่มรายการได้เฉพาะเมื่อมีเหตุผลที่บันทึกไว้ (เช่น ข้อจำกัดของไลบรารีกราฟที่แก้จากฝั่งเราไม่ได้)
 */
export const AXE_BUDGET: Record<string, { max: number; reason: string }> = {}

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]

export interface AxeFinding {
  id: string
  impact: string | null
  nodes: number
  help: string
  targets: string[]
}

export interface ViewResult {
  view: string
  viewport: number
  ms: number
  overflowPx: number
  violations: AxeFinding[]
  overBudget: string[]
  error?: string
}

/** violation ที่เกินงบ (pure — ทดสอบได้) */
export function overBudget(findings: AxeFinding[], budget: Record<string, { max: number }> = AXE_BUDGET): string[] {
  return findings.filter((f) => f.nodes > (budget[f.id]?.max ?? 0)).map((f) => `${f.id} ×${f.nodes}`)
}

function parseArgs(argv: string[]) {
  const get = (name: string) => {
    const i = argv.indexOf(name)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const dbArg = get("--db")
  return {
    baseUrl: get("--base-url")?.replace(/\/+$/, ""),
    db: dbArg === "empty" ? "empty" : path.resolve(dbArg ?? path.join(APP_ROOT, "db", "custom.db")),
    port: Number(get("--port") ?? 3220),
    out: path.resolve(get("--out") ?? path.join(APP_ROOT, ".e2e")),
    headed: argv.includes("--headed"),
  }
}

/** รอให้หน้านิ่ง: network ว่าง + ไม่มี aria-busy / spinner (ไม่รอ .animate-pulse ซึ่งเป็นเอฟเฟกต์ถาวรบางจุด) */
async function settle(page: Page, timeoutMs = 60_000) {
  await page.waitForLoadState("networkidle", { timeout: timeoutMs }).catch(() => {})
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    const busy = await page.locator('[aria-busy="true"], .animate-spin').count()
    if (busy === 0) break
    await page.waitForTimeout(250)
  }
  await page.waitForTimeout(300)
}

async function runAxe(page: Page): Promise<AxeFinding[]> {
  await page.addScriptTag({ content: axe.source })
  return page.evaluate(async (tags) => {
    const w = window as unknown as { axe: { run: (ctx: Document, opts: unknown) => Promise<{ violations: Array<{ id: string; impact: string | null; help: string; nodes: Array<{ target: unknown[] }> }> }> } }
    const res = await w.axe.run(document, { runOnly: { type: "tag", values: tags }, resultTypes: ["violations"] })
    return res.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help, targets: v.nodes.slice(0, 6).map((n) => n.target.map(String).join(" ")) }))
  }, AXE_TAGS)
}

async function overflowPx(page: Page): Promise<number> {
  return page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth)
}

async function nav(page: Page, label: string) {
  await page.getByRole("button", { name: label, exact: true }).locator("visible=true").first().click({ timeout: 15_000 })
  await settle(page)
}

async function measure(page: Page, view: string, viewport: number, t0: number, out: string, shot: string): Promise<ViewResult> {
  const violations = await runAxe(page)
  const res: ViewResult = { view, viewport, ms: Date.now() - t0, overflowPx: Math.max(0, await overflowPx(page)), violations, overBudget: overBudget(violations) }
  await page.screenshot({ path: path.join(out, shot) }).catch(() => {})
  return res
}

interface Check {
  name: string
  ok: boolean
  detail?: string
}

async function check(name: string, fn: () => Promise<string | undefined | void>): Promise<Check> {
  try {
    const problem = await fn()
    return problem ? { name, ok: false, detail: problem } : { name, ok: true }
  } catch (e) {
    return { name, ok: false, detail: (e as Error).message.split("\n")[0].slice(0, 300) }
  }
}

async function main(): Promise<number> {
  const o = parseArgs(process.argv.slice(2))
  mkdirSync(o.out, { recursive: true })
  let server: ServerHandle | null = null
  let base = o.baseUrl ?? ""
  if (!o.baseUrl) {
    try {
      server = await startStandaloneServer({ db: o.db, port: o.port, runtime: "node" })
    } catch (e) {
      console.error((e as Error).message)
      return 1
    }
    base = server.base
  }
  const browser = await chromium.launch({ headless: !o.headed })
  const consoleErrors: string[] = []
  const pageErrors: string[] = []
  const views: ViewResult[] = []
  const checks: Check[] = []
  const report: Record<string, unknown> = { base, startedAt: new Date().toISOString() }
  try {
    // ───────── desktop ─────────
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "th-TH" })
    const page = await ctx.newPage()
    page.on("console", (m) => {
      // หน้า 404 ที่ตั้งใจเปิด → browser log "Failed to load resource: 404" ของเอกสารหลัก — ไม่นับเป็นข้อผิดพลาด
      if (m.type() === "error" && !m.location().url.includes("/no-such-page")) consoleErrors.push(m.text().slice(0, 300))
    })
    page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 300)))

    const tFirst = Date.now()
    await page.goto(`${base}/`, { waitUntil: "domcontentloaded" })
    await page.getByText("MARKET BREADTH", { exact: false }).first().waitFor({ timeout: 60_000 }).catch(() => {})
    report.timeToCommandCenterMs = Date.now() - tFirst
    await settle(page)

    checks.push(
      await check("คำแนะนำครั้งแรก: แสดงครั้งแรก → ปิดแล้วไม่กลับมาหลังโหลดใหม่", async () => {
        const guide = page.getByRole("region", { name: "เริ่มต้นใช้งานใน 1 นาที" })
        if ((await guide.count()) === 0) return "ไม่พบกล่องคำแนะนำครั้งแรก"
        views.push(await measure(page, "Command Center + คำแนะนำครั้งแรก", 1440, tFirst, o.out, "desktop-first-run.png"))
        await page.getByRole("button", { name: "เข้าใจแล้ว ไม่ต้องแสดงอีก" }).click()
        if ((await guide.count()) !== 0) return "กดปิดแล้วยังแสดง"
        await page.reload({ waitUntil: "domcontentloaded" })
        await settle(page)
        if ((await page.getByRole("region", { name: "เริ่มต้นใช้งานใน 1 นาที" }).count()) !== 0) return "โหลดใหม่แล้วกลับมาแสดง"
      }),
    )
    checks.push(
      await check("แถบล่าง: ป้ายที่มาของข้อมูลจาก provenance + ลิงก์ข้อกำหนด + กติกา", async () => {
        const footer = page.locator("footer").last()
        const text = (await footer.textContent()) ?? ""
        if (!/ข้อมูลจำลอง|ข้อมูลจริง/.test(text)) return `ไม่มีป้ายข้อมูล: ${text.slice(0, 160)}`
        if (!text.includes("กติกา")) return "ไม่มีสถานะกติกา"
        if ((await footer.getByRole("link", { name: "ข้อกำหนดและข้อจำกัด" }).count()) === 0) return "ไม่มีลิงก์ข้อกำหนด"
      }),
    )

    for (const v of VIEWS) {
      const t0 = Date.now()
      try {
        await nav(page, v.label)
        views.push(await measure(page, v.label, 1440, t0, o.out, `desktop-${v.key}.png`))
      } catch (e) {
        views.push({ view: v.label, viewport: 1440, ms: Date.now() - t0, overflowPx: 0, violations: [], overBudget: [], error: (e as Error).message.split("\n")[0] })
        continue
      }
      if (v.key === "decision") {
        checks.push(
          await check("Decision: แสดงขนาดสุดท้ายของ Apex (Kelly-Vol × MDX)", async () => {
            await page.getByText("ขนาดสุดท้าย (Apex)", { exact: false }).first().waitFor({ timeout: 30_000 })
          }),
        )
      }
      if (v.key === "apex") {
        checks.push(
          await check("Apex: แถว Risk MDX override + ช่วงความเชื่อมั่นของ P(win)", async () => {
            if ((await page.getByText("Risk MDX override").count()) === 0) return "ไม่มีแถว Risk MDX override"
            if ((await page.getByText("95% CI", { exact: false }).count()) === 0) return "ไม่มีช่วงความเชื่อมั่น"
          }),
        )
      }
      if (v.key === "backtest") {
        checks.push(
          await check("Backtest: hit rate มี 95% CI · ล็อกกติกาแล้วป้ายเปลี่ยนเป็น 'ตรงกับที่ล็อกไว้'", async () => {
            if ((await page.getByText("95% CI", { exact: false }).count()) === 0) return "hit rate ไม่มี CI"
            await page.getByRole("button", { name: "ล็อกกติกาชุดนี้" }).click()
            await page.getByText("ตรงกับที่ล็อกไว้").first().waitFor({ timeout: 20_000 })
          }),
        )
        checks.push(
          await check("Backtest: รันความทนทานข้าม seed ได้คำตัดสิน", async () => {
            await page.getByRole("button", { name: "รันทดสอบ 5 seed" }).click()
            await page.getByText(/ทนทาน \(STABLE\)|ปนกัน \(MIXED\)|ไม่ทนทาน \(UNSTABLE\)/).first().waitFor({ timeout: 120_000 })
            views.push(await measure(page, "Backtest + ผล robustness", 1440, Date.now(), o.out, "desktop-backtest-robustness.png"))
          }),
        )
        checks.push(
          await check("Journal: เติมตัวอย่าง → แก้ P&L แล้วบันทึกตอนออกจากช่อง (PATCH ครั้งเดียว)", async () => {
            await page.getByRole("button", { name: "เติมตัวอย่างจาก Decision Board" }).click()
            const input = page.getByRole("spinbutton", { name: /^P&L % ของ/ }).first()
            await input.waitFor({ timeout: 30_000 })
            let patches = 0
            const patchCount = () => patches // อ่านผ่านฟังก์ชัน: ค่าเปลี่ยนจาก event handler (TS narrowing ไม่เห็น)
            page.on("request", (r) => {
              if (r.method() === "PATCH" && r.url().includes("/api/journal")) patches++
            })
            await input.fill("2.5")
            await page.waitForTimeout(300)
            if (patchCount() !== 0) return `ส่ง PATCH ระหว่างพิมพ์ ${patchCount()} ครั้ง`
            const done = page.waitForResponse((r) => r.request().method() === "PATCH" && r.url().includes("/api/journal"), { timeout: 15_000 })
            await input.press("Tab")
            const res = await done
            if (res.status() !== 200) return `PATCH ตอบ ${res.status()}`
            await page.waitForTimeout(300)
            if (patchCount() !== 1) return `PATCH ${patchCount()} ครั้ง (คาด 1)`
          }),
        )
      }
      if (v.key === "auditor") {
        checks.push(
          await check("AI Auditor: ไม่มี LLM → ปุ่มถูกปิดพร้อมคำอธิบายวิธีตั้งค่า", async () => {
            if (!(await page.getByRole("button", { name: "รัน Audit ตอนนี้" }).isDisabled())) return "ปุ่มยังกดได้"
            if ((await page.getByText("ยังไม่ได้ตั้งค่า LLM", { exact: false }).count()) === 0) return "ไม่มีคำอธิบาย"
          }),
        )
      }
      if (v.key === "synthesis") {
        checks.push(
          await check("หลอมรวม: ไม่มี LLM → ปุ่ม AI ถูกปิดพร้อมคำอธิบาย", async () => {
            if (!(await page.getByRole("button", { name: "หลอมรวมด้วย AI" }).isDisabled())) return "ปุ่มยังกดได้"
            if ((await page.getByText("ยังไม่ได้ตั้งค่า LLM", { exact: false }).count()) === 0) return "ไม่มีคำอธิบาย"
          }),
        )
      }
      if (v.key === "cot") {
        checks.push(
          await check("COT: Gold เริ่มต้น → เลือก Silver + ช่วง 3y → หัวข้อ/ตาราง/มาตรวัดอัปเดต", async () => {
            await page.getByRole("heading", { name: /Commitments of Traders Report \(COT\) – Gold/ }).waitFor({ timeout: 20_000 })
            if ((await page.getByRole("region", { name: "ตาราง COT Legacy" }).count()) === 0) return "ไม่มีตาราง Legacy"
            await page.getByRole("button", { name: "Silver", exact: true }).click()
            await page.getByRole("button", { name: "3y", exact: true }).click()
            await page.getByRole("heading", { name: /Commitments of Traders Report \(COT\) – Silver/ }).waitFor({ timeout: 20_000 })
            await settle(page)
            if ((await page.getByRole("button", { name: "3y", exact: true }).getAttribute("aria-pressed")) !== "true") return "ปุ่มช่วงไม่เปลี่ยนสถานะ"
            if ((await page.getByRole("img", { name: /^COT Index 6 Month/ }).count()) === 0) return "ไม่มีมาตรวัด COT Index"
            views.push(await measure(page, "COT Report (Silver, 3y)", 1440, Date.now(), o.out, "desktop-cot-silver.png"))
          }),
        )
      }
      if (v.key === "terminal") {
        checks.push(
          await check("Terminal: ช่องแชท AI ถูกปิดพร้อมคำอธิบายเมื่อไม่มี LLM", async () => {
            if (!(await page.getByRole("textbox", { name: "ถาม AI นักวิเคราะห์" }).isDisabled())) return "ช่องแชทยังพิมพ์ได้"
          }),
        )
      }
    }

    checks.push(
      await check("⌘K: เปิดค้นหา → พิมพ์ SCB → Enter → Terminal ของ SCB", async () => {
        await page.keyboard.press("Control+k")
        const dialog = page.getByRole("dialog")
        await dialog.waitFor({ timeout: 10_000 })
        await page.keyboard.type("SCB")
        await page.keyboard.press("Enter")
        await settle(page)
        if ((await page.getByText("SCB", { exact: true }).count()) === 0) return "ไม่ได้เปิด SCB"
      }),
    )

    checks.push(
      await check("/terms: หน้าข้อกำหนดโหลดได้และผ่าน axe", async () => {
        const t0 = Date.now()
        const res = await page.goto(`${base}/terms`, { waitUntil: "domcontentloaded" })
        if (res?.status() !== 200) return `HTTP ${res?.status()}`
        await page.getByRole("heading", { level: 1, name: "ข้อกำหนดและข้อจำกัดของการใช้งาน" }).waitFor({ timeout: 10_000 })
        views.push(await measure(page, "/terms", 1440, t0, o.out, "desktop-terms.png"))
      }),
    )
    checks.push(
      await check("404: หน้าที่ไม่มีอยู่ตอบ 404 พร้อมทางกลับ", async () => {
        const res = await page.goto(`${base}/no-such-page`, { waitUntil: "domcontentloaded" })
        if (res?.status() !== 404) return `HTTP ${res?.status()}`
        if ((await page.getByText("ไม่พบหน้าที่ต้องการ").count()) === 0) return "ไม่มีข้อความ 404"
        views.push(await measure(page, "404", 1440, Date.now(), o.out, "desktop-404.png"))
      }),
    )
    await ctx.close()

    // ───────── มือถือ 390px ─────────
    const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "th-TH", isMobile: true, hasTouch: true })
    const m = await mctx.newPage()
    m.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(`[mobile] ${msg.text().slice(0, 300)}`)
    })
    m.on("pageerror", (e) => pageErrors.push(`[mobile] ${String(e).slice(0, 300)}`))
    const tm = Date.now()
    await m.goto(`${base}/`, { waitUntil: "domcontentloaded" })
    await settle(m)
    views.push(await measure(m, "Command Center (มือถือ)", 390, tm, o.out, "mobile-dashboard.png"))
    for (const label of ["Decision (L6)", "Apex (L7)", "Backtest & Journal"]) {
      const t0 = Date.now()
      try {
        await m.getByRole("button", { name: "เปิดเมนูนำทาง" }).first().click({ timeout: 10_000 })
        await nav(m, label)
        views.push(await measure(m, `${label} (มือถือ)`, 390, t0, o.out, `mobile-${label.split(" ")[0].toLowerCase()}.png`))
      } catch (e) {
        views.push({ view: `${label} (มือถือ)`, viewport: 390, ms: Date.now() - t0, overflowPx: 0, violations: [], overBudget: [], error: (e as Error).message.split("\n")[0] })
      }
    }
    await mctx.close()
  } finally {
    await browser.close()
    server?.stop()
  }

  const failedViews = views.filter((v) => v.error || v.overBudget.length > 0 || (v.viewport <= 400 && v.overflowPx > 1))
  const failedChecks = checks.filter((c) => !c.ok)
  Object.assign(report, { views, checks, consoleErrors, pageErrors, budget: AXE_BUDGET, finishedAt: new Date().toISOString() })
  writeFileSync(path.join(o.out, "e2e-report.json"), JSON.stringify(report, null, 2))

  for (const v of views) {
    const bad = v.error ? `ERROR ${v.error}` : [v.overBudget.length ? `axe: ${v.overBudget.join(", ")}` : "", v.viewport <= 400 && v.overflowPx > 1 ? `ล้นแนวนอน ${v.overflowPx}px` : ""].filter(Boolean).join(" · ")
    console.log(`${bad ? "FAIL" : "PASS"}  ${String(v.viewport).padStart(4)}px  ${String(v.ms).padStart(6)} ms  ${v.view}${bad ? `  ← ${bad}` : ""}`)
    if (bad) for (const f of v.violations.filter((x) => v.overBudget.some((b) => b.startsWith(x.id)))) console.log(`        ${f.id} (${f.impact}): ${f.targets.slice(0, 4).join(" | ")}`)
  }
  for (const c of checks) console.log(`${c.ok ? "PASS" : "FAIL"}  ${c.name}${c.detail ? `  ← ${c.detail}` : ""}`)
  if (consoleErrors.length) console.log(`console error ${consoleErrors.length}: ${consoleErrors.slice(0, 5).join(" | ")}`)
  if (pageErrors.length) console.log(`page error ${pageErrors.length}: ${pageErrors.slice(0, 5).join(" | ")}`)
  console.log(`\nมุมมอง ${views.length - failedViews.length}/${views.length} ผ่าน · interaction ${checks.length - failedChecks.length}/${checks.length} ผ่าน · Command Center แสดงผลใน ${report.timeToCommandCenterMs} ms · รายงาน ${path.relative(APP_ROOT, path.join(o.out, "e2e-report.json"))}`)
  return failedViews.length === 0 && failedChecks.length === 0 && consoleErrors.length === 0 && pageErrors.length === 0 ? 0 : 1
}

if (import.meta.main) {
  main().then((code) => process.exit(code))
}
