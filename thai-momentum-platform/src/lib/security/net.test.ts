/// <reference types="bun-types" />
// bun test — Host / IP / forwarded headers (ตัดสิน loopback ของโหมด local)
import { describe, expect, it } from "bun:test"
import {
  claimedClientIps,
  clientKey,
  isHttpsRequest,
  isLoopbackHostname,
  isLoopbackIp,
  isLoopbackRequest,
  parseForwardedFor,
  parseForwardedHeader,
  splitHostPort,
} from "./net"

const H = (h: Record<string, string>) => new Headers(h)

describe("splitHostPort", () => {
  it("แยก host/port ทั้ง IPv4 ชื่อโดเมน IPv6 แบบวงเล็บ · ตัวพิมพ์เล็ก · จุดท้าย", () => {
    expect(splitHostPort("localhost:3000")).toEqual({ hostname: "localhost", port: "3000" })
    expect(splitHostPort("LocalHost")).toEqual({ hostname: "localhost", port: null })
    expect(splitHostPort("[::1]:3000")).toEqual({ hostname: "::1", port: "3000" })
    expect(splitHostPort("[::1]")).toEqual({ hostname: "::1", port: null })
    expect(splitHostPort("example.com.")).toEqual({ hostname: "example.com", port: null })
  })

  it("รูปแบบเสีย = null (มี path / user@ / port ไม่ใช่ตัวเลข / ว่าง)", () => {
    for (const bad of ["", "   ", "evil.com/x", "user@localhost", "localhost:abc", "[::1", "[::1]x", null, undefined]) {
      expect(splitHostPort(bad as string)).toBeNull()
    }
  })
})

describe("loopback", () => {
  it("IP: 127.0.0.0/8, ::1, IPv4-mapped — ไม่รวม 0.0.0.0 / LAN / ค่าเสีย", () => {
    for (const ok of ["127.0.0.1", "127.1.2.3", "::1", "::ffff:127.0.0.1", "[::1]", "0:0:0:0:0:0:0:1"]) expect(isLoopbackIp(ok)).toBe(true)
    for (const no of ["0.0.0.0", "192.168.1.5", "10.0.0.1", "::ffff:192.168.1.5", "128.0.0.1", "127.0.0.256", "localhost", "", "::", null]) {
      expect(isLoopbackIp(no as string)).toBe(false)
    }
  })

  it("hostname: localhost / 127.x / ::1 เท่านั้น (ไม่รวมโดเมนที่ rebinding มาเป็น 127.0.0.1)", () => {
    expect(isLoopbackHostname("localhost")).toBe(true)
    expect(isLoopbackHostname("127.0.0.1")).toBe(true)
    expect(isLoopbackHostname("::1")).toBe(true)
    expect(isLoopbackHostname("evil.com")).toBe(false)
    expect(isLoopbackHostname("localhost.evil.com")).toBe(false)
    expect(isLoopbackHostname("0.0.0.0")).toBe(false)
  })
})

describe("forwarded headers", () => {
  it("XFF หลายค่า / มี port / IPv6 วงเล็บ / unknown", () => {
    expect(parseForwardedFor("203.0.113.9, 127.0.0.1:5555, [::1]:80, unknown, ")).toEqual(["203.0.113.9", "127.0.0.1", "::1"])
    expect(parseForwardedFor(null)).toEqual([])
  })

  it("RFC 7239 Forwarded: for=", () => {
    expect(parseForwardedHeader('for=192.0.2.60;proto=http;by=203.0.113.43, for="[2001:db8:cafe::17]:4711"')).toEqual([
      "192.0.2.60",
      "2001:db8:cafe::17",
    ])
  })

  it("claimedClientIps รวม XFF + X-Real-IP + Forwarded", () => {
    expect(claimedClientIps(H({ "x-forwarded-for": "1.1.1.1", "x-real-ip": "2.2.2.2", forwarded: "for=3.3.3.3" }))).toEqual([
      "1.1.1.1",
      "2.2.2.2",
      "3.3.3.3",
    ])
  })
})

