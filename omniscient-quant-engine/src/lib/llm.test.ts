import { describe, expect, test } from "bun:test"
import {
  chatCompletion, describeLlmProvider, extractJsonObject, LlmRequestError, LlmUnavailableError, llmErrorResponse, readLlmConfig,
} from "./llm"

const none = () => false

describe("llm — การเลือกผู้ให้บริการจาก env", () => {
  test("ไม่ตั้งอะไรเลย + ไม่มี .z-ai-config → provider null (ปุ่ม AI ตอบ 503)", () => {
    const cfg = readLlmConfig({}, { exists: none })
    expect(cfg.provider).toBeNull()
    expect(cfg.mode).toBe("auto")
    expect(cfg.warnings).toEqual([])
  })

  test("OpenAI-compatible: ต้องมีทั้ง key และ model · base URL ค่าเริ่มต้น OpenAI · ตัด / ท้าย", () => {
    const half = readLlmConfig({ OQE_LLM_API_KEY: "k" }, { exists: none })
    expect(half.provider).toBeNull()
    expect(half.warnings.join(" ")).toContain("ต้องตั้งทั้งคู่")
    const full = readLlmConfig({ OQE_LLM_API_KEY: "k", OQE_LLM_MODEL: "m", OQE_LLM_BASE_URL: "https://llm.example/v1/" }, { exists: none })
    expect(full.provider).toBe("openai")
    expect(full.openai).toEqual({ apiKey: "k", model: "m", baseUrl: "https://llm.example/v1" })
    const dflt = readLlmConfig({ OQE_LLM_API_KEY: "k", OQE_LLM_MODEL: "m" }, { exists: none })
    expect(dflt.openai?.baseUrl).toBe("https://api.openai.com/v1")
    const bad = readLlmConfig({ OQE_LLM_API_KEY: "k", OQE_LLM_MODEL: "m", OQE_LLM_BASE_URL: "ftp://x" }, { exists: none })
    expect(bad.provider).toBeNull()
  })

  test("auto: openai มาก่อน z-ai · zai เมื่อพบ .z-ai-config · none ปิดทุกอย่าง · โหมดบังคับที่ตั้งค่าไม่ครบ = null + คำเตือน", () => {
    const zaiExists = (p: string) => p.endsWith("/.z-ai-config")
    expect(readLlmConfig({}, { exists: zaiExists }).provider).toBe("zai")
    expect(readLlmConfig({ OQE_LLM_API_KEY: "k", OQE_LLM_MODEL: "m" }, { exists: zaiExists }).provider).toBe("openai")
    expect(readLlmConfig({ OQE_LLM_PROVIDER: "zai", OQE_LLM_API_KEY: "k", OQE_LLM_MODEL: "m" }, { exists: zaiExists }).provider).toBe("zai")
    expect(readLlmConfig({ OQE_LLM_PROVIDER: "none", OQE_LLM_API_KEY: "k", OQE_LLM_MODEL: "m" }, { exists: zaiExists }).provider).toBeNull()
    const forced = readLlmConfig({ OQE_LLM_PROVIDER: "openai" }, { exists: zaiExists })
    expect(forced.provider).toBeNull()
    expect(forced.warnings.length).toBeGreaterThan(0)
    const unknown = readLlmConfig({ OQE_LLM_PROVIDER: "gemini" }, { exists: none })
    expect(unknown.mode).toBe("auto")
    expect(unknown.warnings[0]).toContain("ไม่รู้จัก")
  })

  test("timeout: ค่าเริ่มต้น 90000 · ค่าผิด/ต่ำกว่า 1000 → ค่าเริ่มต้น", () => {
    expect(readLlmConfig({}, { exists: none }).timeoutMs).toBe(90_000)
    expect(readLlmConfig({ OQE_LLM_TIMEOUT_MS: "5000" }, { exists: none }).timeoutMs).toBe(5000)
    expect(readLlmConfig({ OQE_LLM_TIMEOUT_MS: "abc" }, { exists: none }).timeoutMs).toBe(90_000)
    expect(readLlmConfig({ OQE_LLM_TIMEOUT_MS: "10" }, { exists: none }).timeoutMs).toBe(90_000)
  })

  test("describeLlmProvider ไม่เปิดเผยคีย์", () => {
    const d = describeLlmProvider({ OQE_LLM_API_KEY: "sk-secret", OQE_LLM_MODEL: "m" })
    expect(d.configured).toBe(true)
    expect(JSON.stringify(d)).not.toContain("sk-secret")
  })
})

