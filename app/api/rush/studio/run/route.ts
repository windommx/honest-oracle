import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/server/session";
import {
  buildProviderRequest,
  isEndorsedModel,
  isProvider,
  parseProviderError,
  parseProviderResponse,
  type Provider,
  type RunInput,
} from "@/lib/rush-engine/llm-provider";

// Rush Studio BYO-key proxy: forwards the caller's own provider key to the LLM
// per request. The key is NEVER stored or logged — it lives only in this
// request's memory. Zero platform token cost.

export async function POST(request: NextRequest) {
  const { user, unavailable } = await getAuth();
  if (unavailable) return unavailable; // 503: server misconfigured — an honest status, not a crash
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Partial<RunInput> & { provider?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const provider = body.provider as Provider;
  if (!isProvider(provider)) {
    return NextResponse.json({ error: "Unsupported provider" }, { status: 400 });
  }
  if (!body.apiKey || !body.model || !body.prompt) {
    return NextResponse.json({ error: "Missing apiKey, model, or prompt" }, { status: 400 });
  }
  // Only relay endorsed models — don't forward arbitrary model strings upstream.
  if (!isEndorsedModel(provider, body.model)) {
    return NextResponse.json({ error: "Unsupported model" }, { status: 400 });
  }

  // Abuse guard: cap the request size and the requested completion length.
  const MAX_INPUT = 200_000; // chars
  if (body.prompt.length > MAX_INPUT || (body.system?.length ?? 0) > MAX_INPUT) {
    return NextResponse.json({ error: "Prompt or system text too large" }, { status: 413 });
  }
  const maxTokens = Math.min(Math.max(Number(body.maxTokens) || 4096, 1), 8192);

  const req = buildProviderRequest({
    provider,
    model: body.model,
    apiKey: body.apiKey,
    system: body.system,
    prompt: body.prompt,
    maxTokens,
  });

  // Time-bound the upstream call so a slow provider can't hang the request.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  let res: Response;
  try {
    res = await fetch(req.url, { method: "POST", headers: req.headers, body: req.body, signal: controller.signal });
  } catch (e) {
    const aborted = e instanceof DOMException && e.name === "AbortError";
    return NextResponse.json({ error: aborted ? "Provider timed out" : "Could not reach the provider" }, { status: aborted ? 504 : 502 });
  } finally {
    clearTimeout(timeout);
  }

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = parseProviderError(json) ?? `Provider error (${res.status})`;
    return NextResponse.json({ error: msg }, { status: res.status === 401 ? 401 : 502 });
  }

  const text = parseProviderResponse(provider, json);
  return NextResponse.json({ text });
}
