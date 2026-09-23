/// <reference types="bun-types" />
// bun test — GET ที่บันทึกผลได้เฉพาะผู้ดูแลที่เรียกจากหน้าเว็บนี้ (กันผู้ชม/เว็บอื่นเปลี่ยน policy ผ่าน GET)
import { describe, expect, it } from "bun:test"
import { readSecurityConfig } from "./config"
import { INTERNAL_HEADER, internalRequest, mayPersistOnGet, readCookie, requestRole } from "./request-principal"
import { issueSession } from "./session"

const LOCAL = readSecurityConfig({})
const AUTH = readSecurityConfig({
  TMP_AUTH_PASSWORD: "admin-password-long",
  TMP_VIEWER_PASSWORD: "viewer-password-long",
  TMP_AUTH_SECRET: "k".repeat(64),
  TMP_API_TOKEN: "t".repeat(48),
})
const admin = issueSession("admin", AUTH)!.token
const viewer = issueSession("viewer", AUTH)!.token

const get = (headers: Record<string, string> = {}) =>
  new Request("http://localhost:3000/api/signals/ic?hold=60", { headers })

describe("readCookie", () => {
  it("หา cookie ตามชื่อท่ามกลาง cookie อื่น", () => {
    expect(readCookie("a=1; tmp_session=v1.x.y; b=2", "tmp_session")).toBe("v1.x.y")
    expect(readCookie("tmp_session_old=zzz; tmp_session=ok", "tmp_session")).toBe("ok")
  })
  it("ไม่มี header / ไม่มีชื่อนั้น → null", () => {
    expect(readCookie(null, "tmp_session")).toBeNull()
    expect(readCookie("a=1; b", "tmp_session")).toBeNull()
  })
})

describe("requestRole", () => {
  it("โหมด local → ผู้ดูแล (proxy ปล่อยมาได้เฉพาะ loopback)", () => {
    expect(requestRole(get(), LOCAL)).toBe("admin")
  })
  it("โหมด auth: cookie ผู้ดูแล / ผู้ชม / Bearer / ไม่มีอะไร / cookie ปลอม", () => {
    expect(requestRole(get({ cookie: `tmp_session=${admin}` }), AUTH)).toBe("admin")
    expect(requestRole(get({ cookie: `tmp_session=${viewer}` }), AUTH)).toBe("viewer")
    expect(requestRole(get({ authorization: `Bearer ${"t".repeat(48)}` }), AUTH)).toBe("admin")
    expect(requestRole(get(), AUTH)).toBeNull()
    expect(requestRole(get({ cookie: `tmp_session=${viewer.slice(0, -2)}xx` }), AUTH)).toBeNull()
    expect(requestRole(get({ authorization: "Bearer wrong" }), AUTH)).toBeNull()
  })
})

describe("mayPersistOnGet", () => {
  it("ผู้ดูแลจากหน้าเว็บนี้ / พิมพ์ URL เอง / สคริปต์ → บันทึกได้", () => {
    expect(mayPersistOnGet(get({ cookie: `tmp_session=${admin}`, "sec-fetch-site": "same-origin" }), AUTH)).toBe(true)
    expect(mayPersistOnGet(get({ cookie: `tmp_session=${admin}`, "sec-fetch-site": "none" }), AUTH)).toBe(true)
    expect(mayPersistOnGet(get({ authorization: `Bearer ${"t".repeat(48)}` }), AUTH)).toBe(true)
    expect(mayPersistOnGet(get({ "sec-fetch-site": "same-origin" }), LOCAL)).toBe(true)
  })
  it("ผู้ชมอ่านอย่างเดียว → ไม่บันทึก (แต่ยังอ่านผลได้)", () => {
    expect(mayPersistOnGet(get({ cookie: `tmp_session=${viewer}`, "sec-fetch-site": "same-origin" }), AUTH)).toBe(false)
  })
  it("เว็บอื่นพา browser มาเปิดลิงก์ (cross-site / same-site navigation) → ไม่บันทึก แม้เป็นผู้ดูแล", () => {
    expect(mayPersistOnGet(get({ cookie: `tmp_session=${admin}`, "sec-fetch-site": "cross-site" }), AUTH)).toBe(false)
    expect(mayPersistOnGet(get({ cookie: `tmp_session=${admin}`, "sec-fetch-site": "same-site" }), AUTH)).toBe(false)
    expect(mayPersistOnGet(get({ "sec-fetch-site": "cross-site" }), LOCAL)).toBe(false)
  })
  it("ไม่ได้เข้าสู่ระบบ → ไม่บันทึก", () => {
    expect(mayPersistOnGet(get({ "sec-fetch-site": "same-origin" }), AUTH)).toBe(false)
  })
})

describe("internalRequest — สคริปต์ CLI ที่เรียก route ใน process เดียวกัน", () => {
  it("ได้สิทธิ์ผู้ดูแลในโหมด auth โดยไม่ต้องมี cookie/token และคง header เดิมไว้", () => {
    const req = internalRequest("http://localhost/api/verify?hold=10", { headers: { accept: "application/json" } })
    expect(req.headers.get("accept")).toBe("application/json")
    expect(requestRole(req, AUTH)).toBe("admin")
    expect(mayPersistOnGet(req, AUTH)).toBe(true)
  })
  it("header ภายในที่เดามา (ผ่าน HTTP) ไม่ได้สิทธิ์", () => {
    expect(requestRole(get({ [INTERNAL_HEADER]: "0".repeat(64) }), AUTH)).toBeNull()
    expect(requestRole(get({ [INTERNAL_HEADER]: "" }), AUTH)).toBeNull()
  })
})
