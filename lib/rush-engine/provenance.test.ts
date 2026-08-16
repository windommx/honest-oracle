import { describe, it, expect } from "vitest";
import {
  ENGINE_VERSION, buildReceipt, verifyReceipt, formatReceipt, fingerprint, type Claim,
} from "./provenance";
import { SIGNAL_REGISTRY, REFUSED_CONSTRUCTS } from "./epistemics";
import pkg from "../../package.json";

const TEXT = "เขายืนอยู่ตรงนั้น ฝนตกหนัก เสียงรถดังมาจากถนน";
const CLAIMS: Claim[] = [
  { signal: "wordCount", value: 12 },
  { signal: "rhythmCv", value: 0.41 },
  { signal: "droppedTerms", value: 2 },
];
const CMD = 'npm run rush -- analyze draft.md --lang th';

const mk = (claims: Claim[] = CLAIMS) =>
  buildReceipt({ tool: "analyzeThai", text: TEXT, claims, reproduce: CMD });

describe("the receipt states the engine it came from", () => {
  it("ENGINE_VERSION matches package.json", () => {
    // A receipt naming the wrong engine certifies nothing.
    expect(ENGINE_VERSION).toBe(pkg.version);
  });
});

describe("determinism — the property the receipt exists to certify", () => {
  it("same input yields a byte-identical receipt, every time", () => {
    const a = JSON.stringify(mk());
    for (let i = 0; i < 5; i++) expect(JSON.stringify(mk())).toBe(a);
  });

  it("carries no timestamp, date, or clock reading", () => {
    const json = JSON.stringify(mk());
    expect(json).not.toMatch(/20\d{2}-\d{2}-\d{2}/);
    expect(json).not.toMatch(/\bdate\b|\btimestamp\b|\bgeneratedAt\b/i);
    // and the rendered form says WHY, rather than leaving it looking like an oversight
    expect(formatReceipt(mk())).toContain("ไม่มีวันที่");
  });

  it("fingerprints identify which text was measured, and differ when it changes", () => {
    expect(fingerprint(TEXT)).toBe(fingerprint(TEXT));
    expect(fingerprint(TEXT)).not.toBe(fingerprint(TEXT + " "));
    expect(fingerprint(TEXT)).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe("classification — a number only gets the warrant it is entitled to", () => {
  it("tags every claim with its tier and the instrument that made it", () => {
    const r = mk();
    const byId = new Map(r.claims.map((c) => [c.signal, c]));
    expect(byId.get("wordCount")!.tier).toBe("paccakkha"); // direct count
    expect(byId.get("rhythmCv")!.tier).toBe("anumana");    // derived by disclosed formula
    expect(byId.get("droppedTerms")!.tier).toBe("sanna");  // heuristic label
    for (const c of r.claims) {
      expect(c.instrument.length).toBeGreaterThan(0);
      // the instrument really is the registry's, not something invented here
      expect(c.instrument).toBe(SIGNAL_REGISTRY.find((s) => s.id === c.signal)!.instrument);
    }
  });

  it("surfaces an unknown signal instead of silently tiering it", () => {
    const r = mk([...CLAIMS, { signal: "vibeLevel", value: 7 }]);
    expect(r.unclassified).toEqual(["vibeLevel"]);
    expect(r.claims.map((c) => c.signal)).not.toContain("vibeLevel");
    expect(formatReceipt(r)).toContain("vibeLevel");
  });

  it("refuses a construct on REFUSED_CONSTRUCTS and records the attempt", () => {
    const refused = REFUSED_CONSTRUCTS[0].id;
    const r = mk([...CLAIMS, { signal: refused, value: 73 }]);
    expect(r.rejected.map((x) => x.signal)).toContain(refused);
    expect(r.claims.map((c) => c.signal)).not.toContain(refused);
    // the value 73 must not survive anywhere in the receipt
    expect(JSON.stringify(r.claims)).not.toContain("73");
    expect(r.rejected[0].why.length).toBeGreaterThan(20);
  });

  it("drops nothing — every submitted claim lands in exactly one bucket", () => {
    const submitted = [...CLAIMS, { signal: "vibeLevel", value: 7 }, { signal: REFUSED_CONSTRUCTS[0].id, value: 1 }];
    const r = mk(submitted);
    expect(r.claims.length + r.unclassified.length + r.rejected.length + r.duplicates.length).toBe(submitted.length);
  });

  it("a signal submitted twice keeps the first value and records the rest, never a contradiction", () => {
    // Adversarial-audit finding in this module's own code: two claims for the same signal
    // both used to survive into `claims`, and verifyReceipt's re-run Map then compared
    // against whichever came last — an order-dependent, contradictory record.
    const r = mk([{ signal: "wordCount", value: 1 }, { signal: "wordCount", value: 2 }]);
    expect(r.claims.filter((c) => c.signal === "wordCount")).toHaveLength(1);
    expect(r.claims.find((c) => c.signal === "wordCount")!.value).toBe(1); // first wins
    expect(r.duplicates).toEqual([{ signal: "wordCount", kept: 1, dropped: 2 }]);
    // and a re-run of the deduped claim verifies cleanly instead of "drifting" 2→1
    expect(verifyReceipt(r, TEXT, [{ signal: "wordCount", value: 1 }]).drifted).toEqual([]);
    expect(formatReceipt(r)).toContain("สัญญาณซ้ำ");
  });
});

describe("verifyReceipt — running it again is the actual check", () => {
  it("confirms an unchanged re-run", () => {
    const v = verifyReceipt(mk(), TEXT, CLAIMS);
    expect(v.ok).toBe(true);
    expect(v.sameInput).toBe(true);
    expect(v.drifted).toEqual([]);
    expect(v.matched).toEqual(expect.arrayContaining(["wordCount", "rhythmCv", "droppedTerms"]));
  });

  it("reports drift with both values when a number changes", () => {
    const v = verifyReceipt(mk(), TEXT, [{ signal: "wordCount", value: 13 }, ...CLAIMS.slice(1)]);
    expect(v.ok).toBe(false);
    expect(v.drifted).toEqual([{ signal: "wordCount", was: 12, now: 13 }]);
  });

  it("separates 'you edited the text' from 'the engine drifted'", () => {
    // Conflating these would make the alarm useless: editing a manuscript SHOULD change
    // the counts, and only a change with an identical fingerprint indicts the engine.
    const v = verifyReceipt(mk(), TEXT + " เพิ่มคำ", CLAIMS);
    expect(v.sameInput).toBe(false);
    expect(v.drifted).toEqual([]); // values happen to match; the input did not
    expect(v.ok).toBe(false);      // still not ok — this is not a verified re-run
  });

  it("reports claims that vanished or appeared", () => {
    const v = verifyReceipt(mk(), TEXT, [{ signal: "wordCount", value: 12 }, { signal: "uniqueWords", value: 9 }]);
    expect(v.missing).toEqual(expect.arrayContaining(["rhythmCv", "droppedTerms"]));
    expect(v.added).toEqual(["uniqueWords"]);
    expect(v.ok).toBe(false);
  });
});

describe("formatReceipt", () => {
  it("groups by tier, strongest first, and prints the reproduce command", () => {
    const md = formatReceipt(mk());
    expect(md).toContain("ประจักษ์");
    expect(md).toContain("อนุมาน");
    expect(md).toContain("สัญญา");
    expect(md.indexOf("ประจักษ์")).toBeLessThan(md.indexOf("สัญญา")); // counts before labels
    expect(md).toContain(CMD);
    expect(md).toContain(ENGINE_VERSION);
  });

  it("shows the instrument next to every value, never a bare number", () => {
    const md = formatReceipt(mk());
    for (const c of mk().claims) expect(md).toContain(c.instrument);
  });
});

describe("instrument narrowing", () => {
  it("lets a caller sharpen a family entry to the tool that actually ran", () => {
    // wordCount's registry entry names a family: "Thai segmenter (newmm-class) / whitespace
    // tokenizer". Printing "Thai segmenter" for an English manuscript is wrong in exactly
    // the way this module exists to prevent.
    const r = mk([{ signal: "wordCount", value: 15, instrument: "whitespace tokenizer" }]);
    expect(r.claims[0].instrument).toBe("whitespace tokenizer");
    expect(r.badOverrides).toEqual([]);
  });

  it("refuses an override that is not a narrowing, and says so", () => {
    const r = mk([{ signal: "wordCount", value: 15, instrument: "GPT-4 counted them" }]);
    expect(r.claims[0].instrument).toBe(SIGNAL_REGISTRY.find((s) => s.id === "wordCount")!.instrument);
    expect(r.badOverrides).toEqual([
      { signal: "wordCount", claimed: "GPT-4 counted them", registry: expect.any(String) },
    ]);
    expect(formatReceipt(r)).toContain("GPT-4 counted them"); // surfaced, not swallowed
  });
});
