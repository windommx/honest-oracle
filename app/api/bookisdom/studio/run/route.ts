import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/server/session";
import {
  buildProviderRequest,
  parseProviderError,
  parseProviderResponse,
  validateRunInput,
} from "@/lib/bookisdom-engine/llm-provider";

// Bookisdom Studio BYO-key RELAY: forwards the caller's own provider key to the LLM
// per request. The key is NEVER stored or logged — it lives only in this
// request's memory. Zero platform token cost.
//
// This is the FALLBACK transport. The Studio page sends browser → provider directly by
// default (see app/bookisdom/_studio-direct.ts), so this server never sees the manuscript
// unless the writer explicitly chose the relay — e.g. because a provider's API rejected the
// browser's CORS preflight. Validation is shared with the direct path (validateRunInput).

export async function POST(request: NextRequest) {
  const { user, unavailable } = await getAuth();
  if (unavailable) return unavailable; // 503: server misconfigured — an honest status, not a crash
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Provider allow-list, endorsed-model allow-list, size cap, token clamp — one shared rule set.
  const v = validateRunInput(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: v.status });
  const { provider } = v.input;

  const req = buildProviderRequest(v.input);

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