describe("llm — chatCompletion", () => {
  test("ไม่มีผู้ให้บริการ → LlmUnavailableError → route ตอบ 503 พร้อมวิธีตั้งค่า", async () => {
    let err: unknown = null
    try {
      await chatCompletion([{ role: "user", content: "hi" }], {}, { env: { OQE_LLM_PROVIDER: "none" } })
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(LlmUnavailableError)
    const r = llmErrorResponse(err)!
    expect(r.status).toBe(503)
    expect(r.body.error).toBe("llm_unavailable")
    expect(r.body.detail).toContain("OQE_LLM_API_KEY")
  })

  test("OpenAI-compatible: ส่ง model/messages/Bearer ไปที่ {base}/chat/completions และคืน content", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = []
    const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} })
      return new Response(JSON.stringify({ choices: [{ message: { content: "สวัสดี" } }] }), { status: 200 })
    }) as unknown as typeof fetch
    const out = await chatCompletion(
      [{ role: "system", content: "sys" }, { role: "user", content: "q" }],
      { temperature: 0.2 },
      { env: { OQE_LLM_API_KEY: "sk-test", OQE_LLM_MODEL: "my-model", OQE_LLM_BASE_URL: "https://llm.example/v1" }, fetch: fakeFetch },
    )
    expect(out).toEqual({ text: "สวัสดี", provider: "openai" })
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe("https://llm.example/v1/chat/completions")
    const headers = calls[0].init.headers as Record<string, string>
    expect(headers.Authorization).toBe("Bearer sk-test")
    const body = JSON.parse(String(calls[0].init.body))
    expect(body.model).toBe("my-model")
    expect(body.temperature).toBe(0.2)
    expect(body.messages[0]).toEqual({ role: "system", content: "sys" })
  })

  test("ผู้ให้บริการตอบ error → LlmRequestError (502) และไม่มีคีย์ในข้อความ", async () => {
    const fakeFetch = (async () => new Response("rate limited sk-test", { status: 429 })) as unknown as typeof fetch
    let err: unknown = null
    try {
      await chatCompletion([{ role: "user", content: "q" }], {}, { env: { OQE_LLM_API_KEY: "sk-test", OQE_LLM_MODEL: "m" }, fetch: fakeFetch })
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(LlmRequestError)
    expect((err as LlmRequestError).upstreamStatus).toBe(429)
    expect(llmErrorResponse(err)!.status).toBe(502)
    expect(llmErrorResponse(new Error("x"))).toBeNull()
  })

  test("z-ai: system → assistant (พฤติกรรมเดิมของต้นฉบับ) และ thinking disabled", async () => {
    const seen: unknown[] = []
    const fakeZai = {
      chat: { completions: { create: async (body: unknown) => { seen.push(body); return { choices: [{ message: { content: "ok" } }] } } } },
    }
    const config = readLlmConfig({ OQE_LLM_PROVIDER: "zai" }, { exists: (p) => p.endsWith("/.z-ai-config") })
    expect(config.provider).toBe("zai")
    const out = await chatCompletion(
      [{ role: "system", content: "sys" }, { role: "user", content: "q" }],
      {},
      { config, createZai: async () => fakeZai },
    )
    expect(out).toEqual({ text: "ok", provider: "zai" })
    const body = seen[0] as { messages: Array<{ role: string; content: string }>; thinking: { type: string } }
    expect(body.messages.map((m) => m.role)).toEqual(["assistant", "user"])
    expect(body.thinking.type).toBe("disabled")
  })

  test("z-ai: SDK สร้างไม่ได้ (ไม่มี config จริง) → LlmUnavailableError", async () => {
    const config = readLlmConfig({ OQE_LLM_PROVIDER: "zai" }, { exists: () => true })
    let err: unknown = null
    try {
      await chatCompletion([{ role: "user", content: "q" }], {}, { config, createZai: async () => { throw new Error("Configuration file not found") } })
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(LlmUnavailableError)
    expect((err as Error).message).toContain("z-ai-web-dev-sdk")
  })
})

describe("llm — extractJsonObject", () => {
  test("JSON ตรง ๆ / ใน code fence / มีข้อความห่อ → object · ไม่ใช่ JSON → throw", () => {
    expect(extractJsonObject('{"a":1}')).toEqual({ a: 1 })
    expect(extractJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 })
    expect(extractJsonObject('นี่คือคำตอบ: {"headline":"x","risks":["r1"]} ขอบคุณ')).toEqual({ headline: "x", risks: ["r1"] })
    expect(() => extractJsonObject("no json here")).toThrow()
    expect(() => extractJsonObject("[1,2]")).toThrow()
  })
})
