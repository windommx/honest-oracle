import { describe, expect, test } from "bun:test"
import { checkResponse, DEFAULT_ROUTES, findNonFinite } from "./smoke"

describe("deploy/smoke — ตัวตรวจคำตอบ (pure)", () => {
  test("findNonFinite จับ Infinity/NaN ทั้งตัวเลขและสตริง", () => {
    expect(findNonFinite({ a: 1, b: [2, Infinity], c: { d: "x NaN y" } })).toEqual(["$.b[1] = Infinity", '$.c.d = "x NaN y"'])
    expect(findNonFinite({ a: "Nancy", b: "Infinityx" })).toEqual([]) // คำที่มีตัวอักษรติด ไม่ใช่ค่าเลขพัง
  })
  test("checkResponse: status ต้องตรง, /api ต้องเป็น JSON, 503 ต้องเป็น llm_unavailable", () => {
    expect(checkResponse({ route: "/api/board" }, 200, "application/json", '{"x":1}')).toBeUndefined()
    expect(checkResponse({ route: "/api/board" }, 500, "application/json", "{}")).toContain("HTTP 500")
    expect(checkResponse({ route: "/api/board" }, 200, "text/html", "<html>")).toContain("content-type")
    // เส้นทางที่ตอบเป็นไฟล์: ตรวจ content-type ที่ประกาศ + body ไม่ว่าง แทน JSON
    expect(checkResponse({ route: "/api/x", contentType: "text/markdown" }, 200, "text/markdown; charset=utf-8", "# ok")).toBeUndefined()
    expect(checkResponse({ route: "/api/x", contentType: "text/markdown" }, 200, "application/json", "{}")).toContain("text/markdown")
    expect(checkResponse({ route: "/api/x", contentType: "text/markdown" }, 200, "text/markdown", "  ")).toBe("body ว่าง")
    expect(checkResponse({ route: "/api/board" }, 200, "application/json", '{"x":NaN}')).toContain("JSON ไม่ถูกต้อง")
    expect(checkResponse({ route: "/api/board" }, 200, "application/json", '{"x":1e999}')).toContain("ค่าที่ไม่จำกัด")
    expect(checkResponse({ route: "/api/audit", method: "POST", status: 503 }, 503, "application/json", '{"error":"llm_unavailable","detail":"ตั้งค่า"}')).toBeUndefined()
    expect(checkResponse({ route: "/api/audit", method: "POST", status: 503 }, 503, "application/json", '{"error":"x"}')).toContain("llm_unavailable")
    expect(checkResponse({ route: "/" }, 200, "text/html", "<html>")).toBeUndefined()
    expect(checkResponse({ route: "/" }, 200, "text/html", "")).toBe("body ว่าง")
  })
  test("รายการ route เริ่มต้นครอบคลุมทุก GET route ของแอป + หน้าเว็บ + POST ที่ต้อง 503", () => {
    const gets = DEFAULT_ROUTES.filter((r) => !r.method || r.method === "GET").map((r) => r.route.split("?")[0])
    for (const p of ["/api/health", "/api/system", "/api/board", "/api/decision/TSE", "/api/analytics/factors", "/api/analytics/dependence", "/api/backtest", "/api/journal", "/api/audit", "/api/synthesis/TSE", "/api/meta-risk/TSE", "/api/apex/TSE", "/api/market/quotes", "/api/market/series/TSE", "/api/analyst/TSE", "/api/flows", "/api/rhythm", "/api/atlas", "/api/winrate", "/api/walkforward", "/api/walkforward/export", "/api/workflow", "/api/research/deep/TSE", "/"]) {
      expect(gets).toContain(p)
    }
    // ทุกเส้นทางที่เรียก LLM: analyst · synthesis · audit · deep research
    expect(DEFAULT_ROUTES.filter((r) => r.method === "POST" && r.status === 503).map((r) => r.route.split("/")[2])).toEqual(["analyst", "synthesis", "audit", "research"])
  })
})
