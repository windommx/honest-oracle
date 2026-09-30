import { describe, expect, test } from "bun:test"
import { BASIC_CHALLENGE, checkApiToken, checkPassword, parseBasic, parseBearer } from "./auth"
import { readSecurityConfig } from "./config"
import { checkCsrf, isAllowedOrigin } from "./csrf"
import { clientKey, isLoopbackIp, isLoopbackRequest, splitHostPort } from "./net"
import { decideAccess } from "./policy"
import { matchRateRule, TokenBucketLimiter } from "./rate-limit"
import { requestActor } from "./request-actor"
import { SecurityEventLog } from "./events"

const H = (h: Record<string, string> = {}) => new Headers(h)
const LOCAL = { host: "localhost:3000" }
const REMOTE = { host: "192.168.1.20:3000", "x-forwarded-for": "192.168.1.9" }
const b64 = (s: string) => Buffer.from(s).toString("base64")

describe("security/net", () => {
  test("splitHostPort / isLoopbackIp", () => {
    expect(splitHostPort("Localhost:3000")).toEqual({ hostname: "localhost", port: "3000" })
    expect(splitHostPort("[::1]:3000")).toEqual({ hostname: "::1", port: "3000" })
    expect(splitHostPort("bad host")).toBeNull()
    expect(isLoopbackIp("127.0.0.1")).toBe(true)
    expect(isLoopbackIp("127.9.9.9")).toBe(true)
    expect(isLoopbackIp("::ffff:127.0.0.1")).toBe(true)
    expect(isLoopbackIp("0.0.0.0")).toBe(false)
    expect(isLoopbackIp("10.0.0.1")).toBe(false)
  })
  test("isLoopbackRequest: host + XFF/X-Real-IP/Forwarded ทุกตัวต้องเป็น loopback", () => {
    expect(isLoopbackRequest(H(LOCAL))).toBe(true)
    expect(isLoopbackRequest(H({ host: "localhost", "x-forwarded-for": "127.0.0.1" }))).toBe(true)
    expect(isLoopbackRequest(H({ host: "localhost", "x-forwarded-for": "203.0.113.5" }))).toBe(false)
    expect(isLoopbackRequest(H({ host: "localhost", forwarded: "for=203.0.113.5" }))).toBe(false)
    expect(isLoopbackRequest(H({ host: "localhost", "x-forwarded-host": "oqe.example" }))).toBe(false)
    expect(isLoopbackRequest(H(REMOTE))).toBe(false)
    expect(clientKey(H({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" }))).toBe("2.2.2.2")
    expect(clientKey(H())).toBe("unknown")
  })
})

describe("security/csrf", () => {
  test("GET ผ่านเสมอ ยกเว้น sub-resource ข้ามไซต์", () => {
    expect(checkCsrf({ method: "GET", pathname: "/api/board", headers: H(LOCAL) }).ok).toBe(true)
    expect(checkCsrf({ method: "GET", pathname: "/api/board", headers: H({ ...LOCAL, "sec-fetch-site": "cross-site", "sec-fetch-mode": "no-cors" }) }).ok).toBe(false)
    expect(checkCsrf({ method: "GET", pathname: "/api/board", headers: H({ ...LOCAL, "sec-fetch-site": "cross-site", "sec-fetch-mode": "navigate" }) }).ok).toBe(true)
  })
  test("POST: cross-site / origin แปลก / content-type ไม่ใช่ JSON ถูกปฏิเสธ · same-origin JSON ผ่าน · curl ไม่มี origin ผ่าน", () => {
    const ok = checkCsrf({ method: "POST", pathname: "/api/system", headers: H({ ...LOCAL, origin: "http://localhost:3000", "content-type": "application/json", "content-length": "5" }) })
    expect(ok.ok).toBe(true)
    const cross = checkCsrf({ method: "POST", pathname: "/api/system", headers: H({ ...LOCAL, "sec-fetch-site": "cross-site", "content-type": "application/json" }) })
    expect(cross).toMatchObject({ ok: false, status: 403, code: "cross_site" })
    const badOrigin = checkCsrf({ method: "POST", pathname: "/api/system", headers: H({ ...LOCAL, origin: "http://evil.example", "content-type": "application/json" }) })
    expect(badOrigin).toMatchObject({ ok: false, status: 403, code: "bad_origin" })
    const nullOrigin = checkCsrf({ method: "POST", pathname: "/api/system", headers: H({ ...LOCAL, origin: "null", "content-type": "application/json" }) })
    expect(nullOrigin.ok).toBe(false)
    const form = checkCsrf({ method: "POST", pathname: "/api/system", headers: H({ ...LOCAL, origin: "http://localhost:3000", "content-type": "text/plain", "content-length": "5" }) })
    expect(form).toMatchObject({ ok: false, status: 415 })
    const noBody = checkCsrf({ method: "POST", pathname: "/api/audit", headers: H({ ...LOCAL, origin: "http://localhost:3000" }) })
    expect(noBody.ok).toBe(true)
    const curl = checkCsrf({ method: "POST", pathname: "/api/system", headers: H({ ...LOCAL, "content-type": "application/json", "content-length": "5" }) })
    expect(curl.ok).toBe(true)
    const referer = checkCsrf({ method: "PATCH", pathname: "/api/journal", headers: H({ ...LOCAL, referer: "http://evil.example/page", "content-type": "application/json" }) })
    expect(referer.ok).toBe(false)
  })
  test("isAllowedOrigin: Host, X-Forwarded-Host, allowlist", () => {
    expect(isAllowedOrigin("http://localhost:3000", H(LOCAL))).toBe(true)
    expect(isAllowedOrigin("https://oqe.example", H({ host: "10.0.0.2:3000", "x-forwarded-host": "oqe.example" }))).toBe(true)
    expect(isAllowedOrigin("https://oqe.example", H({ host: "10.0.0.2:3000" }), ["https://oqe.example"])).toBe(true)
    expect(isAllowedOrigin("https://oqe.example", H({ host: "10.0.0.2:3000" }))).toBe(false)
  })
})

describe("security/auth + config", () => {
  test("parseBasic/parseBearer/check* แบบเวลาคงที่", () => {
    expect(parseBasic(`Basic ${b64("any:secret-pass")}`)).toEqual({ user: "any", password: "secret-pass" })
    expect(parseBasic("Basic !!!")).toBeNull()
    expect(parseBasic("Bearer x")).toBeNull()
    expect(parseBearer("Bearer abc")).toBe("abc")
    expect(parseBearer("Basic abc")).toBeNull()
    expect(checkPassword("secret-pass", "secret-pass")).toBe(true)
    expect(checkPassword("secret-pas", "secret-pass")).toBe(false)
    expect(checkPassword("x", null)).toBe(false)
    expect(checkApiToken("t", "t")).toBe(true)
    expect(checkApiToken("t", "u")).toBe(false)
    expect(BASIC_CHALLENGE).toContain("Basic realm=")
  })
  test("readSecurityConfig: โหมด, คำเตือน, origin list", () => {
    const local = readSecurityConfig({})
    expect(local.mode).toBe("local")
    expect(local.warnings).toEqual([])
    const auth = readSecurityConfig({ OQE_AUTH_PASSWORD: "short", OQE_API_TOKEN: "short", OQE_ALLOWED_ORIGINS: "https://a.example, bad, ftp://x" })
    expect(auth.mode).toBe("auth")
    expect(auth.allowedOrigins).toEqual(["https://a.example"])
    expect(auth.warnings.some((w) => w.includes("OQE_AUTH_PASSWORD สั้น"))).toBe(true)
    expect(auth.warnings.some((w) => w.includes("OQE_API_TOKEN สั้น"))).toBe(true)
    expect(auth.warnings.some((w) => w.includes("ซ้ำกับ"))).toBe(true)
    expect(auth.warnings.filter((w) => w.includes("OQE_ALLOWED_ORIGINS"))).toHaveLength(2)
    const open = readSecurityConfig({ OQE_ALLOW_REMOTE_NOAUTH: "1" })
    expect(open.allowRemoteNoAuth).toBe(true)
    expect(open.warnings[0]).toContain("ไม่ปลอดภัย")
  })
})

describe("security/rate-limit", () => {
  test("token bucket: burst แล้ว 429 พร้อม retryAfter · เติมตามเวลา · LRU จำกัดจำนวนกุญแจ", () => {
    const l = new TokenBucketLimiter(3)
    const spec = { capacity: 2, refillPerSec: 1 }
    expect(l.take("a", spec, 0).ok).toBe(true)
    expect(l.take("a", spec, 0).ok).toBe(true)
    const third = l.take("a", spec, 0)
    expect(third.ok).toBe(false)
    expect(third.retryAfterSec).toBe(1)
    expect(l.take("a", spec, 1500).ok).toBe(true)
    l.take("b", spec, 0)
    l.take("c", spec, 0)
    l.take("d", spec, 0)
    expect(l.size()).toBeLessThanOrEqual(3)
  })
  test("กติกา: LLM POST / seed / รายงานหนัก ถูกจับ · GET ธรรมดาไม่ถูกจับ", () => {
    expect(matchRateRule("POST", "/api/audit")?.name).toBe("llm-report")
    expect(matchRateRule("POST", "/api/synthesis/TSE")?.name).toBe("llm-report")
    expect(matchRateRule("POST", "/api/analyst/TSE")?.name).toBe("llm-chat")
    expect(matchRateRule("POST", "/api/system")?.name).toBe("seed")
    expect(matchRateRule("GET", "/api/apex/TSE")?.name).toBe("heavy-report")
    expect(matchRateRule("GET", "/api/board")).toBeNull()
    expect(matchRateRule("GET", "/api/synthesis/TSE")?.name).toBe("heavy-report")
    expect(matchRateRule("GET", "/api/research/robustness")?.name).toBe("heavy-report")
    expect(matchRateRule("POST", "/api/research/deep/TSE")?.name).toBe("llm-report")
    expect(matchRateRule("GET", "/api/research/deep/TSE")?.name).toBe("heavy-report")
    expect(matchRateRule("GET", "/api/rhythm")?.name).toBe("heavy-report")
    expect(matchRateRule("GET", "/api/atlas")?.name).toBe("heavy-report")
    expect(matchRateRule("GET", "/api/workflow")?.name).toBe("heavy-report")
    expect(matchRateRule("POST", "/api/workflow/run")?.name).toBe("workflow-run")
  })
})

describe("security/policy — decideAccess", () => {
  const localCfg = readSecurityConfig({})
  const authCfg = readSecurityConfig({ OQE_AUTH_PASSWORD: "correct-horse-battery", OQE_API_TOKEN: "token-token-token-token-1" })

  test("static asset ผ่านทุกโหมด", () => {
    expect(decideAccess({ method: "GET", pathname: "/_next/static/x.js", headers: H(REMOTE), config: authCfg }).kind).toBe("allow")
  })

  test("โหมด local: loopback ผ่าน · เครื่องอื่น 403 local_only (หน้าเว็บ = HTML, API = JSON) · ALLOW_REMOTE_NOAUTH เปิด", () => {
    expect(decideAccess({ method: "GET", pathname: "/", headers: H(LOCAL), config: localCfg })).toMatchObject({ kind: "allow", principal: { via: "local" } })
    const page = decideAccess({ method: "GET", pathname: "/", headers: H(REMOTE), config: localCfg })
    expect(page).toMatchObject({ kind: "deny", status: 403, code: "local_only", api: false })
    const api = decideAccess({ method: "GET", pathname: "/api/board", headers: H(REMOTE), config: localCfg })
    expect(api).toMatchObject({ kind: "deny", status: 403, code: "local_only", api: true })
    const open = readSecurityConfig({ OQE_ALLOW_REMOTE_NOAUTH: "1" })
    expect(decideAccess({ method: "GET", pathname: "/", headers: H(REMOTE), config: open })).toMatchObject({ kind: "allow", principal: { via: "open" } })
  })

  test("โหมด auth: ไม่มี credential → 401 + challenge (ยกเว้น /api/health) · Basic ถูก → admin · ผิด → 401 · Bearer ที่ /api/*", () => {
    const none = decideAccess({ method: "GET", pathname: "/", headers: H(REMOTE), config: authCfg })
    expect(none).toMatchObject({ kind: "deny", status: 401, challenge: true, api: false })
    expect(decideAccess({ method: "GET", pathname: "/api/health", headers: H(REMOTE), config: authCfg }).kind).toBe("allow")
    expect(decideAccess({ method: "GET", pathname: "/terms", headers: H(REMOTE), config: authCfg }).kind).toBe("allow")
    expect(decideAccess({ method: "GET", pathname: "/terms/x", headers: H(REMOTE), config: authCfg }).kind).toBe("deny")
    const good = decideAccess({ method: "GET", pathname: "/", headers: H({ ...REMOTE, authorization: `Basic ${b64("u:correct-horse-battery")}` }), config: authCfg })
    expect(good).toMatchObject({ kind: "allow", principal: { via: "basic" } })
    const bad = decideAccess({ method: "GET", pathname: "/api/board", headers: H({ ...REMOTE, authorization: `Basic ${b64("u:wrong")}` }), config: authCfg })
    expect(bad).toMatchObject({ kind: "deny", status: 401, code: "bad_password", challenge: true })
    const token = decideAccess({ method: "GET", pathname: "/api/board", headers: H({ ...REMOTE, authorization: "Bearer token-token-token-token-1" }), config: authCfg })
    expect(token).toMatchObject({ kind: "allow", principal: { via: "token" } })
    const badToken = decideAccess({ method: "GET", pathname: "/api/board", headers: H({ ...REMOTE, authorization: "Bearer nope" }), config: authCfg })
    expect(badToken).toMatchObject({ kind: "deny", status: 401, code: "bad_token" })
    // loopback ก็ต้องใส่รหัสในโหมด auth (รหัสผ่านคือกติกา ไม่ใช่ตำแหน่ง)
    expect(decideAccess({ method: "GET", pathname: "/", headers: H(LOCAL), config: authCfg })).toMatchObject({ kind: "deny", status: 401 })
  })

  test("เดารหัสซ้ำ → 429 หลัง 5 ครั้ง/นาที · รหัสถูกต้องไม่โดนลูกหลง", () => {
    const limiter = new TokenBucketLimiter()
    const wrong = { ...REMOTE, authorization: `Basic ${b64("u:wrong")}` }
    let last: ReturnType<typeof decideAccess> | null = null
    for (let i = 0; i < 6; i++) last = decideAccess({ method: "GET", pathname: "/api/board", headers: H(wrong), config: authCfg, limiter, now: 1000 })
    expect(last).toMatchObject({ kind: "deny", status: 429, code: "rate_limited" })
    const good = decideAccess({ method: "GET", pathname: "/api/board", headers: H({ ...REMOTE, authorization: `Basic ${b64("u:correct-horse-battery")}` }), config: authCfg, limiter, now: 1000 })
    expect(good.kind).toBe("allow")
  })

  test("CSRF มาก่อนทุกอย่างที่ /api/* · rate limit ของ LLM route ตอบ 429 + Retry-After", () => {
    const cross = decideAccess({ method: "POST", pathname: "/api/audit", headers: H({ ...LOCAL, "sec-fetch-site": "cross-site" }), config: localCfg })
    expect(cross).toMatchObject({ kind: "deny", status: 403, code: "cross_site" })
    const limiter = new TokenBucketLimiter()
    let last: ReturnType<typeof decideAccess> | null = null
    for (let i = 0; i < 5; i++) last = decideAccess({ method: "POST", pathname: "/api/audit", headers: H({ ...LOCAL, origin: "http://localhost:3000" }), config: localCfg, limiter, now: 5000 })
    expect(last).toMatchObject({ kind: "deny", status: 429, code: "rate_limited" })
    expect((last as { retryAfterSec?: number }).retryAfterSec).toBeGreaterThan(0)
  })
})

describe("security/viewer role — อ่านอย่างเดียว", () => {
  const cfg = readSecurityConfig({ OQE_AUTH_PASSWORD: "correct-horse-battery", OQE_VIEWER_PASSWORD: "viewer-only-password", OQE_API_TOKEN: "token-token-token-token-1" })
  const viewer = { ...REMOTE, authorization: `Basic ${b64("guest:viewer-only-password")}` }
  const admin = { ...REMOTE, authorization: `Basic ${b64("u:correct-horse-battery")}` }
  const json = { origin: "http://192.168.1.20:3000", "content-type": "application/json", "content-length": "2" }

  test("config: ผู้ชมต้องมีรหัสผู้ดูแลก่อน · รหัสซ้ำกัน → ปิดบทบาทผู้ชมพร้อมคำเตือน", () => {
    expect(cfg.viewerPassword).toBe("viewer-only-password")
    const noAdmin = readSecurityConfig({ OQE_VIEWER_PASSWORD: "viewer-only-password" })
    expect(noAdmin.mode).toBe("local")
    expect(noAdmin.viewerPassword).toBeNull()
    expect(noAdmin.warnings.some((w) => w.includes("OQE_VIEWER_PASSWORD"))).toBe(true)
    const same = readSecurityConfig({ OQE_AUTH_PASSWORD: "correct-horse-battery", OQE_VIEWER_PASSWORD: "correct-horse-battery" })
    expect(same.viewerPassword).toBeNull()
    expect(same.warnings.some((w) => w.includes("ปิดบทบาทผู้ชม"))).toBe(true)
  })

  test("ผู้ชม: GET หน้าเว็บ/API ผ่าน (role viewer) · POST/PATCH/DELETE → 403 read_only · ผู้ดูแลแก้ไขได้", () => {
    expect(decideAccess({ method: "GET", pathname: "/", headers: H(viewer), config: cfg })).toMatchObject({ kind: "allow", principal: { role: "viewer", via: "basic" } })
    expect(decideAccess({ method: "GET", pathname: "/api/board", headers: H(viewer), config: cfg })).toMatchObject({ kind: "allow", principal: { role: "viewer" } })
    for (const method of ["POST", "PATCH", "DELETE", "PUT"]) {
      const d = decideAccess({ method, pathname: "/api/journal", headers: H({ ...viewer, ...json }), config: cfg })
      expect(d).toMatchObject({ kind: "deny", status: 403, code: "read_only", api: true })
    }
    // เรียก LLM (ใช้โควตา) ก็เป็น POST → ผู้ชมทำไม่ได้
    expect(decideAccess({ method: "POST", pathname: "/api/audit", headers: H({ ...viewer, ...json }), config: cfg })).toMatchObject({ kind: "deny", code: "read_only" })
    expect(decideAccess({ method: "POST", pathname: "/api/journal", headers: H({ ...admin, ...json }), config: cfg })).toMatchObject({ kind: "allow", principal: { role: "admin", via: "basic" } })
    // รหัสผิดยังเป็น 401 ตามเดิม (ไม่ตกไปเป็นผู้ชม)
    expect(decideAccess({ method: "GET", pathname: "/", headers: H({ ...REMOTE, authorization: `Basic ${b64("u:nope")}` }), config: cfg })).toMatchObject({ kind: "deny", status: 401 })
  })

  test("requestActor: บอก 'ทาง' ที่เข้ามาให้ ActionLog — token / basic / viewer / local / open / unknown", () => {
    const req = (headers: Record<string, string> = {}) => new Request("http://x.example/api/journal", { headers })
    expect(requestActor(req({ authorization: "Bearer token-token-token-token-1" }), cfg)).toBe("token")
    expect(requestActor(req({ authorization: admin.authorization }), cfg)).toBe("basic")
    expect(requestActor(req({ authorization: viewer.authorization }), cfg)).toBe("viewer")
    expect(requestActor(req({ authorization: "Bearer wrong" }), cfg)).toBe("unknown")
    expect(requestActor(req(), cfg)).toBe("unknown")
    expect(requestActor(req(), readSecurityConfig({}))).toBe("local")
    expect(requestActor(req(), readSecurityConfig({ OQE_ALLOW_REMOTE_NOAUTH: "1" }))).toBe("open")
  })
})

describe("security/events — log การปฏิเสธแบบไม่ท่วม", () => {
  test("1 บรรทัด/นาที ต่อ (code, client) · นับที่ถูกกดทิ้ง · client/code ต่างกันแยกกัน · ไม่มี header/query ใน log", () => {
    const lines: Array<Record<string, unknown>> = []
    const ev = new SecurityEventLog((msg, fields) => lines.push({ msg, ...fields }))
    const base = { code: "bad_password", status: 401, method: "GET", path: "/api/board", client: "203.0.113.9" }
    expect(ev.deny(base, 0)).toBe(true)
    for (let i = 1; i <= 9; i++) expect(ev.deny(base, i * 1000)).toBe(false)
    expect(ev.deny({ ...base, client: "198.51.100.1" }, 5000)).toBe(true)
    expect(ev.deny({ ...base, code: "rate_limited", status: 429 }, 5000)).toBe(true)
    expect(ev.deny(base, 61_000)).toBe(true)
    expect(lines).toHaveLength(4)
    expect(lines[0]).toEqual({ msg: "security.deny", ...base, suppressedSinceLast: 0 })
    expect(lines[3].suppressedSinceLast).toBe(9)
    expect(Object.keys(lines[0]).sort()).toEqual(["client", "code", "method", "msg", "path", "status", "suppressedSinceLast"])
  })
})
