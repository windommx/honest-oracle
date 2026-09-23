/// <reference types="bun-types" />
// bun test — ตัวตัดสินสิทธิ์ของ proxy (ทุกโหมด ทุกบทบาท CSRF และ rate limit รวมกัน)
import { describe, expect, it } from "bun:test"
import { readSecurityConfig } from "./config"
import { decideAccess, type AccessDecision, type AccessInput } from "./policy"
import { TokenBucketLimiter } from "./rate-limit"
import { issueSession } from "./session"

const LOCAL = readSecurityConfig({})
const AUTH = readSecurityConfig({
  TMP_AUTH_PASSWORD: "admin-password-long",
  TMP_VIEWER_PASSWORD: "viewer-password-long",
  TMP_AUTH_SECRET: "k".repeat(64),
  TMP_API_TOKEN: "t".repeat(48),
})
const NOW_MS = 1_800_000_000_000
const adminCookie = issueSession("admin", AUTH, NOW_MS / 1000)!.token
const viewerCookie = issueSession("viewer", AUTH, NOW_MS / 1000)!.token

const LOOPBACK = { host: "localhost:3000", "x-forwarded-for": "::1" }
const REMOTE = { host: "192.168.1.20:3000", "x-forwarded-for": "192.168.1.50" }
const JSON_BODY = { "content-type": "application/json", "content-length": "2" }

function decide(p: Omit<Partial<AccessInput>, "headers"> & { headers?: Record<string, string> | Headers }): AccessDecision {
  const headers = p.headers instanceof Headers ? p.headers : new Headers(p.headers ?? {})
  return decideAccess({
    method: p.method ?? "GET",
    pathname: p.pathname ?? "/",
    search: p.search,
    headers,
    sessionToken: p.sessionToken ?? null,
    config: p.config ?? AUTH,
    now: p.now ?? NOW_MS,
    limiter: p.limiter ?? null,
  })
}

const status = (d: AccessDecision) => (d.kind === "deny" ? d.status : d.kind === "redirect" ? 307 : 200)

describe("โหมด local (ไม่ได้ตั้งรหัสผ่าน) — พฤติกรรมเดิมบนเครื่องตัวเอง", () => {
  it("loopback: หน้าเว็บ + API อ่าน/เขียนได้เหมือนเดิม (admin via local)", () => {
    const page = decide({ config: LOCAL, headers: LOOPBACK })
    expect(page).toEqual({ kind: "allow", principal: { role: "admin", via: "local" } })
    expect(status(decide({ config: LOCAL, method: "POST", pathname: "/api/seed", headers: { ...LOOPBACK, origin: "http://localhost:3000", ...JSON_BODY } }))).toBe(200)
    expect(status(decide({ config: LOCAL, method: "DELETE", pathname: "/api/gtaa/data", headers: { ...LOOPBACK, origin: "http://localhost:3000" } }))).toBe(200)
  })

  it("เครื่องอื่น → 403 (หน้าเว็บได้ HTML อธิบาย · API ได้ JSON) รวม public path", () => {
    const page = decide({ config: LOCAL, headers: REMOTE })
    expect(page).toMatchObject({ kind: "deny", status: 403, code: "local_only", api: false })
    if (page.kind === "deny") expect(page.message).toContain("TMP_AUTH_PASSWORD")
    expect(decide({ config: LOCAL, pathname: "/api/overview", headers: REMOTE })).toMatchObject({ status: 403, api: true })
    expect(status(decide({ config: LOCAL, pathname: "/login", headers: REMOTE }))).toBe(403)
  })

  it("ปลอม Host: localhost จากเครื่องอื่น (XFF ที่ Next เติมจาก socket ไม่ใช่ loopback) → 403", () => {
    expect(status(decide({ config: LOCAL, pathname: "/api/seed", method: "POST", headers: { host: "localhost:3000", "x-forwarded-for": "192.168.1.50", ...JSON_BODY } }))).toBe(403)
  })

  it("DNS rebinding (Host = โดเมนผู้โจมตีที่ชี้ 127.0.0.1) → 403", () => {
    expect(status(decide({ config: LOCAL, pathname: "/api/overview", headers: { host: "rebind.evil.example:3000", "x-forwarded-for": "127.0.0.1" } }))).toBe(403)
  })

  it("TMP_ALLOW_REMOTE_NOAUTH=1 เปิดให้เครื่องอื่น (ไม่ปลอดภัย แต่ตั้งใจ)", () => {
    const open = readSecurityConfig({ TMP_ALLOW_REMOTE_NOAUTH: "1" })
    expect(decide({ config: open, headers: REMOTE })).toEqual({ kind: "allow", principal: { role: "admin", via: "open" } })
  })

  it("Bearer token ใช้ได้จากเครื่องอื่นแม้โหมด local (สคริปต์/cron)", () => {
    const withToken = readSecurityConfig({ TMP_API_TOKEN: "z".repeat(48) })
    const ok = decide({ config: withToken, method: "POST", pathname: "/api/feed/ingest", headers: { ...REMOTE, authorization: `Bearer ${"z".repeat(48)}`, ...JSON_BODY } })
    expect(ok).toEqual({ kind: "allow", principal: { role: "admin", via: "token" } })
    expect(status(decide({ config: withToken, pathname: "/api/overview", headers: { ...REMOTE, authorization: "Bearer wrong" } }))).toBe(401)
    expect(status(decide({ config: withToken, pathname: "/", headers: { ...REMOTE, authorization: `Bearer ${"z".repeat(48)}` } }))).toBe(403) // token ใช้กับหน้าเว็บไม่ได้
  })

  it("CSRF ยังบังคับในโหมด local: เว็บอื่นยิง POST text/plain / Origin ต่างไซต์ มาที่ localhost ของผู้ใช้", () => {
    const textPlain = decide({ config: LOCAL, method: "POST", pathname: "/api/seed", headers: { ...LOOPBACK, "content-type": "text/plain", "content-length": "2" } })
    expect(textPlain).toMatchObject({ kind: "deny", status: 415 })
    const crossSite = decide({ config: LOCAL, method: "POST", pathname: "/api/seed", headers: { ...LOOPBACK, origin: "https://evil.example", ...JSON_BODY } })
    expect(crossSite).toMatchObject({ kind: "deny", status: 403, code: "bad_origin" })
  })
})

