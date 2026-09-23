import { describe, expect, it } from "bun:test"
import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { GLOSSARY, GLOSSARY_BY_ID, findTerm, searchGlossary } from "@/lib/platform/glossary"
import { readPref, writePref } from "@/hooks/use-local-pref"
import {
  ALL_TABS,
  NAV_GROUPS,
  SIMPLE_TAB_VALUES,
  hiddenTabCount,
  isTabVisible,
  navGroupsFor,
} from "./nav-config"

// ป้ายแท็บที่ test/sweep ภายนอกคลิกด้วยชื่อ — ห้ามเปลี่ยน
const LOCKED_LABELS = [
  "ภาพรวม (Command Center)",
  "Momentum Map",
  "สถิติ",
  "สัญญาณเรือธง (Flagship 1–10)",
  "สัญญาณ",
  "Backtest",
  "ห้องวิจัย",
  "Evidence Board",
  "Alpha Stack",
  "SET Sniper (ICT × Flow)",
  "Bayes Stop",
  "GTAA Rotation (Faber)",
  "Shadow Lab",
  "Jev AI",
  "พอร์ต",
  "Agent Skill Tree",
  "ข้อมูล",
]

describe("nav-config — ป้ายแท็บ + โหมด Simple/Pro", () => {
  it("ป้ายแท็บเดิมทั้ง 17 ยังอยู่ครบ สะกดเดิมเป๊ะ และเรียงลำดับเดิม (แท็บใหม่เพิ่มได้)", () => {
    const labels = ALL_TABS.map((t) => t.label)
    for (const l of LOCKED_LABELS) expect(labels).toContain(l)
    const order = LOCKED_LABELS.map((l) => labels.indexOf(l))
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(new Set(ALL_TABS.map((t) => t.value)).size).toBe(ALL_TABS.length)
  })

  it("Pro = ครบทุกแท็บ · Simple = เฉพาะแท็บหลักตามลำดับเดิม · กลุ่มว่างถูกตัด", () => {
    expect(navGroupsFor("pro")).toBe(NAV_GROUPS)
    const simple = navGroupsFor("simple").flatMap((g) => g.items.map((i) => i.value))
    expect(simple).toEqual(ALL_TABS.map((t) => t.value).filter((v) => SIMPLE_TAB_VALUES.includes(v)))
    expect(navGroupsFor("simple").every((g) => g.items.length > 0)).toBe(true)
    expect(hiddenTabCount("pro")).toBe(0)
    expect(hiddenTabCount("simple")).toBe(ALL_TABS.length - SIMPLE_TAB_VALUES.length)
  })

  it("แท็บในโหมดง่ายมีอยู่จริงทุกตัว และรวมปลายทางของ dock มือถือ", () => {
    for (const v of SIMPLE_TAB_VALUES) expect(ALL_TABS.some((t) => t.value === v)).toBe(true)
    for (const v of ["overview", "map", "signals", "jev"]) expect(isTabVisible(v, "simple")).toBe(true)
    expect(isTabVisible("research", "simple")).toBe(false)
    expect(isTabVisible("research", "pro")).toBe(true)
  })
})

describe("glossary — อภิธานศัพท์ภาษาไทย", () => {
  it("≥ 30 คำ · id ไม่ซ้ำ ตัวพิมพ์เล็ก · ทุกฟิลด์มีเนื้อหา", () => {
    expect(GLOSSARY.length).toBeGreaterThanOrEqual(30)
    const ids = GLOSSARY.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const e of GLOSSARY) {
      expect(e.id).toBe(e.id.toLowerCase())
      for (const f of [e.term, e.full, e.th, e.why, e.example]) expect(f.trim().length).toBeGreaterThan(0)
      // คำอธิบายเป็นภาษาไทย
      expect(/[฀-๿]/.test(e.th)).toBe(true)
      if (e.tab) expect(ALL_TABS.some((t) => t.value === e.tab)).toBe(true)
    }
  })

  it("findTerm ไม่สนตัวพิมพ์ · ค้นหาตรงคำขึ้นก่อน · กรองหมวดได้ · ว่าง = ทั้งหมด", () => {
    expect(findTerm("IC")?.id).toBe("ic")
    expect(findTerm("ไม่มีคำนี้")).toBeUndefined()
    expect(searchGlossary("icir")[0]?.id).toBe("icir")
    expect(searchGlossary("ic")[0]?.id).toBe("ic")
    expect(searchGlossary("ความผันผวน").length).toBeGreaterThan(0)
    expect(searchGlossary("", "risk").every((e) => e.category === "risk")).toBe(true)
    expect(searchGlossary("").length).toBe(GLOSSARY.length)
    expect(searchGlossary("zzzz-ไม่มี")).toEqual([])
  })

  it('ทุก <Term id="…"> ในหน้าจอชี้ไปที่คำที่มีอยู่จริง', () => {
    const root = path.join(import.meta.dir)
    const files: string[] = []
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = path.join(d, f)
        if (statSync(p).isDirectory()) walk(p)
        else if (p.endsWith(".tsx")) files.push(p)
      }
    }
    walk(root)
    const used = new Set<string>()
    for (const f of files) {
      for (const m of readFileSync(f, "utf8").matchAll(/<Term id="([^"]+)"/g)) used.add(m[1])
    }
    expect(used.size).toBeGreaterThanOrEqual(20)
    for (const id of used) expect(GLOSSARY_BY_ID[id]).toBeDefined()
  })
})

describe("useLocalPref storage — ไม่พังเมื่อไม่มี/เขียน localStorage ไม่ได้", () => {
  it("ไม่มี window (SSR/test) = เก็บในหน่วยความจำ อ่านกลับได้", () => {
    expect(readPref("tpx.test.key")).toBeNull()
    writePref("tpx.test.key", "simple")
    expect(readPref("tpx.test.key")).toBe("simple")
    writePref("tpx.test.key", null)
    expect(readPref("tpx.test.key")).toBeNull()
  })
})
