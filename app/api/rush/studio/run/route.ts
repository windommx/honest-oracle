import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/server/session";
import {
  buildProviderRequest,
  parseProviderError,
  parseProviderResponse,
  type Provider,
  type RunInput,
} from "@/lib/rush-engine/llm-provider";

// Rush Studio BYO-key proxy: forwards the caller's own provider key to the LLM
// per request. The key is NEVER stored or logged — it lives only in this
// request's memory. Zero platform token cost.

export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Partial<RunInput> & { provider?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const provider = body.provider as Provider;
  if (provider !== "anthropic" && provider !== "openai") {
    return NextResponse.json({ error: "Unsupported provider" }, { status: 400 });
  }
  if (!body.apiKey || !body.model || !body.prompt) {
    return NextResponse.json({ error: "Missing apiKey, model, or prompt" }, { status: 400 });
  }

  const req = buildProviderRequest({
    provider,
    model: body.model,
    apiKey: body.apiKey,
    system: body.system,
    prompt: body.prompt,
    maxTokens: body.maxTokens,
  });

  let res: Response;
  try {
    res = await fetch(req.url, { method: "POST", headers: req.headers, body: req.body });
  } catch {
    return NextResponse.json({ error: "Could not reach the provider" }, { status: 502 });
  }

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = parseProviderError(json) ?? `Provider error (${res.status})`;
    return NextResponse.json({ error: msg }, { status: res.status === 401 ? 401 : 502 });
  }

  const text = parseProviderResponse(provider, json);
  return NextResponse.json({ text });
}
