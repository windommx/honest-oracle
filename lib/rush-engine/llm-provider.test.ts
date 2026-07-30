import { describe, it, expect } from "vitest";
import { buildProviderRequest, parseProviderResponse, parseProviderError, isEndorsedModel, recommendProvider, PROVIDERS } from "./llm-provider";

describe("recommendProvider", () => {
  it("picks a huge-context provider when the task is large", () => {
    const r = recommendProvider({ contextChars: 600_000, priority: "balanced" });
    expect(r.provider).toBe("gemini"); // only Gemini's window fits comfortably
  });
  it("favors quality for premium and cheapness for cheap on small tasks", () => {
    expect(recommendProvider({ contextChars: 4000, priority: "premium" }).provider).toBe("anthropic");
    expect(["gemini", "groq"]).toContain(recommendProvider({ contextChars: 4000, priority: "cheap" }).provider);
  });
  it("respects the available list", () => {
    const r = recommendProvider({ contextChars: 4000, priority: "premium", available: ["groq", "gemini"] });
    expect(["groq", "gemini"]).toContain(r.provider);
  });
});

describe("isEndorsedModel", () => {
  it("accepts allowlisted models and rejects arbitrary ones", () => {
    expect(isEndorsedModel("anthropic", PROVIDERS[0].models[0])).toBe(true);
    expect(isEndorsedModel("anthropic", "claude-evil-preview")).toBe(false);
    expect(isEndorsedModel("openai", "gpt-4o")).toBe(true);
    expect(isEndorsedModel("openai", "../etc/passwd")).toBe(false);
  });
});

describe("buildProviderRequest", () => {
  it("builds an Anthropic messages request with the key in x-api-key (not logged elsewhere)", () => {
    const req = buildProviderRequest({ provider: "anthropic", model: "claude-opus-4-8", apiKey: "sk-ant-xyz", system: "be terse", prompt: "hi" });
    expect(req.url).toBe("https://api.anthropic.com/v1/messages");
    expect(req.headers["x-api-key"]).toBe("sk-ant-xyz");
    expect(req.headers["anthropic-version"]).toBeTruthy();
    const body = JSON.parse(req.body);
    expect(body.model).toBe("claude-opus-4-8");
    // System is a cache-marked block array: the stable prefix gets 0.1× pricing
    // on repeat runs (and the marker is a documented no-op below the minimum size).
    expect(body.system).toEqual([{ type: "text", text: "be terse", cache_control: { type: "ephemeral" } }]);
    expect(body.messages).toEqual([{ role: "user", content: "hi" }]);
  });

  it("builds an OpenAI chat request with a Bearer key and a system message", () => {
    const req = buildProviderRequest({ provider: "openai", model: "gpt-4o", apiKey: "sk-123", system: "sys", prompt: "yo" });
    expect(req.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(req.headers.authorization).toBe("Bearer sk-123");
    const body = JSON.parse(req.body);
    expect(body.messages[0]).toEqual({ role: "system", content: "sys" });
    expect(body.messages[1]).toEqual({ role: "user", content: "yo" });
  });

  it("builds a Gemini generateContent request with the key in the query string", () => {
    const req = buildProviderRequest({ provider: "gemini", model: "gemini-2.0-flash", apiKey: "AIza-xyz", system: "sys", prompt: "hi" });
    expect(req.url).toContain("generativelanguage.googleapis.com");
    expect(req.url).toContain("gemini-2.0-flash:generateContent");
    expect(req.url).toContain("key=AIza-xyz");
    const body = JSON.parse(req.body);
    expect(body.systemInstruction.parts[0].text).toBe("sys");
    expect(body.contents[0].parts[0].text).toBe("hi");
  });

  it("builds a Groq request (OpenAI-compatible) with max_tokens", () => {
    const req = buildProviderRequest({ provider: "groq", model: "llama-3.3-70b-versatile", apiKey: "gsk_1", prompt: "yo" });
    expect(req.url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(req.headers.authorization).toBe("Bearer gsk_1");
    const body = JSON.parse(req.body);
    expect(body.max_tokens).toBeGreaterThan(0);
    expect(body.messages[0]).toEqual({ role: "user", content: "yo" });
  });

  it("omits the system field when none is given", () => {
    const a = JSON.parse(buildProviderRequest({ provider: "anthropic", model: "m", apiKey: "k", prompt: "p" }).body);
    expect(a.system).toBeUndefined();
    const o = JSON.parse(buildProviderRequest({ provider: "openai", model: "m", apiKey: "k", prompt: "p" }).body);
    expect(o.messages).toHaveLength(1);
  });
});

describe("parseProviderResponse", () => {
  it("joins Anthropic text blocks", () => {
    expect(parseProviderResponse("anthropic", { content: [{ type: "text", text: "Hello " }, { type: "text", text: "world" }] })).toBe("Hello world");
  });
  it("reads the OpenAI message content", () => {
    expect(parseProviderResponse("openai", { choices: [{ message: { content: " done " } }] })).toBe("done");
  });
  it("reads Gemini candidate parts and Groq choices", () => {
    expect(parseProviderResponse("gemini", { candidates: [{ content: { parts: [{ text: "ge" }, { text: "mini" }] } }] })).toBe("gemini");
    expect(parseProviderResponse("groq", { choices: [{ message: { content: "fast" } }] })).toBe("fast");
  });
  it("returns empty string on a malformed payload", () => {
    expect(parseProviderResponse("anthropic", {})).toBe("");
    expect(parseProviderResponse("openai", {})).toBe("");
  });
});

describe("parseProviderError", () => {
  it("extracts a provider error message", () => {
    expect(parseProviderError({ error: { message: "invalid key" } })).toBe("invalid key");
    expect(parseProviderError({})).toBeNull();
  });
});

describe("PROVIDERS", () => {
  it("lists models for each provider", () => {
    expect(PROVIDERS.every((p) => p.models.length > 0)).toBe(true);
  });
});
