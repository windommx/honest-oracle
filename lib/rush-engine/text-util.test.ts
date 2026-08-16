import { describe, it, expect } from "vitest";
import { countPhrases, wordDiff, diffTokens, estimateTokens, maxOf, minOf, boundedCount } from "./text-util";

describe("estimateTokens (heuristic)", () => {
  it("weights Thai chars ~2.4× heavier than Latin", () => {
    const thai = "ก".repeat(100);   // 100/1.65 ≈ 61
    const latin = "a".repeat(100);  // 100/4 = 25
    expect(estimateTokens(thai)).toBe(Math.ceil(100 / 1.65));
    expect(estimateTokens(latin)).toBe(25);
    expect(estimateTokens(thai)).toBeGreaterThan(estimateTokens(latin) * 2);
  });

  it("handles empty and mixed input deterministically", () => {
    expect(estimateTokens("")).toBe(0);
    const mixed = "hello สวัสดี";
    expect(estimateTokens(mixed)).toBe(estimateTokens(mixed)); // stable
    expect(estimateTokens(mixed)).toBeGreaterThan(0);
  });
});

describe("countPhrases", () => {
  it("subtracts substring overlaps", () => {
    const r = countPhrases("a testament to skill", ["testament", "a testament to"]);
    expect(r.find((x) => x.phrase === "a testament to")?.count).toBe(1);
    expect(r.find((x) => x.phrase === "testament")).toBeUndefined();
  });

  it("does NOT subtract one token-counted word from another it is a substring of", () => {
    // Regression: with tokens supplied, single-word phrases are counted by exact token
    // match, so รส and รสชาติ are separate tokens at separate positions and share no span.
    // The old overlap pass still subtracted count(รสชาติ) from count(รส) because
    // "รสชาติ".includes("รส"), wiping out a genuine sensory hit (sensory.ts undercounted).
    const tokens = ["อาหาร", "มี", "รส", "และ", "รสชาติ"];
    const r = countPhrases("อาหาร มี รส และ รสชาติ", ["รส", "รสชาติ"], { tokens });
    expect(r.find((x) => x.phrase === "รส")?.count).toBe(1);
    expect(r.find((x) => x.phrase === "รสชาติ")?.count).toBe(1);
  });

  it("still absorbs a token into a longer MULTI-word phrase even when tokens are supplied", () => {
    // The overlap correction must survive for its real purpose: the token "testament" DOES
    // sit inside the span of the multi-word phrase "a testament to", so it must net to 0.
    const tokens = ["a", "testament", "to", "skill"];
    const r = countPhrases("a testament to skill", ["testament", "a testament to"], { tokens });
    expect(r.find((x) => x.phrase === "a testament to")?.count).toBe(1);
    expect(r.find((x) => x.phrase === "testament")).toBeUndefined();
  });
});

describe("wordDiff", () => {
  it("marks added, deleted, and unchanged runs", () => {
    const ops = wordDiff("the cat sat down", "the dog sat")!;
    const added = ops.filter((o) => o.type === "add").map((o) => o.text).join(" ");
    const deleted = ops.filter((o) => o.type === "del").map((o) => o.text).join(" ");
    expect(added).toContain("dog");
    expect(deleted).toContain("cat");
    expect(ops.some((o) => o.type === "same" && o.text.includes("the"))).toBe(true);
  });

  it("returns null past the token cap", () => {
    const big = Array.from({ length: 10 }, () => "word").join(" ");
    expect(wordDiff(big, big, 5)).toBeNull();
  });

  it("diffTokens joins Thai tokens with no separator", () => {
    const ops = diffTokens(["เธอ", "เดิน", "มา"], ["เธอ", "วิ่ง", "มา"], "")!;
    expect(ops.some((o) => o.type === "add" && o.text === "วิ่ง")).toBe(true);
    expect(ops.some((o) => o.type === "del" && o.text === "เดิน")).toBe(true);
  });
});

describe("maxOf / minOf — spread-free, stack-safe", () => {
  it("match Math.max/min on ordinary arrays", () => {
    expect(maxOf([3, 1, 4, 1, 5, 9, 2])).toBe(9);
    expect(minOf([3, 1, 4, 1, 5, 9, 2])).toBe(1);
    expect(maxOf([-5, -2, -9])).toBe(-2);
  });
  it("return the fallback on empty", () => {
    expect(maxOf([])).toBe(0);
    expect(minOf([], 999)).toBe(999);
  });
  it("survive an array that overflows Math.max(...spread)", () => {
    // Math.max(...arr) throws RangeError past ~123k elements in V8. This is the reachable
    // crash: a long Thai manuscript's clause-length array. maxOf must not throw.
    const big = Array.from({ length: 300000 }, (_, i) => i);
    expect(() => maxOf(big)).not.toThrow();
    expect(maxOf(big)).toBe(299999);
    expect(minOf(big)).toBe(0);
  });
});

describe("boundedCount — whole-word occurrences, Thai-aware (audit fix)", () => {
  it("does not fire inside a longer Thai word", () => {
    expect(boundedCount("สมชายมา", "สม")).toBe(0);       // สม inside สมชาย
    expect(boundedCount("พวกเขาแต่งงานกัน", "แต่")).toBe(0); // แต่ inside แต่งงาน
    expect(boundedCount("เธอวางหมอนลง", "หมอ")).toBe(0);   // หมอ inside หมอน
  });
  it("fires on a standalone Thai word (space/boundary flanked)", () => {
    expect(boundedCount("อนันต์ ฝันเห็น บุญมา ยืน", "บุญมา")).toBe(1);
    expect(boundedCount("แอนนากับ แอน", "แอน")).toBe(1);   // the standalone one only
  });
  it("respects Latin word boundaries too", () => {
    expect(boundedCount("anna reads", "ann")).toBe(0);      // ann inside anna
    expect(boundedCount("ann and bob", "ann")).toBe(1);
  });
  it("is conservative by design: a name run together with an adjacent Thai word is missed", () => {
    // Documented false-NEGATIVE — the safe direction for a trust-critical flag.
    expect(boundedCount("ของหมอ", "หมอ")).toBe(0);
  });
});
