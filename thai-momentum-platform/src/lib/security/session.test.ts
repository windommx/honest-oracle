/// <reference types="bun-types" />
// bun test — session token (HMAC-SHA256) · รหัสผ่าน · Bearer token · cookie options
import { describe, expect, it } from "bun:test"
import { toBase64Url } from "./crypto"
import {
  checkApiToken,
  checkPassword,
  issueSession,
  parseBearer,
  sessionCookieOptions,
  SESSION_TTL_SEC,
  signSession,
  verifySession,
} from "./session"

const CFG = { secret: "s".repeat(64), adminPassword: "admin-pass-123456", viewerPassword: "viewer-pass-654321" }
const NOW = 1_800_000_000

describe("session token", () => {
  it("ออกแล้วตรวจผ่าน: role/iat/exp ครบ อายุ 7 วัน", () => {
    const s = issueSession("admin", CFG, NOW)!
    expect(s.token.startsWith("v1.")).toBe(true)
    expect(verifySession(s.token, CFG, NOW + 10)).toEqual({ role: "admin", iat: NOW, exp: NOW + SESSION_TTL_SEC })
    expect(SESSION_TTL_SEC).toBe(7 * 24 * 3600)
    expect(verifySession(issueSession("viewer", CFG, NOW)!.token, CFG, NOW)?.role).toBe("viewer")
  })

  it("หมดอายุ = ใช้ไม่ได้ (ขอบเขตพอดี exp ก็ไม่ผ่าน)", () => {
    const { token } = issueSession("admin", CFG, NOW)!
    expect(verifySession(token, CFG, NOW + SESSION_TTL_SEC - 1)).not.toBeNull()
    expect(verifySession(token, CFG, NOW + SESSION_TTL_SEC)).toBeNull()
    expect(verifySession(token, CFG, NOW + SESSION_TTL_SEC + 3600)).toBeNull()
  })

  it("แก้ payload (ยกระดับ viewer → admin / ต่ออายุ) แล้วลายเซ็นไม่ตรง", () => {
    const { token } = issueSession("viewer", CFG, NOW)!
    const [v, , mac] = token.split(".")
    const forgedRole = toBase64Url(JSON.stringify({ r: "admin", iat: NOW, exp: NOW + SESSION_TTL_SEC }))
    expect(verifySession(`${v}.${forgedRole}.${mac}`, CFG, NOW)).toBeNull()
    const forgedExp = toBase64Url(JSON.stringify({ r: "viewer", iat: NOW, exp: NOW + 10 * SESSION_TTL_SEC }))
    expect(verifySession(`${v}.${forgedExp}.${mac}`, CFG, NOW)).toBeNull()
  })

  it("แก้ลายเซ็น / ตัดทอน / สลับเวอร์ชัน / ขยะ = null ไม่ throw", () => {
    const { token } = issueSession("admin", CFG, NOW)!
    const flip = token.slice(0, -2) + (token.endsWith("A") ? "BB" : "AA")
    expect(verifySession(flip, CFG, NOW)).toBeNull()
    expect(verifySession(token.slice(0, -5), CFG, NOW)).toBeNull()
    expect(verifySession(token.replace(/^v1\./, "v2."), CFG, NOW)).toBeNull()
    for (const junk of ["", "abc", "v1..", "v1.%%%.###", "v1.e30.", `v1.${toBase64Url("null")}.x`, "a".repeat(5000), null, undefined]) {
      expect(verifySession(junk as string, CFG, NOW)).toBeNull()
    }
  })

  it("ลายเซ็นถูกแต่ข้อมูลผิดนโยบาย: ออกในอนาคต / อายุยาวเกิน 7 วัน / role แปลก", () => {
    expect(verifySession(signSession({ role: "admin", iat: NOW + 3600, exp: NOW + 7200 }, CFG), CFG, NOW)).toBeNull()
    expect(verifySession(signSession({ role: "admin", iat: NOW, exp: NOW + SESSION_TTL_SEC + 1 }, CFG), CFG, NOW)).toBeNull()
    expect(verifySession(signSession({ role: "root" as never, iat: NOW, exp: NOW + 60 }, CFG), CFG, NOW)).toBeNull()
  })

  it("คีย์ต่างกัน = ใช้แทนกันไม่ได้: secret อื่น / เปลี่ยนรหัสผ่าน / ปิดบทบาทผู้ชม / โหมด local", () => {
    const admin = issueSession("admin", CFG, NOW)!.token
    const viewer = issueSession("viewer", CFG, NOW)!.token
    expect(verifySession(admin, { ...CFG, secret: "x".repeat(64) }, NOW)).toBeNull()
    expect(verifySession(admin, { ...CFG, adminPassword: "new-admin-password" }, NOW)).toBeNull()
    expect(verifySession(viewer, { ...CFG, adminPassword: "new-admin-password" }, NOW)?.role).toBe("viewer") // เปลี่ยนรหัสผู้ดูแลไม่กระทบผู้ชม
    expect(verifySession(viewer, { ...CFG, viewerPassword: null }, NOW)).toBeNull()
    expect(verifySession(admin, { secret: null, adminPassword: null, viewerPassword: null }, NOW)).toBeNull()
    expect(issueSession("viewer", { ...CFG, viewerPassword: null }, NOW)).toBeNull()
  })
})

