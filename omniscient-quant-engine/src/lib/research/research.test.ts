import { beforeAll, describe, expect, test } from "bun:test"
import { apexFor, loadRiskContext, metaRiskFor } from "@/lib/quant/engine/dossiers"
import { getDecision } from "@/lib/quant/engine/api"
import { assembleDeepResearch } from "./deep"
import { deepResearchFilename, renderDeepResearchMarkdown } from "./markdown"
import { getRhythm } from "@/lib/rhythm/service"
import { getDeepResearch, narrativeEvidence, parseNarrative } from "./service"
import type { DeepResearchReport } from "./types"

// DB ทดสอบ (SQLite ชั่วคราวจาก setup.ts) — seed ข้อมูลจำลองครั้งแรกที่เรียก
let tse: DeepResearchReport

beforeAll(async () => {
  tse = (await getDeepResearch("tse"))!
}, 120_000)

describe("research/deep — ประกอบจากผลของทุกชั้น", () => {
  test("ครบทุกหัวข้อตามลำดับ · หุ้นที่ไม่มี = null · ไม่สนตัวพิมพ์", async () => {
    expect(tse.symbol).toBe("TSE")
    expect(tse.sections.map((s) => s.key)).toEqual([
      "market", "technical", "fundamental", "dependence", "factor", "flows", "rhythm", "synthesis", "gates", "risk", "sizing", "evidence",
    ])
    expect(tse.strands.length).toBe(13)
    for (const s of tse.sections) {
      expect(s.summary.length).toBeGreaterThan(10)
      expect(["positive", "negative", "neutral", "abstain", "info"]).toContain(s.stance)
    }
    expect(await getDeepResearch("NOPE")).toBeNull()
  })

  test("ตัวเลขตรงกับแท็บ Decision / Apex / Meta-Risk (โหลดจากบริบทเดียวกัน)", async () => {
    const [dec, ctx] = await Promise.all([getDecision("TSE"), loadRiskContext()])
    const meta = metaRiskFor(ctx, "TSE")!
    const apex = apexFor(ctx, "TSE", meta)!
    expect(tse.verdict.signal).toBe(dec!.eval.signal as DeepResearchReport["verdict"]["signal"])
    expect(tse.plan.stopHard).toBe(dec!.eval.plan.stopHard)
    expect(tse.plan.cvarSizePct).toBe(dec!.eval.plan.sizePct)
    expect(tse.verdict.finalSizePct).toBe(apex.kelly.finalSizePct)
    expect(tse.kpis.find((k) => k.label === "Risk MDX")!.value).toBe(`${meta.riskMdx.composite.toFixed(0)}/100`)
    expect(tse.price).toBeCloseTo(dec!.row.close, 3)
    expect(tse.asOf).toBe(dec!.row.date)
  })

  test("บอกข้อจำกัดเสมอ: ข้อมูลจำลอง · เงินไหลจำลอง · กติกา · ไม่ใช่คำแนะนำ · robustness ยังไม่รัน = ไม่เดาผล", () => {
    expect(tse.data.kind).toBe("synthetic")
    expect(tse.caveats.join(" ")).toContain("ข้อมูลจำลอง")
    expect(tse.caveats.some((c) => c.includes("NVDR"))).toBe(true)
    expect(tse.caveats.at(-1)).toContain("ไม่ใช่คำแนะนำการลงทุน")
    expect(tse.verdict.summary).toContain("ข้อมูลจำลอง")
    const ev = tse.sections.find((s) => s.key === "evidence")!
    expect(ev.stance).toBe("info")
    expect(ev.facts.find((f) => f.label === "ความทนทานข้าม seed")!.value).toBe("ยังไม่ได้รัน")
    // เงินไหล: ข้อมูลจำลองติดป้ายทุกตัว
    const flows = tse.sections.find((s) => s.key === "flows")!
    for (const f of flows.facts.filter((x) => x.label.startsWith("NVDR"))) expect(f.note).toBe("จำลอง")
  })

  test("จังหวะตลาด: เป็นข้อมูลประกอบ (ไม่โหวต) · ตัวเลขตรงกับหน้าจังหวะตลาด · บอกผลการปรับทดสอบหลายช่องเสมอ", async () => {
    const sec = tse.sections.find((s) => s.key === "rhythm")!
    expect(sec.stance).toBe("info")
    const r = await getRhythm("TSE")
    if (!r.ok) throw new Error(r.reason)
    const fact = (label: string) => sec.facts.find((f) => f.label === label)
    expect(fact("สัญญาณเข้าซื้อของ TSE")!.value).toContain(`(${r.data.gates.overall.counts.SIGNAL} ครั้ง)`)
    expect(fact("วันล่าสุดคล้ายวันแบบ")!.value).toContain(r.data.dayMap.clusters[r.data.dayMap.latest.cluster].label)
    expect(fact("หุ้นเคลื่อนแรงพร้อมกันวันล่าสุด")!.value).toBe(`${r.data.breadth.latest.extreme} / ${r.data.breadth.nStocks} ตัว`)
    expect(sec.bullets.join(" ")).toContain("ไม่ได้ร่วมโหวต")
    expect(sec.bullets[0]).toMatch(/ปรับการทดสอบ|ปรับหลายช่อง|ไม่มีเดือนหรือวันใด/)
  })

  test("ท่าทีของหัวข้อมาจากโหวตของสายหลักฐาน (ไม่สร้างสัญญาณใหม่)", async () => {
    const vote = (key: string) => tse.strands.find((s) => s.key === key)!
    const market = tse.sections.find((s) => s.key === "market")!
    const g1 = vote("G1_REGIME").vote
    expect(market.stance).toBe(g1 === "LONG" ? "positive" : g1 === "SHORT" ? "negative" : "neutral")
    const syn = tse.sections.find((s) => s.key === "synthesis")!
    expect(syn.stance).toBe(tse.verdict.code.endsWith("LONG") ? "positive" : tse.verdict.code.endsWith("SHORT") ? "negative" : "neutral")
    const gates = tse.sections.find((s) => s.key === "gates")!
    if (tse.verdict.signal !== "NO_TRADE") expect(gates.stance).toBe("positive")
  })

  test("สายที่ไม่มีข้อมูลงดออกเสียง: ชุดข้อมูลไม่มีงบ → หัวข้อพื้นฐาน = abstain และไม่แสดงตัวเลขงบ", async () => {
    const ctx = await loadRiskContext()
    const st = ctx.state.stocks.find((s) => s.symbol === "TSE")!
    const noFund = { ...ctx.state, stocks: ctx.state.stocks.map((s) => (s === st ? { ...s, coverage: { fundamentals: false, flows: true } } : s)) }
    const meta = metaRiskFor(ctx, "TSE")!
    const r = assembleDeepResearch({
      state: noFund,
      symbol: "TSE",
      synthesis: { ...(await import("@/lib/quant/engine/synthesis")).buildSynthesisDossier(noFund, "TSE", undefined, ctx.bt)! },
      gate: (await import("@/lib/quant/engine/gates")).evaluateGates(noFund, "TSE", noFund.dates.length - 1, { probUp: 0.5 }),
      risk: (await import("@/lib/quant/engine/risk")).riskAssessment(st.rows.slice(-100), 1, 5, 2000, 7),
      meta,
      apex: apexFor(ctx, "TSE", meta)!,
      backtest: ctx.bt,
      flows: null,
      rhythm: null,
      robustness: null,
      data: { kind: "real", label: "ทดสอบ" },
      rules: { hashShort: "abc", version: "t", matchesRegistered: true },
    })
    const fund = r.sections.find((s) => s.key === "fundamental")!
    expect(fund.stance).toBe("abstain")
    expect(fund.facts).toEqual([])
    expect(r.caveats.some((c) => c.includes("ราคา งบ และเงินไหลในชุดนี้เป็นข้อมูลจำลอง"))).toBe(false) // ข้อมูลจริง = ไม่ติดป้ายจำลองของราคา
    expect(r.caveats.some((c) => c.includes("NVDR"))).toBe(true) // แต่เงินไหลยังจำลองเสมอ
  })
})