describe("โหมด auth (ตั้ง TMP_AUTH_PASSWORD)", () => {
  it("ไม่มี session: หน้าเว็บ → redirect /login?next= (ตัด _rsc) · API → 401 · POST หน้าเว็บ → 401", () => {
    expect(decide({ pathname: "/", search: "?tab=data&_rsc=abc", headers: REMOTE })).toEqual({ kind: "redirect", location: "/login?next=%2F%3Ftab%3Ddata" })
    expect(decide({ pathname: "/api/overview", headers: REMOTE })).toMatchObject({ kind: "deny", status: 401, code: "unauthenticated", api: true })
    expect(status(decide({ method: "POST", pathname: "/", headers: { ...REMOTE, ...JSON_BODY } }))).toBe(401)
  })

  it("public path เข้าได้โดยไม่มี session: /login /terms /api/auth/* /api/health + static", () => {
    for (const p of ["/login", "/terms", "/api/auth/session", "/api/health", "/_next/static/x.js", "/icon.svg"]) {
      expect(status(decide({ pathname: p, headers: REMOTE }))).toBe(200)
    }
    expect(status(decide({ method: "POST", pathname: "/api/auth/login", headers: { ...REMOTE, ...JSON_BODY } }))).toBe(200)
  })

  it("session ผู้ดูแล: ทุกอย่างผ่าน (จากเครื่องใดก็ได้)", () => {
    expect(decide({ pathname: "/", headers: REMOTE, sessionToken: adminCookie })).toEqual({ kind: "allow", principal: { role: "admin", via: "session" } })
    expect(status(decide({ method: "POST", pathname: "/api/seed", headers: { ...REMOTE, origin: "http://192.168.1.20:3000", ...JSON_BODY }, sessionToken: adminCookie }))).toBe(200)
  })

  it("session ผู้ชม: GET/HEAD ผ่าน · POST/PUT/PATCH/DELETE → 403 · logout ได้", () => {
    expect(status(decide({ pathname: "/api/overview", headers: REMOTE, sessionToken: viewerCookie }))).toBe(200)
    expect(status(decide({ method: "HEAD", pathname: "/", headers: REMOTE, sessionToken: viewerCookie }))).toBe(200)
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const d = decide({ method, pathname: "/api/jev/pending", headers: { ...REMOTE, ...JSON_BODY }, sessionToken: viewerCookie })
      expect(d).toMatchObject({ kind: "deny", status: 403, code: "read_only" })
    }
    expect(status(decide({ method: "POST", pathname: "/api/auth/logout", headers: { ...REMOTE, ...JSON_BODY }, sessionToken: viewerCookie }))).toBe(200)
  })

  it("session หมดอายุ / ปลอม / ของคนละ secret → เหมือนไม่มี session", () => {
    const later = NOW_MS + 8 * 24 * 3600 * 1000
    expect(status(decide({ pathname: "/api/overview", headers: REMOTE, sessionToken: adminCookie, now: later }))).toBe(401)
    expect(status(decide({ pathname: "/api/overview", headers: REMOTE, sessionToken: adminCookie.slice(0, -3) + "xyz" }))).toBe(401)
    const other = readSecurityConfig({ TMP_AUTH_PASSWORD: "admin-password-long", TMP_AUTH_SECRET: "q".repeat(64) })
    expect(status(decide({ config: other, pathname: "/api/overview", headers: REMOTE, sessionToken: adminCookie }))).toBe(401)
  })

  it("Bearer token: admin เฉพาะ /api/* · token ผิด → 401 ทันที (ไม่ตกไปใช้ cookie)", () => {
    const tok = `Bearer ${"t".repeat(48)}`
    expect(decide({ method: "POST", pathname: "/api/feed/ingest", headers: { ...REMOTE, authorization: tok, ...JSON_BODY } })).toEqual({
      kind: "allow",
      principal: { role: "admin", via: "token" },
    })
    expect(decide({ pathname: "/api/overview", headers: { ...REMOTE, authorization: "Bearer nope" }, sessionToken: adminCookie })).toMatchObject({
      status: 401,
      code: "bad_token",
    })
    expect(decide({ pathname: "/", headers: { ...REMOTE, authorization: tok } }).kind).toBe("redirect")
  })

  it("CSRF มาก่อนสิทธิ์: ผู้ดูแลที่มี cookie แต่คำขอมาจากเว็บอื่น → 403", () => {
    const d = decide({ method: "POST", pathname: "/api/seed", headers: { ...REMOTE, origin: "https://evil.example", ...JSON_BODY }, sessionToken: adminCookie })
    expect(d).toMatchObject({ kind: "deny", status: 403, code: "bad_origin" })
  })
})

