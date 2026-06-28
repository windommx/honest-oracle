// ╔══════════════════════════════════════════════════════════════════╗
// ║  Rush Studio — BYO-key LLM provider layer (pure request builders). ║
// ║  The platform never stores the key; the proxy route passes it      ║
// ║  through per request. These builders are pure & unit-testable.     ║
// ╚══════════════════════════════════════════════════════════════════╝

export type Provider = "anthropic" | "openai" | "gemini" | "groq";

export const PROVIDERS: { id: Provider; label: string; models: string[]; keyHint: string }[] = [
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    models: ["claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"],
    keyHint: "sk-ant-…",
  },
  {
    id: "openai",
    label: "OpenAI",
    models: ["gpt-4o", "gpt-4o-mini", "o3-mini"],
    keyHint: "sk-…",
  },
  {
    id: "gemini",
    label: "Google (Gemini)",
    models: ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
    keyHint: "AIza…",
  },
  {
    id: "groq",
    label: "Groq",
    models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"],
    keyHint: "gsk_…",
  },
];

/** Whether `x` is a supported provider id. */
export function isProvider(x: unknown): x is Provider {
  return typeof x === "string" && PROVIDERS.some((p) => p.id === x);
}

/** Whether (provider, model) is in the endorsed allowlist (PROVIDERS[].models). */
export function isEndorsedModel(provider: Provider, model: string): boolean {
  const p = PROVIDERS.find((x) => x.id === provider);
  return !!p && p.models.includes(model);
}

export interface RunInput {
  provider: Provider;
  model: string;
  apiKey: string;
  system?: string;
  prompt: string;
  maxTokens?: number;
}

export interface ProviderRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
}

/** Build the provider-specific HTTP request. Pure: no I/O, no key logging. */
export function buildProviderRequest(input: RunInput): ProviderRequest {
  const maxTokens = input.maxTokens ?? 4096;
  if (input.provider === "anthropic") {
    return {
      url: "https://api.anthropic.com/v1/messages",
      headers: {
        "x-api-key": input.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: input.model,
        max_tokens: maxTokens,
        ...(input.system ? { system: input.system } : {}),
        messages: [{ role: "user", content: input.prompt }],
      }),
    };
  }
  if (input.provider === "gemini") {
    // Google Generative Language API. Key goes in the query string (server-side only).
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${input.model}:generateContent?key=${encodeURIComponent(input.apiKey)}`,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...(input.system ? { systemInstruction: { parts: [{ text: input.system }] } } : {}),
        contents: [{ role: "user", parts: [{ text: input.prompt }] }],
        generationConfig: { maxOutputTokens: maxTokens },
      }),
    };
  }
  // openai + groq share the OpenAI Chat Completions shape
  const messages: { role: string; content: string }[] = [];
  if (input.system) messages.push({ role: "system", content: input.system });
  messages.push({ role: "user", content: input.prompt });
  const isGroq = input.provider === "groq";
  return {
    url: isGroq ? "https://api.groq.com/openai/v1/chat/completions" : "https://api.openai.com/v1/chat/completions",
    headers: {
      authorization: `Bearer ${input.apiKey}`,
      "content-type": "application/json",
    },
    // Groq uses max_tokens; OpenAI's newer param is max_completion_tokens.
    body: JSON.stringify({ model: input.model, ...(isGroq ? { max_tokens: maxTokens } : { max_completion_tokens: maxTokens }), messages }),
  };
}

/** Extract the completion text from a provider response payload. Pure. */
export function parseProviderResponse(provider: Provider, json: unknown): string {
  const j = json as Record<string, unknown>;
  if (provider === "anthropic") {
    const content = j.content as { type: string; text?: string }[] | undefined;
    return (content ?? [])
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text)
      .join("")
      .trim();
  }
  if (provider === "gemini") {
    const cands = j.candidates as { content?: { parts?: { text?: string }[] } }[] | undefined;
    return (cands?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? "")
      .join("")
      .trim();
  }
  // openai + groq
  const choices = j.choices as { message?: { content?: string } }[] | undefined;
  return (choices?.[0]?.message?.content ?? "").trim();
}

/** Pull a human-readable error message out of a provider error payload. Pure. */
export function parseProviderError(json: unknown): string | null {
  const err = (json as { error?: { message?: string } } | null)?.error;
  return err?.message ?? null;
}