describe("research/markdown + narrative", () => {
  test("Markdown: หัวเรื่อง · ทุกหัวข้อ · ตาราง 13 สาย · ข้อจำกัด · ช่องตารางไม่มี | ที่ทำให้ตารางแตก", () => {
    const md = renderDeepResearchMarkdown(tse)
    expect(md.startsWith(`# Deep Research — TSE · ${tse.name}`)).toBe(true)
    for (const s of tse.sections) expect(md).toContain(`. ${s.title}`)
    expect(md).toContain("## หลักฐาน 13 สาย")
    expect(md).toContain("## ข้อจำกัดของรายงาน")
    expect(md).toContain("ไม่ใช่คำแนะนำการลงทุน")
    expect(md).not.toContain("บทเรียบเรียงจาก AI")
    for (const line of md.split("\n").filter((l) => l.startsWith("| ") && !l.startsWith("|---"))) {
      const cells = line.split(/(?<!\\)\|/).length - 2
      expect([3, 5]).toContain(cells)
    }
    expect(deepResearchFilename(tse)).toBe(`deep-research-TSE-${tse.asOf}.md`)
  })

  test("บทเรียบเรียง LLM: JSON ถูกต้อง → ครบทุกช่อง · อ่านไม่ได้ → เก็บข้อความดิบ · ถูกใส่ใน Markdown พร้อมคำเตือน", () => {
    const n = parseNarrative(
      { headline: "หัว", summary: "สรุป", bullCase: ["บวก 1", 2], bearCase: ["ลบ"], watchList: ["ดู"], conclusion: "จบ" },
      "",
      "fallback",
    )
    expect(n).toEqual({ headline: "หัว", summary: "สรุป", bullCase: ["บวก 1", "2"], bearCase: ["ลบ"], watchList: ["ดู"], conclusion: "จบ" })
    const raw = parseNarrative(null, "ข้อความดิบ", "fallback")
    expect(raw.headline).toBe("fallback")
    expect(raw.summary).toBe("ข้อความดิบ")
    const md = renderDeepResearchMarkdown(tse, n)
    expect(md).toContain("## บทเรียบเรียงจาก AI")
    expect(md).toContain("- บวก 1")
    expect(md).toContain("อาจผิดได้")
    const ev = narrativeEvidence(tse)
    expect(ev.sections.length).toBe(tse.sections.length)
    expect(JSON.stringify(ev)).not.toMatch(/password|token|DATABASE_URL/i)
  })
})