describe("rate limit (proxy)", () => {
  it("งานเรียก LLM: 3 ครั้งติด แล้ว 429 + Retry-After · client อื่นไม่โดน", () => {
    const limiter = new TokenBucketLimiter()
    const run = (ip: string) =>
      decide({ config: LOCAL, method: "POST", pathname: "/api/lab/run", headers: { host: "localhost:3000", "x-forwarded-for": ip, ...JSON_BODY }, limiter })
    expect([1, 2, 3].map(() => status(run("127.0.0.1")))).toEqual([200, 200, 200])
    const d = run("127.0.0.1")
    expect(d).toMatchObject({ kind: "deny", status: 429, code: "rate_limited", api: true })
    if (d.kind === "deny") {
      expect(d.retryAfterSec).toBeGreaterThan(0)
      expect(d.message).toContain("วินาที")
    }
    expect(status(run("::1"))).toBe(200)
  })

  it("เดา Bearer token ซ้ำ: 5 ครั้ง/นาที/IP แล้ว 429 · ผู้ถือ token จริงไม่โดนลูกหลง", () => {
    const limiter = new TokenBucketLimiter()
    const guess = () => decide({ pathname: "/api/overview", headers: { ...REMOTE, authorization: "Bearer guess" }, limiter })
    expect([1, 2, 3, 4, 5].map(() => status(guess()))).toEqual([401, 401, 401, 401, 401])
    const d = guess()
    expect(d).toMatchObject({ kind: "deny", status: 429, code: "rate_limited" })
    const real = decide({ pathname: "/api/overview", headers: { ...REMOTE, authorization: `Bearer ${"t".repeat(48)}` }, limiter })
    expect(real).toEqual({ kind: "allow", principal: { role: "admin", via: "token" } })
  })

  it("คำขอที่ไม่ผ่านสิทธิ์ไม่กิน token (401 มาก่อน 429)", () => {
    const limiter = new TokenBucketLimiter()
    for (let i = 0; i < 10; i++) {
      expect(status(decide({ method: "POST", pathname: "/api/lab/run", headers: { ...REMOTE, ...JSON_BODY }, limiter }))).toBe(401)
    }
    expect(limiter.size()).toBe(0)
  })
})
