import { describe, it, expect } from "vitest";
import { runDirect } from "./_studio-direct";

const KEY = "sk-ant-SECRET-never-in-output";
const base = { provider: "anthropic" as const, model: "claude-sonnet-4-6", apiKey: KEY, prompt: "เขียนบทที่ 1" };

function fakeFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response> | never): typeof fetch {
  return ((url: string, init: RequestInit) => Promise.resolve().then(() => handler(url, init))) as unknown as typeof fetch;
}
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("runDirect — browser → provider with the writer's own key", () => {
  it("sends the request to the provider host itself, never to a Bookisdom route", async () => {
    let seen = { url: "", headers: {} as Record<string, string> };
    const f = fakeFetch((url, init) => { seen = { url, headers: init.headers as Record<string, string> }; return json(200, { content: [{ type: "text", text: "บทที่ 1" }] }); });
    const r = await runDirect(base, { fetchImpl: f });
    expect(r).toEqual({ ok: true, text: "บทที่ 1" });
    expect(seen.url).toBe("https://api.anthropic.com/v1/messages");
    expect(seen.url).not.toContain("/api/bookisdom");
    // The header Anthropic requires before honouring a browser-origin request.
    expect(seen.headers["anthropic-dangerous-direct-browser-access"]).toBe("true");
    expect(seen.headers["x-api-key"]).toBe(KEY);
  });

  it("applies the SAME validation as the relay route — an unendorsed model never reaches the provider", async () => {
    let called = false;
    const f = fakeFetch(() => { called = true; return json(200, {}); });
    const r = await runDirect({ ...base, model: "claude-99-ultra" }, { fetchImpl: f });
    expect(r).toMatchObject({ ok: false, kind: "invalid", status: 400 });
    expect(called).toBe(false);
  });

  it("a fetch TypeError (what a CORS rejection looks like from inside a browser) is reported as BLOCKED, naming both possible causes", async () => {
    const f = fakeFetch(() => { throw new TypeError("Failed to fetch"); });
    const r = await runDirect(base, { fetchImpl: f });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.kind).toBe("blocked");
    expect(r.message).toContain("CORS");
    expect(r.message).toContain("เครือข่าย");
  });

  it("a 401 from the provider is an AUTH failure (bad key), distinct from a provider fault", async () => {
    const f = fakeFetch(() => json(401, { error: { message: "invalid x-api-key" } }));
    const r = await runDirect(base, { fetchImpl: f });
    expect(r).toMatchObject({ ok: false, kind: "auth", status: 401, message: "invalid x-api-key" });
  });

  it("a provider error surfaces the provider's own message; an opaque one gets the status", async () => {
    const f1 = fakeFetch(() => json(529, { error: { message: "Overloaded" } }));
    expect(await runDirect(base, { fetchImpl: f1 })).toMatchObject({ ok: false, kind: "provider", message: "Overloaded" });
    const f2 = fakeFetch(() => new Response("<html>bad gateway</html>", { status: 502 }));
    expect(await runDirect(base, { fetchImpl: f2 })).toMatchObject({ ok: false, kind: "provider", message: "Provider error (502)" });
  });

  it("times out instead of hanging, and reports it as a timeout", async () => {
    const f = fakeFetch((_u, init) => new Promise((_res, rej) => {
      init.signal?.addEventListener("abort", () => { const e = new Error("aborted"); e.name = "AbortError"; rej(e); });
    }) as Promise<Response>);
    const r = await runDirect(base, { fetchImpl: f, timeoutMs: 5 });
    expect(r).toMatchObject({ ok: false, kind: "timeout" });
  });

  it("the API key never appears in any returned message, whatever fails", async () => {
    const cases = [
      fakeFetch(() => { throw new TypeError(`Failed to fetch with ${KEY}`); }),
      fakeFetch(() => json(500, { error: { message: "boom" } })),
      fakeFetch(() => json(401, {})),
    ];
    for (const f of cases) {
      const r = await runDirect(base, { fetchImpl: f });
      expect(JSON.stringify(r)).not.toContain(KEY);
    }
  });
});
