/// <reference types="bun-types" />
// bun test — CSRF / cross-site guard ของ /api/*
import { describe, expect, it } from "bun:test"
import { checkCsrf, isAllowedOrigin, originMatchesHost } from "./csrf"

const JSON_CT = { "content-type": "application/json", "content-length": "12" }
function post(headers: Record<string, string>, method = "POST") {
  return checkCsrf({ method, pathname: "/api/seed", headers: new Headers(headers) })
}

describe("คำขอแก้ไขข้อมูลที่ถูกต้อง", () => {
  it("UI ของแพลตฟอร์มเอง: Origin ตรง Host + JSON", () => {
    expect(post({ host: "localhost:3000", origin: "http://localhost:3000", "sec-fetch-site": "same-origin", ...JSON_CT })).toEqual({ ok: true })
  })

  it("สคริปต์/curl: ไม่มี Origin/Referer + JSON (browser ถูกหลอกให้ส่งแบบนี้ไม่ได้)", () => {
    expect(post({ host: "localhost:3000", ...JSON_CT })).toEqual({ ok: true })
    expect(post({ host: "localhost:3000", "content-type": "application/json; charset=utf-8", "content-length": "5" })).toEqual({ ok: true })
  })

  it("ไม่มี body และไม่มี Content-Type (DELETE /api/gtaa/data, POST /api/gtaa/fetch จาก UI) = ผ่าน", () => {
    expect(post({ host: "localhost:3000", origin: "http://localhost:3000" }, "DELETE")).toEqual({ ok: true })
    expect(post({ host: "localhost:3000", origin: "http://localhost:3000", "content-length": "0" })).toEqual({ ok: true })
  })

  it("หลัง reverse proxy: Origin ตรง X-Forwarded-Host / อยู่ใน TMP_ALLOWED_ORIGINS", () => {
    expect(post({ host: "127.0.0.1:3000", "x-forwarded-host": "tmp.example.com", origin: "https://tmp.example.com", ...JSON_CT })).toEqual({ ok: true })
    const r = checkCsrf({
      method: "PUT",
      pathname: "/api/config/th",
      headers: new Headers({ host: "127.0.0.1:3000", origin: "https://tmp.example.com", ...JSON_CT }),
      allowedOrigins: ["https://tmp.example.com"],
    })
    expect(r).toEqual({ ok: true })
  })

  it("Referer ของหน้าเดียวกัน (ไม่มี Origin) = ผ่าน", () => {
    expect(post({ host: "localhost:3000", referer: "http://localhost:3000/?tab=data", ...JSON_CT })).toEqual({ ok: true })
  })
})

describe("คำขอข้ามไซต์ถูกปฏิเสธ (403)", () => {
  it("Origin ของเว็บอื่น / origin เดียวกันแต่ port อื่น / Origin: null", () => {
    for (const origin of ["https://evil.example", "http://localhost:5173", "null", "http://localhost.evil.example:3000"]) {
      const r = post({ host: "localhost:3000", origin, ...JSON_CT })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.status).toBe(403)
    }
  })

  it("Sec-Fetch-Site: cross-site / same-site (เว็บอื่นบน localhost คนละพอร์ต) แม้ Origin หายไป", () => {
    for (const site of ["cross-site", "same-site"]) {
      const r = post({ host: "localhost:3000", "sec-fetch-site": site, ...JSON_CT })
      expect(r.ok).toBe(false)
    }
  })

  it("ไม่มี Origin แต่ Referer มาจากเว็บอื่น / Referer เสีย", () => {
    expect(post({ host: "localhost:3000", referer: "https://evil.example/page", ...JSON_CT }).ok).toBe(false)
    expect(post({ host: "localhost:3000", referer: "not a url", ...JSON_CT }).ok).toBe(false)
  })
})

describe("Content-Type ต้องเป็น JSON (415)", () => {
  it("simple request ที่ browser ส่งข้ามไซต์ได้: text/plain, form-urlencoded, multipart", () => {
    for (const ct of ["text/plain;charset=UTF-8", "application/x-www-form-urlencoded", "multipart/form-data; boundary=x"]) {
      const r = post({ host: "localhost:3000", "content-type": ct, "content-length": "20" })
      expect(r.ok).toBe(false)
      if (!r.ok) {
        expect(r.status).toBe(415)
        expect(r.message).toContain("application/json")
      }
    }
  })

  it("มี body แต่ไม่มี Content-Type (content-length > 0 หรือ chunked) = 415", () => {
    expect(post({ host: "localhost:3000", "content-length": "30" }).ok).toBe(false)
    expect(post({ host: "localhost:3000", "transfer-encoding": "chunked" }).ok).toBe(false)
  })

  it("ข้ามไซต์ถูกตัดก่อนดู Content-Type (403 ไม่ใช่ 415)", () => {
    const r = post({ host: "localhost:3000", origin: "https://evil.example", "content-type": "text/plain", "content-length": "3" })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(403)
  })
})

describe("คำขออ่าน (GET/HEAD)", () => {
  const get = (h: Record<string, string>) => checkCsrf({ method: "GET", pathname: "/api/flagship", headers: new Headers(h) })
  it("sub-resource ข้ามไซต์ (<img>/<script> จากเว็บอื่น) = 403 · เปิดลิงก์ตรง / same-origin / curl = ผ่าน", () => {
    expect(get({ "sec-fetch-site": "cross-site", "sec-fetch-mode": "no-cors" }).ok).toBe(false)
    expect(get({ "sec-fetch-site": "cross-site", "sec-fetch-mode": "navigate" }).ok).toBe(true)
    expect(get({ "sec-fetch-site": "same-origin", "sec-fetch-mode": "cors" }).ok).toBe(true)
    expect(get({}).ok).toBe(true)
    expect(get({ "content-type": "text/plain" }).ok).toBe(true) // ไม่บังคับ Content-Type กับ GET
  })
})

describe("originMatchesHost / isAllowedOrigin", () => {
  it("port มาตรฐานละได้เมื่อ Host ไม่มี port · IPv6", () => {
    expect(originMatchesHost(new URL("https://tmp.example.com"), "tmp.example.com")).toBe(true)
    expect(originMatchesHost(new URL("http://tmp.example.com"), "tmp.example.com")).toBe(true)
    expect(originMatchesHost(new URL("https://tmp.example.com:8443"), "tmp.example.com")).toBe(false)
    expect(originMatchesHost(new URL("http://[::1]:3000"), "[::1]:3000")).toBe(true)
    expect(originMatchesHost(new URL("http://localhost:3000"), "localhost:3001")).toBe(false)
  })

  it("scheme อื่น / ค่าเสีย = ไม่อนุญาต", () => {
    const h = new Headers({ host: "localhost:3000" })
    expect(isAllowedOrigin("file:///etc/passwd", h)).toBe(false)
    expect(isAllowedOrigin("chrome-extension://abc", h)).toBe(false)
    expect(isAllowedOrigin("", h)).toBe(false)
  })
})
