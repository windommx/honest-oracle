import { describe, it, expect } from "vitest";
import { buildProviderRequest, parseProviderResponse, parseProviderError, isEndorsedModel, PROVIDERS } from "./llm-provider";

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
    expect(body.system).toBe("be terse");
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
