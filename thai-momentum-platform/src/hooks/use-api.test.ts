/// <reference types="bun-types" />
// bun test — postJson กับ response ที่ไม่ใช่ JSON (หน้า HTML ของ proxy/gateway timeout)
import { afterEach, describe, expect, it } from "bun:test"

import { fmtNum, fmtPct, postJson } from "./use-api"

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})
const respond = (body: string, status: number) => {
  globalThis.fetch = (async () => new Response(body, { status, headers: { "content-type": "text/html" } })) as unknown as typeof fetch
}

describe("postJson", () => {
  it("504 ที่เป็น HTML → แจ้ง HTTP 504 (เดิมได้ 'JSON Parse error' ที่อ่านไม่รู้เรื่อง)", async () => {
    respond("<html><body>504 Gateway Time-out</body></html>", 504)
    await expect(postJson("/api/seed", {})).rejects.toThrow("HTTP 504")
  })
  it("error JSON ของ route ยังแสดงข้อความของ route", async () => {
    respond(JSON.stringify({ error: "ไม่พบข้อมูล CSV ที่ส่งมา" }), 400)
    await expect(postJson("/api/ingest", {})).rejects.toThrow("ไม่พบข้อมูล CSV ที่ส่งมา")
  })
  it("200 ที่ไม่ใช่ JSON → error ที่บอกสถานะ", async () => {
    respond("ok", 200)
    await expect(postJson("/api/x", {})).rejects.toThrow("รูปแบบข้อมูลไม่ถูกต้อง")
  })
})

describe("fmtPct / fmtNum", () => {
  it("null / NaN / Infinity → —", () => {
    expect(fmtPct(null)).toBe("—")
    expect(fmtPct(NaN)).toBe("—")
    expect(fmtNum(Infinity)).toBe("—")
    expect(fmtPct(1.234)).toBe("+1.2%")
  })
})
