import { describe, it, expect } from "vitest";
import { safeCallbackUrl } from "./auth-redirect";

const ORIGIN = "https://app.example";

describe("safeCallbackUrl", () => {
  it("falls back to /history when nothing was asked for", () => {
    expect(safeCallbackUrl("", ORIGIN)).toBe("/history");
    expect(safeCallbackUrl("?foo=bar", ORIGIN)).toBe("/history");
  });

  it("honours a relative path — the middleware's own redirect target", () => {
    expect(safeCallbackUrl("?callbackUrl=%2Fcompetency", ORIGIN)).toBe("/competency");
    expect(safeCallbackUrl("?callbackUrl=%2Fcompetency%2Freport%2Fn1%3Fa%3Da1", ORIGIN)).toBe("/competency/report/n1?a=a1");
  });

  it("reduces a same-origin absolute URL to its path, and refuses any other origin", () => {
    expect(safeCallbackUrl(`?callbackUrl=${encodeURIComponent("https://app.example/oracle/app?x=1")}`, ORIGIN)).toBe("/oracle/app?x=1");
    expect(safeCallbackUrl(`?callbackUrl=${encodeURIComponent("https://evil.example/phish")}`, ORIGIN)).toBe("/history");
    expect(safeCallbackUrl(`?callbackUrl=${encodeURIComponent("https://app.example.evil.example/")}`, ORIGIN)).toBe("/history");
  });

  it("refuses protocol-relative and backslash tricks", () => {
    expect(safeCallbackUrl("?callbackUrl=%2F%2Fevil.example", ORIGIN)).toBe("/history");
    expect(safeCallbackUrl("?callbackUrl=%2F%5Cevil.example", ORIGIN)).toBe("/history");
    expect(safeCallbackUrl("?callbackUrl=javascript%3Aalert(1)", ORIGIN)).toBe("/history");
  });
});