describe("isLoopbackRequest (โหมด local)", () => {
  it("เปิดจากเครื่องตัวเอง: Host localhost/127.0.0.1/[::1] + XFF ที่ Next ใส่จาก socket (loopback)", () => {
    expect(isLoopbackRequest(H({ host: "localhost:3000" }))).toBe(true)
    expect(isLoopbackRequest(H({ host: "localhost:3000", "x-forwarded-for": "::1", "x-forwarded-host": "localhost:3000" }))).toBe(true)
    expect(isLoopbackRequest(H({ host: "127.0.0.1:3000", "x-forwarded-for": "::ffff:127.0.0.1" }))).toBe(true)
    expect(isLoopbackRequest(H({ host: "[::1]:3000", "x-forwarded-for": "::1" }))).toBe(true)
  })

  it("เครื่องอื่น: เปิดผ่าน IP ใน LAN / DNS rebinding / Host ว่าง / 0.0.0.0", () => {
    expect(isLoopbackRequest(H({ host: "192.168.1.20:3000", "x-forwarded-for": "192.168.1.50" }))).toBe(false)
    expect(isLoopbackRequest(H({ host: "evil.example:3000", "x-forwarded-for": "127.0.0.1" }))).toBe(false)
    expect(isLoopbackRequest(H({}))).toBe(false)
    expect(isLoopbackRequest(H({ host: "0.0.0.0:3000" }))).toBe(false)
  })

  it("ปลอม Host: localhost แต่ IP ต้นทางไม่ใช่ loopback (XFF/X-Real-IP/Forwarded ใดก็ได้) = ปฏิเสธ", () => {
    expect(isLoopbackRequest(H({ host: "localhost:3000", "x-forwarded-for": "203.0.113.7" }))).toBe(false)
    expect(isLoopbackRequest(H({ host: "localhost:3000", "x-forwarded-for": "127.0.0.1, 203.0.113.7" }))).toBe(false)
    expect(isLoopbackRequest(H({ host: "localhost", "x-real-ip": "10.1.2.3" }))).toBe(false)
    expect(isLoopbackRequest(H({ host: "localhost", forwarded: "for=198.51.100.4" }))).toBe(false)
  })

  it("reverse proxy ส่งต่อโดเมนจริงใน X-Forwarded-Host = ไม่ใช่การใช้งานบนเครื่องตัวเอง", () => {
    expect(isLoopbackRequest(H({ host: "127.0.0.1:3000", "x-forwarded-host": "tmp.example.com", "x-forwarded-for": "127.0.0.1" }))).toBe(false)
  })
})

describe("clientKey / isHttpsRequest", () => {
  it("กุญแจ rate limit = IP ขวาสุดของ XFF (ตัวที่ proxy ใกล้สุด/Next เติม)", () => {
    expect(clientKey(H({ "x-forwarded-for": "6.6.6.6, 10.0.0.9" }))).toBe("10.0.0.9")
    expect(clientKey(H({ "x-real-ip": "7.7.7.7" }))).toBe("7.7.7.7")
    expect(clientKey(H({}))).toBe("unknown")
  })

  it("https จาก X-Forwarded-Proto (ค่าแรก) หรือ URL", () => {
    expect(isHttpsRequest(H({ "x-forwarded-proto": "https" }))).toBe(true)
    expect(isHttpsRequest(H({ "x-forwarded-proto": "https, http" }))).toBe(true)
    expect(isHttpsRequest(H({ "x-forwarded-proto": "http" }), "https://x")).toBe(false)
    expect(isHttpsRequest(H({}), "https://tmp.example.com/api")).toBe(true)
    expect(isHttpsRequest(H({}), "http://localhost:3000/")).toBe(false)
    expect(isHttpsRequest(H({}))).toBe(false)
  })
})
