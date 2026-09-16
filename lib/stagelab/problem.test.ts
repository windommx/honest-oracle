import { describe, it, expect, vi, afterEach } from "vitest";
import { MAX_BODY_BYTES, fail, guarded, internalError, tooLargeIfDeclared } from "./problem";
import { StageInputError, isStageInputError } from "./domain-error";

afterEach(() => vi.restoreAllMocks());

describe("error envelope", () => {
  it("maps each code to the status a client can branch on", async () => {
    const cases: [Parameters<typeof fail>[0], number][] = [
      ["unauthenticated", 401],
      ["forbidden", 403],
      ["not_found", 404],
      ["invalid_request", 400],
      ["upgrade_required", 402],
      ["limit_reached", 402],
      ["quota_exhausted", 429],
      ["conflict", 409],
      ["payload_too_large", 413],
      ["internal", 500],
    ];
    for (const [code, status] of cases) {
      const res = fail(code, "ทดสอบ");
      expect(res.status, code).toBe(status);
      expect((await res.json()).code).toBe(code);
    }
  });

  it("carries a request id in both the body and the header", async () => {
    const res = fail("not_found", "ไม่พบ");
    const body = await res.json();
    expect(body.requestId).toMatch(/^[0-9a-f]{8}$/);
    expect(res.headers.get("x-request-id")).toBe(body.requestId);
  });

  it("merges detail so a plan gate can say which feature and which plan", async () => {
    const body = await fail("upgrade_required", "อัปเกรด", { feature: "quant", plan: "free" }).json();
    expect(body.feature).toBe("quant");
    expect(body.plan).toBe("free");
  });
});

describe("internalError", () => {
  it("logs the cause but never returns it", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const secret = 'relation "stage_position" violates constraint at host db-prod-1';

    const res = internalError("positions.PUT", new Error(secret));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(JSON.stringify(body)).not.toContain(secret);
    expect(JSON.stringify(body)).not.toContain("db-prod-1");
    // …and the operator can still find it, by the id the customer was given.
    // The log line is JSON, so it is parsed rather than substring-matched —
    // stringify escapes the quotes inside the message.
    const entry = JSON.parse(logged.mock.calls[0][0] as string);
    expect(entry.message).toBe(secret);
    expect(entry.requestId).toBe(body.requestId);
    expect(entry.where).toBe("positions.PUT");
    expect(entry.level).toBe("error");
  });

  it("survives a thrown non-Error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = internalError("somewhere", "just a string");
    expect(res.status).toBe(500);
    expect((await res.json()).code).toBe("internal");
  });
});

describe("guarded", () => {
  it("passes a successful response straight through", async () => {
    const handler = guarded("test", async () => fail("not_found", "ไม่พบ"));
    expect((await handler()).status).toBe(404);
  });

  it("turns an unexpected throw into a logged 500", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = guarded("test.GET", async () => {
      throw new Error("prisma exploded");
    });
    const res = await handler();
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("prisma exploded");
    expect(logged).toHaveBeenCalled();
  });
});

describe("body size limit", () => {
  const req = (bytes: number | null) =>
    new Request("https://example.test/api", {
      method: "POST",
      headers: bytes === null ? {} : { "content-length": String(bytes) },
    });

  it("rejects a declared body over the ceiling", async () => {
    const res = tooLargeIfDeclared(req(MAX_BODY_BYTES + 1));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(413);
  });

  it("allows a body at the ceiling and below", () => {
    expect(tooLargeIfDeclared(req(MAX_BODY_BYTES))).toBeNull();
    expect(tooLargeIfDeclared(req(10))).toBeNull();
  });

  it("does not block a request that declares no length", () => {
    expect(tooLargeIfDeclared(req(null))).toBeNull();
  });
});

describe("domain errors", () => {
  it("separates a message written for a user from one written by a database", () => {
    expect(isStageInputError(new StageInputError("ต้องมีอย่างน้อย 5 เทรด"))).toBe(true);
    expect(isStageInputError(new Error("column does not exist"))).toBe(false);
    expect(isStageInputError("not even an error")).toBe(false);
  });
});
