/// <reference types="bun-types" />
// bun test — ยืนยันก่อนลบข้อมูลทั้งชุด (pure) + การจัดประเภทเส้นทาง/ปลายทางหลัง login
import { describe, expect, it } from "bun:test"
import { confirmationRequired, EMPTY_EXISTING, hasConfirmation, wouldDelete } from "./confirm"
import { isApiPath, isPublicPath, isStaticAssetPath, safeNextPath } from "./paths"

describe("confirm", () => {
  it("ต้องเป็นค่าตรงตัว: seed=RESET, replaceDemo=REPLACE", () => {
    expect(hasConfirmation({ confirm: "RESET" }, "seed")).toBe(true)
    expect(hasConfirmation({ confirm: "REPLACE" }, "replaceDemo")).toBe(true)
    expect(hasConfirmation({ confirm: "REPLACE" }, "seed")).toBe(false)
    expect(hasConfirmation({ confirm: "reset" }, "seed")).toBe(false)
    expect(hasConfirmation({ confirm: true }, "seed")).toBe(false)
    expect(hasConfirmation({}, "seed")).toBe(false)
    expect(hasConfirmation(null, "seed")).toBe(false)
    expect(hasConfirmation("RESET", "seed")).toBe(false)
  })

  it("DB ว่าง = ไม่มีอะไรจะหาย (ไม่ต้องยืนยัน) · มีแถวใดแถวหนึ่ง = ต้องยืนยัน", () => {
    expect(wouldDelete(EMPTY_EXISTING)).toBe(false)
    expect(wouldDelete({ ...EMPTY_EXISTING, rawDaily: 1 })).toBe(true)
    expect(wouldDelete({ ...EMPTY_EXISTING, decisions: 3 })).toBe(true)
  })

  it("ข้อความ 409 บอกสิ่งที่จะหาย + วิธียืนยัน", () => {
    const b = confirmationRequired("seed", { ...EMPTY_EXISTING, rawDaily: 124800, positions: 7 })
    expect(b.confirmRequired).toBe("RESET")
    expect(b.code).toBe("confirm_required")
    expect(b.error).toContain("124,800")
    expect(b.error).toContain("สถานะพอร์ตกระดาษ 7")
    expect(b.error).toContain('{"confirm":"RESET"}')
    expect(b.error).not.toContain("การตัดสินใจ") // แสดงเฉพาะตารางที่มีข้อมูล
    const r = confirmationRequired("replaceDemo", { ...EMPTY_EXISTING, rawDaily: 5 })
    expect(r.error).toContain("REPLACE")
    expect(r.error).toContain("ไม่ใช่เฉพาะข้อมูลตัวอย่าง")
  })
})

describe("paths", () => {
  it("public: /login /terms /api/auth/* /api/health เท่านั้น", () => {
    for (const p of ["/login", "/terms", "/api/auth/login", "/api/auth/session", "/api/health"]) expect(isPublicPath(p)).toBe(true)
    for (const p of ["/", "/api", "/api/seed", "/api/healthz", "/terms/../api/seed", "/loginx", "/api/authx"]) expect(isPublicPath(p)).toBe(false)
  })

  it("static asset / API", () => {
    expect(isStaticAssetPath("/_next/static/chunks/a.js")).toBe(true)
    expect(isStaticAssetPath("/icon.svg")).toBe(true)
    expect(isStaticAssetPath("/api/seed")).toBe(false)
    expect(isApiPath("/api")).toBe(true)
    expect(isApiPath("/api/x")).toBe(true)
    expect(isApiPath("/apix")).toBe(false)
  })

  it("safeNextPath กัน open redirect", () => {
    expect(safeNextPath("/?tab=data")).toBe("/?tab=data")
    expect(safeNextPath("/terms")).toBe("/terms")
    for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "evil.com", "", "/login", "/login?next=/x", "/\u0000x", 5, null, undefined]) {
      expect(safeNextPath(bad)).toBe("/")
    }
  })
})