describe("checkPassword", () => {
  it("แยกบทบาทถูก · ตัดช่องว่างหัวท้าย · ผิด/ไม่ใช่สตริง/ยาวผิดปกติ = null", () => {
    expect(checkPassword("admin-pass-123456", CFG)).toBe("admin")
    expect(checkPassword("  viewer-pass-654321\n", CFG)).toBe("viewer")
    expect(checkPassword("admin-pass-12345", CFG)).toBeNull()
    expect(checkPassword("", CFG)).toBeNull()
    expect(checkPassword(123456 as unknown, CFG)).toBeNull()
    expect(checkPassword({ toString: () => "admin-pass-123456" }, CFG)).toBeNull()
    expect(checkPassword("x".repeat(10_000), CFG)).toBeNull()
  })

  it("โหมด local (ไม่มีรหัสผู้ดูแล) = ไม่มีใครเข้าสู่ระบบได้", () => {
    expect(checkPassword("anything", { adminPassword: null, viewerPassword: null })).toBeNull()
  })
})

describe("Bearer token", () => {
  it("parseBearer รับเฉพาะรูปแบบ Bearer <token>", () => {
    expect(parseBearer("Bearer abc.def-123")).toBe("abc.def-123")
    expect(parseBearer("bearer   tok  ")).toBe("tok")
    expect(parseBearer("Basic dXNlcjpwYXNz")).toBeNull()
    expect(parseBearer("Bearer")).toBeNull()
    expect(parseBearer("Bearer a b")).toBeNull()
    expect(parseBearer(null)).toBeNull()
  })

  it("checkApiToken เทียบตรงตัว · ไม่ได้ตั้ง TMP_API_TOKEN = ปฏิเสธทุกค่า", () => {
    const tok = "t".repeat(40)
    expect(checkApiToken(tok, { apiToken: tok })).toBe(true)
    expect(checkApiToken(tok + "x", { apiToken: tok })).toBe(false)
    expect(checkApiToken(tok.slice(1), { apiToken: tok })).toBe(false)
    expect(checkApiToken(tok, { apiToken: null })).toBe(false)
    expect(checkApiToken(null, { apiToken: tok })).toBe(false)
  })
})

describe("cookie options", () => {
  it("HttpOnly + SameSite=Lax + Path=/ · Secure เฉพาะ https · maxAge 7 วัน (logout = 0)", () => {
    expect(sessionCookieOptions(false)).toEqual({ httpOnly: true, sameSite: "lax", secure: false, path: "/", maxAge: SESSION_TTL_SEC })
    expect(sessionCookieOptions(true).secure).toBe(true)
    expect(sessionCookieOptions(true, 0).maxAge).toBe(0)
  })
})
