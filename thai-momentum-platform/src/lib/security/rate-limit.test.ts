/// <reference types="bun-types" />
// bun test — token bucket + กติกา rate limit ของแพลตฟอร์ม
import { describe, expect, it } from "bun:test"
import { LOGIN_RATE, matchRateRule, sharedLimiter, TokenBucketLimiter } from "./rate-limit"

describe("TokenBucketLimiter", () => {
  const spec = { capacity: 3, refillPerSec: 1 / 20 } // 3 ครั้งติด แล้วเติม 1 ครั้ง/20 วินาที

  it("ยิงติดกันได้เท่า capacity แล้ว 429 พร้อม Retry-After ที่ถูกต้อง", () => {
    const l = new TokenBucketLimiter()
    const t0 = 1_000_000
    expect([1, 2, 3].map(() => l.take("k", spec, t0).ok)).toEqual([true, true, true])
    const denied = l.take("k", spec, t0)
    expect(denied.ok).toBe(false)
    expect(denied.retryAfterSec).toBe(20)
    expect(l.take("k", spec, t0 + 10_000).retryAfterSec).toBe(10) // รอไปครึ่งทาง
  })

  it("เติม token ตามเวลา ไม่เกิน capacity", () => {
    const l = new TokenBucketLimiter()
    const t0 = 5_000_000
    for (let i = 0; i < 3; i++) l.take("k", spec, t0)
    expect(l.take("k", spec, t0 + 20_000).ok).toBe(true) // ได้คืน 1
    expect(l.take("k", spec, t0 + 20_000).ok).toBe(false)
    const later = t0 + 3_600_000 // หนึ่งชั่วโมง — เต็มแค่ 3
    expect([1, 2, 3, 4].map(() => l.take("k", spec, later).ok)).toEqual([true, true, true, false])
  })

  it("กุญแจแยกกัน (client/เส้นทางอื่นไม่โดนลูกหลง)", () => {
    const l = new TokenBucketLimiter()
    for (let i = 0; i < 3; i++) l.take("a", spec, 0)
    expect(l.take("a", spec, 0).ok).toBe(false)
    expect(l.take("b", spec, 0).ok).toBe(true)
  })

  it("จำนวนกุญแจมีเพดาน (LRU) — IP ปลอมจำนวนมากไม่ทำให้หน่วยความจำโต", () => {
    const l = new TokenBucketLimiter(100)
    for (let i = 0; i < 5000; i++) l.take(`ip-${i}`, spec, i)
    expect(l.size()).toBe(100)
  })

  it("sharedLimiter เป็นตัวเดียวกันทั้ง process (globalThis)", () => {
    expect(sharedLimiter()).toBe(sharedLimiter())
  })

  it("login: 5 ครั้ง/นาที", () => {
    const l = new TokenBucketLimiter()
    const r = [1, 2, 3, 4, 5, 6].map(() => l.take("login|1.2.3.4", LOGIN_RATE, 0).ok)
    expect(r).toEqual([true, true, true, true, true, false])
    expect(l.take("login|1.2.3.4", LOGIN_RATE, 13_000).ok).toBe(true) // ได้คืน 1 ครั้งทุก 12 วินาที
  })
})

describe("matchRateRule", () => {
  it("จับคู่ endpoint หนักตามเมธอด", () => {
    expect(matchRateRule("POST", "/api/lab/run")?.name).toBe("llm")
    expect(matchRateRule("post", "/api/lab/eval")?.name).toBe("llm")
    expect(matchRateRule("POST", "/api/feed/fetch")?.name).toBe("external-fetch")
    expect(matchRateRule("POST", "/api/gtaa/fetch")?.name).toBe("external-fetch")
    expect(matchRateRule("POST", "/api/jev/run")?.name).toBe("jev")
    expect(matchRateRule("POST", "/api/research/cpcv")?.name).toBe("research")
    expect(matchRateRule("GET", "/api/research/prereg")?.name).toBe("heavy-report")
    expect(matchRateRule("GET", "/api/engines/global")?.name).toBe("heavy-report")
    expect(matchRateRule("GET", "/api/flagship")?.name).toBe("heavy-report")
    expect(matchRateRule("GET", "/api/arb/pairs")?.name).toBe("heavy-report")
  })

  it("endpoint ทั่วไป / GET ของงานรัน = ไม่จำกัด", () => {
    expect(matchRateRule("GET", "/api/overview")).toBeNull()
    expect(matchRateRule("GET", "/api/lab/dashboard")).toBeNull()
    expect(matchRateRule("POST", "/api/seed")).toBeNull()
    expect(matchRateRule("GET", "/api/jev/run")).toBeNull()
    expect(matchRateRule("POST", "/api/flagship")).toBeNull()
  })
})
