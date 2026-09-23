/// <reference types="bun-types" />
// bun test — อ่าน env → SecurityConfig (โหมด / คีย์อนุพันธ์ / คำเตือน)
import { describe, expect, it } from "bun:test"
import { getSecurityConfig, parseOriginList, readSecurityConfig } from "./config"

describe("readSecurityConfig", () => {
  it("ไม่มี env เลย = โหมด local ไม่มีความลับ ไม่มีคำเตือน", () => {
    const c = readSecurityConfig({})
    expect(c.mode).toBe("local")
    expect(c.adminPassword).toBeNull()
    expect(c.secret).toBeNull()
    expect(c.apiToken).toBeNull()
    expect(c.allowRemoteNoAuth).toBe(false)
    expect(c.hsts).toBe(false)
    expect(c.warnings).toEqual([])
  })

  it("ตั้งรหัส + secret = โหมด auth ใช้ secret จาก env", () => {
    const c = readSecurityConfig({ TMP_AUTH_PASSWORD: "a-long-admin-password", TMP_AUTH_SECRET: "k".repeat(64) })
    expect(c.mode).toBe("auth")
    expect(c.secret).toBe("k".repeat(64))
    expect(c.secretSource).toBe("env")
    expect(c.warnings).toEqual([])
  })

  it("ไม่มี TMP_AUTH_SECRET → อนุพันธ์จากรหัสผ่านแบบ deterministic + เตือน · เปลี่ยนรหัส = คีย์ใหม่", () => {
    const a = readSecurityConfig({ TMP_AUTH_PASSWORD: "a-long-admin-password" })
    const b = readSecurityConfig({ TMP_AUTH_PASSWORD: "a-long-admin-password" })
    const c = readSecurityConfig({ TMP_AUTH_PASSWORD: "another-admin-password" })
    expect(a.secretSource).toBe("derived")
    expect(a.secret).toMatch(/^[0-9a-f]{64}$/)
    expect(a.secret).toBe(b.secret)
    expect(a.secret).not.toBe(c.secret)
    expect(a.secret).not.toContain("a-long-admin-password")
    expect(a.warnings.join(" ")).toContain("TMP_AUTH_SECRET")
  })

  it("ค่าอ่อน/ขัดกันถูกเตือนหรือปิด: รหัสสั้น, secret สั้น, token สั้น, viewer ไม่มี admin, viewer = admin", () => {
    const weak = readSecurityConfig({ TMP_AUTH_PASSWORD: "short", TMP_AUTH_SECRET: "tiny", TMP_API_TOKEN: "abc" })
    const w = weak.warnings.join(" | ")
    expect(w).toContain("TMP_AUTH_PASSWORD")
    expect(w).toContain("TMP_AUTH_SECRET")
    expect(w).toContain("TMP_API_TOKEN")

    const viewerOnly = readSecurityConfig({ TMP_VIEWER_PASSWORD: "viewer-password-x" })
    expect(viewerOnly.mode).toBe("local")
    expect(viewerOnly.viewerPassword).toBeNull()

    const same = readSecurityConfig({ TMP_AUTH_PASSWORD: "same-password-xyz", TMP_VIEWER_PASSWORD: "same-password-xyz", TMP_AUTH_SECRET: "k".repeat(64) })
    expect(same.viewerPassword).toBeNull()
    expect(same.warnings.length).toBe(1)
  })

  it("ค่าว่าง/ช่องว่าง = ไม่ได้ตั้ง · ธง 1/true/yes/on", () => {
    expect(readSecurityConfig({ TMP_AUTH_PASSWORD: "   " }).mode).toBe("local")
    expect(readSecurityConfig({ TMP_ALLOW_REMOTE_NOAUTH: "1" }).allowRemoteNoAuth).toBe(true)
    expect(readSecurityConfig({ TMP_ALLOW_REMOTE_NOAUTH: "TRUE" }).allowRemoteNoAuth).toBe(true)
    expect(readSecurityConfig({ TMP_ALLOW_REMOTE_NOAUTH: "0" }).allowRemoteNoAuth).toBe(false)
    expect(readSecurityConfig({ TMP_HSTS: "on" }).hsts).toBe(true)
    expect(readSecurityConfig({ TMP_ALLOW_REMOTE_NOAUTH: "1" }).warnings.join(" ")).toContain("ไม่ปลอดภัย")
  })

  it("TMP_ALLOWED_ORIGINS → origin มาตรฐาน ตัดซ้ำ ทิ้งค่าเสียพร้อมเตือน", () => {
    const warnings: string[] = []
    expect(parseOriginList("https://a.example.com/path, http://b.local:8080,https://a.example.com, ftp://x, nope", warnings)).toEqual([
      "https://a.example.com",
      "http://b.local:8080",
    ])
    expect(warnings.length).toBe(2)
  })

  it("getSecurityConfig cache ตามค่า env (เปลี่ยน env = อ่านใหม่)", () => {
    const env1 = { NODE_ENV: "test", TMP_AUTH_PASSWORD: "cache-test-password-1" }
    const a = getSecurityConfig(env1)
    expect(getSecurityConfig({ ...env1 })).toBe(a)
    const b = getSecurityConfig({ NODE_ENV: "test" })
    expect(b.mode).toBe("local")
    expect(getSecurityConfig(env1)).not.toBe(b)
  })
})
