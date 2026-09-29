import { describe, expect, test } from "bun:test"
import { db } from "@/lib/db"
import { canonicalJson, hashRules, RULES, RULES_HASH, RULES_HASH_SHORT, RULES_VERSION } from "./rules"
import { registerRules, rulesStamp } from "./rules-registry"

// ทะเบียน hash ต่อเวอร์ชันกติกา — แก้ค่าใดใน RULES แล้วต้อง bump RULES_VERSION และเพิ่มบรรทัดที่นี่
// (บังคับให้การเปลี่ยนกติกาเป็นการตัดสินใจที่ตั้งใจและตรวจย้อนได้ ไม่ใช่การจูนเงียบ ๆ หลังเห็นผล backtest)
const KNOWN_RULES: Record<string, string> = {
  "2026-09-28.1": "7aa407b1494de3145c2396a03daf127296487f88464f6846a648b57201f16e97",
}

describe("rules — กติกาเป็นข้อมูล + sha256", () => {
  test("canonicalJson: ไม่ขึ้นกับลำดับ key แต่ array คงลำดับ", () => {
    expect(canonicalJson({ b: 1, a: { d: [3, 1], c: "x" } })).toBe('{"a":{"c":"x","d":[3,1]},"b":1}')
    expect(canonicalJson({ a: 1, b: 2 })).toBe(canonicalJson({ b: 2, a: 1 }))
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]))
    expect(canonicalJson(null)).toBe("null")
  })

  test("hash: 64 hex, คำนวณซ้ำได้ค่าเดิม, แก้ค่าใดค่าหนึ่ง (แม้ลึก) → hash เปลี่ยน", () => {
    expect(RULES_HASH).toMatch(/^[0-9a-f]{64}$/)
    expect(RULES_HASH_SHORT).toBe(RULES_HASH.slice(0, 12))
    expect(hashRules(JSON.parse(JSON.stringify(RULES)))).toBe(RULES_HASH)
    const g5 = JSON.parse(JSON.stringify(RULES))
    g5.gates.g5.rsiMax = 81
    expect(hashRules(g5)).not.toBe(RULES_HASH)
    const deep = JSON.parse(JSON.stringify(RULES))
    deep.synthesis.weights.HUB = 0.31
    expect(hashRules(deep)).not.toBe(RULES_HASH)
  })

  test("เวอร์ชันกติกาตรงกับ hash ที่ขึ้นทะเบียนไว้ (แก้ RULES ต้อง bump RULES_VERSION)", () => {
    expect(KNOWN_RULES[RULES_VERSION]).toBe(RULES_HASH)
  })

  test("ค่าในกติกาสอดคล้องกันเอง: น้ำหนัก MDX รวม 1 · HALF < ZERO · walk-forward มี embargo · prob floor < cap", () => {
    const w = Object.values(RULES.mdx.weights).reduce((a, b) => a + b, 0)
    expect(w).toBeCloseTo(1, 9)
    expect(RULES.mdx.overrideHalf).toBeLessThan(RULES.mdx.overrideZero)
    expect(RULES.backtest.embargo).toBeGreaterThan(0)
    expect(RULES.backtest.train).toBeGreaterThan(RULES.backtest.test)
    expect(RULES.probs.floor).toBeLessThan(RULES.probs.cap)
    expect(RULES.kelly.fraction).toBeLessThanOrEqual(0.5)
    expect(Object.keys(RULES.synthesis.weights)).toHaveLength(13)
  })

  test("pre-registration: ยังไม่ล็อก → null · ล็อกแล้ว matches · มีการล็อก hash อื่นทีหลัง → ไม่ตรง", async () => {
    await db.ruleRegistration.deleteMany()
    const s0 = await rulesStamp()
    expect(s0).toMatchObject({ hash: RULES_HASH, hashShort: RULES_HASH_SHORT, version: RULES_VERSION, registered: null, matchesRegistered: false })
    expect(s0.tunedOn).toContain("synthetic")

    const reg = await registerRules("ล็อกก่อนดูผลรอบใหม่", "basic")
    expect(reg.rulesHash).toBe(RULES_HASH)
    expect(reg.rules).toEqual(JSON.parse(JSON.stringify(RULES)))
    const s1 = await rulesStamp()
    expect(s1.matchesRegistered).toBe(true)
    expect(s1.registered).toMatchObject({ hash: RULES_HASH, note: "ล็อกก่อนดูผลรอบใหม่", actor: "basic", version: RULES_VERSION })

    // มีคนล็อกกติกาชุดอื่นทีหลัง (เช่น deploy เวอร์ชันเก่ากลับมา) → stamp ต้องบอกว่าไม่ตรง
    await db.ruleRegistration.create({
      data: { rulesHash: "f".repeat(64), rulesVersion: "old", rules: {}, actor: "token", createdAt: new Date(Date.now() + 60_000) },
    })
    const s2 = await rulesStamp()
    expect(s2.matchesRegistered).toBe(false)
    expect(s2.registered?.hashShort).toBe("ffffffffffff")
    await db.ruleRegistration.deleteMany()
  })
})
