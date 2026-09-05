// ╔══════════════════════════════════════════════════════════════════╗
// ║  Bookisdom Studio — BYO-key LLM provider layer (pure request builders). ║
// ║  The platform never stores the key. Two transports share these     ║
// ║  builders: DIRECT (browser → provider, our server sees nothing)    ║
// ║  and RELAY (browser → our route → provider, an explicit fallback). ║
// ║  Both apply validateRunInput, so the limits cannot drift apart.    ║
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

// Static provider profiles from published specs (NOT live telemetry — this is
// honest guidance, not a real-time bandit). cost: 0=cheap..1=pricey; quality/
// speed: 0..1; contextChars ≈ max context window in characters (~4 chars/token).
export const PROVIDER_PROFILE: Record<Provider, { quality: number; cost: number; speed: number; contextChars: number }> = {
  anthropic: { quality: 0.95, cost: 0.5, speed: 0.6, contextChars: 200_000 * 4 },
  openai: { quality: 0.92, cost: 0.6, speed: 0.6, contextChars: 128_000 * 4 },
  gemini: { quality: 0.82, cost: 0.1, speed: 0.8, contextChars: 1_000_000 * 4 },
  groq: { quality: 0.78, cost: 0.2, speed: 0.98, contextChars: 32_000 * 4 },
};

export type Priority = "cheap" | "balanced" | "premium";

/** Deterministic provider recommendation from static specs + the task's context
 *  size and the user's priority. Returns the best fit + a short reason. This is
 *  guidance, not a live load-balancer (we have no per-provider telemetry). */
export function recommendProvider(opts: { contextChars: number; priority?: Priority; available?: Provider[] }): { provider: Provider; reason: string } {
  const priority = opts.priority ?? "balanced";
  const requested = (opts.available ?? PROVIDERS.map((p) => p.id)).filter((p) => PROVIDER_PROFILE[p]);
  // An explicit `available` that filters to nothing (empty, or all-unknown ids) would leave
  // no candidate and return provider:undefined — which buildProviderRequest silently treats
  // as OpenAI, shipping a non-OpenAI user's key to the wrong host. Fall back to the full
  // pool so a valid Provider is ALWAYS returned (the type promises one).
  const pool = requested.length ? requested : PROVIDERS.map((p) => p.id);
  const WEIGHTS: Record<Priority, { q: number; c: number; s: number }> = {
    cheap: { q: 0.2, c: 0.5, s: 0.3 },
    balanced: { q: 0.4, c: 0.3, s: 0.3 },
    premium: { q: 0.7, c: 0.1, s: 0.2 },
  };
  const W = WEIGHTS[priority];
  // Prefer providers whose context window comfortably fits the task.
  const fits = pool.filter((p) => opts.contextChars <= PROVIDER_PROFILE[p].contextChars * 0.8);
  const candidates = fits.length ? fits : pool.slice().sort((a, b) => PROVIDER_PROFILE[b].contextChars - PROVIDER_PROFILE[a].contextChars).slice(0, 1);
  let best = candidates[0];
  let bestScore = -1;
  for (const p of candidates) {
    const m = PROVIDER_PROFILE[p];
    const score = m.quality * W.q + (1 - m.cost) * W.c + m.speed * W.s;
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  const m = PROVIDER_PROFILE[best];
  const reason = !fits.length
    ? `largest context window fits the ${Math.round(opts.contextChars / 4)}-token task`
    : `best ${priority} fit (quality ${m.quality}, cost ${m.cost}, speed ${m.speed})`;
  return { provider: best, reason };
}

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

/** Hard limits every Studio run obeys, on either transport. */
export const RUN_LIMITS = { maxInputChars: 200_000, maxTokensFloor: 1, maxTokensCeil: 8192, defaultMaxTokens: 4096 } as const;

export type RunValidation = { ok: true; input: RunInput } | { ok: false; error: string; status: number };

/** The ONE set of rules for a Studio run: supported provider, endorsed model, required
 *  fields, input-size cap, completion-length clamp. The relay route and the direct-browser
 *  path both call this, so a limit cannot be enforced on one transport and forgotten on
 *  the other. Pure; never logs the key. */
export function validateRunInput(body: unknown): RunValidation {
  const b = (body ?? {}) as Partial<RunInput> & { provider?: unknown };
  if (!isProvider(b.provider)) return { ok: false, error: "Unsupported provider", status: 400 };
  if (!b.apiKey || !b.model || !b.prompt) return { ok: false, error: "Missing apiKey, model, or prompt", status: 400 };
  if (!isEndorsedModel(b.provider, b.model)) return { ok: false, error: "Unsupported model", status: 400 };
  if (b.prompt.length > RUN_LIMITS.maxInputChars || (b.system?.length ?? 0) > RUN_LIMITS.maxInputChars) {
    return { ok: false, error: "Prompt or system text too large", status: 413 };
  }
  const maxTokens = Math.min(Math.max(Number(b.maxTokens) || RUN_LIMITS.defaultMaxTokens, RUN_LIMITS.maxTokensFloor), RUN_LIMITS.maxTokensCeil);
  return { ok: true, input: { provider: b.provider, model: b.model, apiKey: b.apiKey, system: b.system || undefined, prompt: b.prompt, maxTokens } };
}

export interface ProviderRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
}

