// Bookisdom Studio — DIRECT transport: browser → provider, with the writer's own key.
//
// Why this exists: the relay route (/api/bookisdom/studio/run) forwards the manuscript
// through Bookisdom's server. Even with the key never stored, the text passes through a
// machine we run — a weaker privacy claim than "your text never leaves your browser
// except to the provider you chose". This module makes that stronger claim true for
// providers whose API accepts a browser's CORS preflight (DIRECT_BROWSER in llm-provider).
//
// Honesty rules:
//  · a browser cannot tell a CORS rejection from a dead network — both surface as a
//    TypeError from fetch() — so the failure is reported as "blocked" with BOTH causes
//    named, and the relay is offered as an explicit choice, never taken silently;
//  · the key never appears in any message returned from here;
//  · the same validateRunInput gate as the server runs first, so the direct path cannot
//    reach a model or size the relay would refuse.

import {
  buildProviderRequest, parseProviderError, parseProviderResponse, validateRunInput, type RunInput,
} from "@/lib/bookisdom-engine/llm-provider";

export type DirectResult =
  | { ok: true; text: string }
  | { ok: false; kind: "invalid" | "blocked" | "auth" | "provider" | "timeout"; message: string; status?: number };

export const DIRECT_TIMEOUT_MS = 120_000;

export async function runDirect(
  raw: Partial<RunInput>,
  deps: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}
): Promise<DirectResult> {
  const v = validateRunInput(raw);
  if (!v.ok) return { ok: false, kind: "invalid", message: v.error, status: v.status };
  const fetchImpl = deps.fetchImpl ?? fetch;
  const req = buildProviderRequest(v.input, { directBrowser: true });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? DIRECT_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetchImpl(req.url, { method: "POST", headers: req.headers, body: req.body, signal: controller.signal });
  } catch (e) {
    const aborted = (e as { name?: string })?.name === "AbortError";
    if (aborted) return { ok: false, kind: "timeout", message: "ผู้ให้บริการไม่ตอบภายในเวลา" };
    return {
      ok: false, kind: "blocked",
      message: "เบราว์เซอร์ส่งตรงไม่สำเร็จ — อาจเป็นเพราะผู้ให้บริการนี้ไม่รับคำขอตรงจากเบราว์เซอร์ (CORS) หรือเครือข่ายขัดข้อง (เบราว์เซอร์แยกสองกรณีนี้ไม่ได้)",
    };
  } finally {
    clearTimeout(timer);
  }

  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = parseProviderError(json) ?? `Provider error (${res.status})`;
    return { ok: false, kind: res.status === 401 ? "auth" : "provider", message: msg, status: res.status };
  }
  return { ok: true, text: parseProviderResponse(v.input.provider, json) };
}
