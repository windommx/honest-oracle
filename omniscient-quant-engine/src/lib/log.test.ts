import { describe, expect, test } from "bun:test"
import { formatLogLine } from "./log"

const NOW = new Date("2026-09-29T03:04:05.000Z")

describe("log — structured JSON lines", () => {
  test("JSON: 1 บรรทัด มี ts/level/msg + fields · ts/level/msg ใน fields เขียนทับไม่ได้", () => {
    const line = formatLogLine("info", "action", { actor: "basic", status: 201, level: "error", msg: "x" }, NOW)
    expect(line).not.toContain("\n")
    expect(JSON.parse(line)).toEqual({ ts: "2026-09-29T03:04:05.000Z", level: "info", msg: "action", actor: "basic", status: 201 })
  })

  test("ความลับถูกปิดเสมอ: password / token / secret / authorization / cookie / api key", () => {
    const rec = JSON.parse(
      formatLogLine("warn", "x", {
        password: "hunter2", OQE_AUTH_PASSWORD: "p", apiToken: "t", clientSecret: "s",
        authorization: "Basic abc", cookie: "sid=1", "api-key": "k", api_key: "k2", note: "ok",
      }, NOW),
    )
    for (const k of ["password", "OQE_AUTH_PASSWORD", "apiToken", "clientSecret", "authorization", "cookie", "api-key", "api_key"]) {
      expect(rec[k]).toBe("[redacted]")
    }
    expect(rec.note).toBe("ok")
  })

  test("Error → {name, message} · bigint → string · ค่า circular ไม่ทำให้ล้ม", () => {
    const circ: Record<string, unknown> = {}
    circ.self = circ
    const rec = JSON.parse(formatLogLine("error", "boom", { error: new TypeError("bad"), n: BigInt(7) }, NOW))
    expect(rec.error).toEqual({ name: "TypeError", message: "bad" })
    expect(rec.n).toBe("7")
    const safe = JSON.parse(formatLogLine("error", "boom", { circ }, NOW))
    expect(safe.msg).toBe("boom")
    expect(safe.note).toBeDefined()
  })

  test("text: อ่านง่ายตอน dev แต่ยังปิดความลับ", () => {
    const line = formatLogLine("warn", "denied", { code: "local_only", token: "abc" }, NOW, "text")
    expect(line).toBe("2026-09-29T03:04:05.000Z WARN  denied · code=local_only token=[redacted]")
  })
})
