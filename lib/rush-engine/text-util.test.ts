import { describe, it, expect } from "vitest";
import { countPhrases, wordDiff, diffTokens } from "./text-util";

describe("countPhrases", () => {
  it("subtracts substring overlaps", () => {
    const r = countPhrases("a testament to skill", ["testament", "a testament to"]);
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
