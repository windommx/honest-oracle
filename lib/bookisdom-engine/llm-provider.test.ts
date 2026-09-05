import { describe, it, expect } from "vitest";
import { buildProviderRequest, parseProviderResponse, parseProviderError, isEndorsedModel, recommendProvider, PROVIDERS, DIRECT_BROWSER, validateRunInput, RUN_LIMITS } from "./llm-provider";

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

describe("recommendProvider never returns undefined (audit fix)", () => {
  it("falls back to the full pool when available is empty or all-unknown", () => {
    // An empty/all-invalid `available` used to yield {provider: undefined}, which
    // buildProviderRequest silently treats as OpenAI — a non-OpenAI user's key to the
    // wrong host. Now a valid Provider is always returned (the type promises one).
    expect(recommendProvider({ contextChars: 1000, available: [] }).provider).toBeTruthy();
    expect(recommendProvider({ contextChars: 1000, available: ["nope" as never] }).provider).toBeTruthy();
    const p = recommendProvider({ contextChars: 1000, available: [] }).provider;
    expect(["anthropic", "openai", "gemini", "groq"]).toContain(p);
  });
});

describe("buildProviderRequest escapes the Gemini model in the URL (audit fix)", () => {
  it("a model with URL-special characters cannot break out of the path", () => {
    const r = buildProviderRequest({ provider: "gemini", model: "gemini?key=EVIL x", apiKey: "sk-REAL", prompt: "hi" });
    expect(r.url).not.toContain("gemini?key=EVIL"); // not an unescaped second query param
    expect(r.url).toContain("gemini%3Fkey%3DEVIL%20x");
    expect(r.url).toContain("key=sk-REAL"); // the real key is still the only real query param
  });
});

describe("DIRECT_BROWSER — measured CORS support, not assumed", () => {
  it("every provider has an entry with an as-of month and a note saying what was actually observed", () => {
    for (const p of PROVIDERS) {
      const d = DIRECT_BROWSER[p.id];
      expect(d, `no DIRECT_BROWSER entry for ${p.id}`).toBeTruthy();
      expect(d.asOf).toMatch(/^\d{4}-\d{2}$/);
      expect(d.note.length).toBeGreaterThan(20);
      expect(["verified", "unverified"]).toContain(d.cors);
    }
  });
  it("Anthropic is the one provider verified so far (preflight 200 + allow-origin * on 2026-09)", () => {
    expect(DIRECT_BROWSER.anthropic.cors).toBe("verified");
    // The unverified ones must SAY they are unverified — never quietly upgraded.
    for (const id of ["openai", "gemini", "groq"] as const) expect(DIRECT_BROWSER[id].cors).toBe("unverified");
  });
});

describe("buildProviderRequest — direct-browser header", () => {
  const base = { model: "claude-sonnet-4-6", apiKey: "k", prompt: "p" } as const;
  it("adds anthropic-dangerous-direct-browser-access ONLY when opted in", () => {
    const relay = buildProviderRequest({ ...base, provider: "anthropic" });
    expect(relay.headers["anthropic-dangerous-direct-browser-access"]).toBeUndefined();
    const direct = buildProviderRequest({ ...base, provider: "anthropic" }, { directBrowser: true });
    expect(direct.headers["anthropic-dangerous-direct-browser-access"]).toBe("true");
  });
  it("is a no-op for providers that need no extra header", () => {
    const r = buildProviderRequest({ ...base, provider: "openai", model: "gpt-4o" }, { directBrowser: true });
    expect(Object.keys(r.headers).some((h) => h.includes("browser"))).toBe(false);
  });
});

describe("validateRunInput — one rule set for both transports", () => {
  const ok = { provider: "anthropic", model: "claude-sonnet-4-6", apiKey: "k", prompt: "hello" };
  it("accepts a valid body and fills the default completion length", () => {
    const v = validateRunInput(ok);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.input.maxTokens).toBe(RUN_LIMITS.defaultMaxTokens);
  });
  it("rejects an unknown provider, missing fields, and an unendorsed model with 400", () => {
    expect(validateRunInput({ ...ok, provider: "mistral" })).toMatchObject({ ok: false, status: 400, error: "Unsupported provider" });
    expect(validateRunInput({ ...ok, apiKey: "" })).toMatchObject({ ok: false, status: 400 });
    expect(validateRunInput({ ...ok, model: "claude-99" })).toMatchObject({ ok: false, status: 400, error: "Unsupported model" });
    expect(validateRunInput(null)).toMatchObject({ ok: false, status: 400 });
  });
  it("caps input size at 413 and clamps maxTokens into [1, 8192]", () => {
    expect(validateRunInput({ ...ok, prompt: "x".repeat(RUN_LIMITS.maxInputChars + 1) })).toMatchObject({ ok: false, status: 413 });
    expect(validateRunInput({ ...ok, system: "x".repeat(RUN_LIMITS.maxInputChars + 1) })).toMatchObject({ ok: false, status: 413 });
    const hi = validateRunInput({ ...ok, maxTokens: 999_999 });
    const lo = validateRunInput({ ...ok, maxTokens: -5 });
    if (hi.ok) expect(hi.input.maxTokens).toBe(RUN_LIMITS.maxTokensCeil);
    if (lo.ok) expect(lo.input.maxTokens).toBe(RUN_LIMITS.maxTokensFloor);
  });
  it("normalises an empty system string to undefined so no empty system block is sent", () => {
    const v = validateRunInput({ ...ok, system: "" });
    if (v.ok) expect(v.input.system).toBeUndefined();
  });
});