/** Whether a provider's API answers a browser's CORS preflight, so the manuscript can go
 *  browser → provider WITHOUT passing through Bookisdom's server. "verified" means WE sent
 *  an OPTIONS preflight and read the Access-Control-Allow-* headers back on the date given;
 *  "unverified" means we could not (the measuring environment's egress gateway refused the
 *  CONNECT, or the preflight came back 403 through that network) — the toggle still exists
 *  for those providers, labelled as untested, and a failure is reported, never hidden. */
export const DIRECT_BROWSER: Record<Provider, { cors: "verified" | "unverified"; asOf: string; note: string }> = {
  anthropic: {
    cors: "verified", asOf: "2026-09",
    note: "OPTIONS /v1/messages → 200, access-control-allow-origin: *, and the anthropic-dangerous-direct-browser-access header is in the allow-list",
  },
  openai: { cors: "unverified", asOf: "2026-09", note: "preflight could not be sent — egress gateway answered 403 to CONNECT api.openai.com; the vendor SDK's dangerouslyAllowBrowser flag suggests the API accepts browser origins, but that is not our measurement" },
  groq: { cors: "unverified", asOf: "2026-09", note: "preflight could not be sent — egress gateway answered 403 to CONNECT api.groq.com" },
  gemini: { cors: "unverified", asOf: "2026-09", note: "OPTIONS generateContent answered 403 with no Access-Control headers through the measuring network — inconclusive" },
};

/** Build the provider-specific HTTP request. Pure: no I/O, no key logging.
 *  `directBrowser` adds the header Anthropic requires before it will honour a request
 *  that carries an API key from a browser origin (it exists so a developer opts in
 *  knowingly). Other providers need no extra header; the flag is a no-op for them. */
export function buildProviderRequest(input: RunInput, opts: { directBrowser?: boolean } = {}): ProviderRequest {
  const maxTokens = input.maxTokens ?? 4096;
  if (input.provider === "anthropic") {
    return {
      url: "https://api.anthropic.com/v1/messages",
      headers: {
        "x-api-key": input.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
        ...(opts.directBrowser ? { "anthropic-dangerous-direct-browser-access": "true" } : {}),
      },
      body: JSON.stringify({
        model: input.model,
        max_tokens: maxTokens,
        // The system prompt (master + codex digest) is the stable, byte-identical
        // prefix across a book's chapter runs — mark it cacheable so repeat runs
        // pay 0.1× input on it (write costs 1.25×; below the model's minimum
        // cacheable size the marker is a documented no-op, so this is safe for
        // short prompts too). Anthropic prompt-caching docs, fetched 2026-07.
        ...(input.system
          ? { system: [{ type: "text", text: input.system, cache_control: { type: "ephemeral" } }] }
          : {}),
        messages: [{ role: "user", content: input.prompt }],
      }),
    };
  }
  if (input.provider === "gemini") {
    // Google Generative Language API. Key goes in the query string (server-side only).
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.model)}:generateContent?key=${encodeURIComponent(input.apiKey)}`,
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
