import { describe, expect, test } from "bun:test"
import { AXE_BUDGET, overBudget, VIEWS, type AxeFinding } from "./e2e"

const f = (id: string, nodes: number): AxeFinding => ({ id, impact: "serious", nodes, help: id, targets: [] })

describe("e2e — งบ axe", () => {
  test("ค่าเริ่มต้นงบ 0 ทุก rule: violation ใดก็ตาม = เกินงบ", () => {
    expect(Object.keys(AXE_BUDGET)).toEqual([])
    expect(overBudget([f("color-contrast", 3), f("button-name", 1)])).toEqual(["color-contrast ×3", "button-name ×1"])
    expect(overBudget([])).toEqual([])
  })
  test("rule ที่มีงบ: ไม่เกิน max = ผ่าน · เกิน = ไม่ผ่าน", () => {
    const budget = { "color-contrast": { max: 3 } }
    expect(overBudget([f("color-contrast", 3)], budget)).toEqual([])
    expect(overBudget([f("color-contrast", 4)], budget)).toEqual(["color-contrast ×4"])
  })
  test("ครอบคลุมทั้ง 19 มุมมองของ sidebar (key ไม่ซ้ำ)", () => {
    expect(VIEWS).toHaveLength(19)
    expect(new Set(VIEWS.map((v) => v.key)).size).toBe(19)
  })
})
