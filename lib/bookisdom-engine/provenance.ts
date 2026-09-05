// ╔══════════════════════════════════════════════════════════════════╗
// ║  PROVENANCE — the receipt. Every number Bookisdom reports, with the     ║
// ║  instrument that made it and the command that re-makes it.         ║
// ║                                                                    ║
// ║  Adapted from the "evidence chain" idea in zhaoxuya520/reverse-    ║
// ║  skill's ops contracts (MIT). Bookisdom's router commit refused that    ║
// ║  whole block as security-specific — correct about scope gates      ║
// ║  (a manuscript has no boundary to breach), too fast about the      ║
// ║  evidence chain. A pentest chain proves what you TOUCHED. This     ║
// ║  proves what you COMPUTED, which is the thing Bookisdom's whole pitch   ║
// ║  rests on and has so far only ASSERTED.                            ║
// ║                                                                    ║
// ║  It works here for one reason competitors cannot copy: the engine  ║
// ║  is deterministic. An LLM-scored tool can print a receipt too,     ║
// ║  and re-running would produce different numbers — the receipt      ║
// ║  would document the drift rather than prevent it.                  ║
// ║                                                                    ║
// ║  NO TIMESTAMP, ON PURPOSE. Bookisdom has no clock in output paths, and  ║
// ║  a dated receipt would differ run to run for identical input —     ║
// ║  destroying the one property being certified. Same manuscript in,  ║
// ║  byte-identical receipt out, forever. That equality IS the proof;  ║
// ║  a date would only say when someone happened to look.              ║
// ╚══════════════════════════════════════════════════════════════════╝

import { classifySignal, isRefused, tierInfo, warrant, type EpistemicTier } from "./epistemics";

/** Must match package.json. A receipt naming the wrong engine certifies nothing —
 *  provenance.test.ts fails the build if these drift apart. */
export const ENGINE_VERSION = "1.0.0";

/** What a caller asserts: this signal had this value. Nothing about how good it is. */
export interface Claim {
  /** Must be an id in SIGNAL_REGISTRY. An unknown id is surfaced, never silently tiered. */
  signal: string;
  value: number | string;
  /** Optional human label for the line; the signal's own Thai label is used otherwise. */
  label?: string;
  /** Optionally NARROW the registry's disclosed instrument to the one actually used.
   *  Some registry entries name a family ("Thai segmenter (newmm-class) / whitespace
   *  tokenizer") because one signal is produced by either, depending on language. A
   *  receipt that prints "Thai segmenter" for an English manuscript is wrong in exactly
   *  the way this module exists to prevent. The override must be a SUBSTRING of the
   *  registry entry — it may sharpen the disclosure, never replace or contradict it. An
   *  override that is not a narrowing is ignored and recorded in `badOverrides`. */
  instrument?: string;
}

/** A claim after classification — carries the warrant it is entitled to, and no more. */
export interface ReceiptClaim {
  signal: string;
  value: number | string;
  label: string;
  tier: EpistemicTier;
  /** What produced it: segmenter, lexicon, formula. The disclosed frame. */
  instrument: string;
  reproducible: boolean;
}

export interface Receipt {
  engine: string;
  /** The function that produced these claims, e.g. "analyzeThai". */
  tool: string;
  input: { chars: number; fingerprint: string };
  claims: ReceiptClaim[];
  /** Claim ids with no entry in SIGNAL_REGISTRY. Listed rather than dropped: an
   *  unclassifiable number is exactly what a receipt exists to catch. */
  unclassified: string[];
  /** Overrides that were not a narrowing of the registry's instrument. Ignored for the
   *  printed value and surfaced here, because a caller silently renaming the instrument
   *  is the one failure this module could not otherwise detect. */
  badOverrides: { signal: string; claimed: string; registry: string }[];
  /** Claims refused outright (a construct on REFUSED_CONSTRUCTS reached the receipt
   *  layer). Kept visible with the reason so the attempt is on the record. */
  rejected: { signal: string; why: string }[];
  /** The same signal submitted more than once. The FIRST value is kept in `claims`; the
   *  rest are recorded here. A receipt is an unambiguous record, so one signal cannot hold
   *  two values — storing both would be a contradiction, and it broke verifyReceipt, whose
   *  re-run Map kept only the last of the duplicates and compared against that. */
  duplicates: { signal: string; kept: number | string; dropped: number | string }[];
  /** The exact command that regenerates this receipt. */
  reproduce: string;
}

/** FNV-1a over UTF-16 code units, hex. Not cryptographic and not claimed to be: it
 *  identifies WHICH text was measured, so two receipts can be compared without shipping
 *  the manuscript. Same function family already used by the winnowing fingerprints. */
export function fingerprint(text: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/**
 * Build a receipt. Pure and total: no clock, no randomness, no I/O.
 *
 * Every claim is classified against SIGNAL_REGISTRY. A claim whose signal is unknown goes
 * to `unclassified`; a claim naming a refused construct goes to `rejected`. Neither is
 * dropped, because a receipt that quietly discards what it cannot justify is worse than
 * no receipt — it launders the gap.
 */
export function buildReceipt(opts: {
  tool: string;
  text: string;
  claims: Claim[];
  reproduce: string;
}): Receipt {
  const claims: ReceiptClaim[] = [];
  const unclassified: string[] = [];
  const rejected: { signal: string; why: string }[] = [];
  const badOverrides: { signal: string; claimed: string; registry: string }[] = [];
  const duplicates: { signal: string; kept: number | string; dropped: number | string }[] = [];
  const seen = new Map<string, number | string>();

  for (const c of opts.claims) {
    // A signal already recorded cannot take a second value — a receipt is an unambiguous
    // record. Keep the first, surface the rest. (Before this, both survived into claims and
    // verifyReceipt's re-run Map silently compared against whichever came last.)
    if (seen.has(c.signal)) {
      duplicates.push({ signal: c.signal, kept: seen.get(c.signal)!, dropped: c.value });
      continue;
    }
    if (isRefused(c.signal)) {
      // Do NOT register the value in `seen`. `seen` drives the duplicate branch above, which
      // reports the kept/dropped VALUES — and a refused construct's value must not survive
      // anywhere in the receipt. If the same refused signal is submitted again it is simply
      // re-refused here; the number is never exposed.
      rejected.push({
        signal: c.signal,
        why: "on REFUSED_CONSTRUCTS — a latent construct with no valid operation; it cannot be certified because it was never measured",
      });
      continue;
    }
    const s = classifySignal(c.signal);
    if (!s) {
      // Same reasoning: an unclassified signal was never measured, so its value is not a
      // certified quantity to echo back as a "duplicate". A re-submission re-lists it.
      unclassified.push(c.signal);
      continue;
    }
    seen.set(c.signal, c.value);
    let instrument = s.instrument;
    if (c.instrument) {
      if (s.instrument.includes(c.instrument)) instrument = c.instrument;
      else badOverrides.push({ signal: c.signal, claimed: c.instrument, registry: s.instrument });
    }
    claims.push({
      signal: c.signal,
      value: c.value,
      label: c.label ?? s.thai,
      tier: s.tier,
      instrument,
      reproducible: s.reproducible,
    });
  }

  return {
    engine: ENGINE_VERSION,
    tool: opts.tool,
    input: { chars: opts.text.length, fingerprint: fingerprint(opts.text) },
    claims,
    unclassified,
    rejected,
    badOverrides,
    duplicates,
    reproduce: opts.reproduce,
  };
}

export interface VerifyResult {
  /** True only when the input is the same text AND every claim re-derived identically. */
  ok: boolean;
  sameInput: boolean;
  matched: string[];
  /** Claims whose value changed — the thing a deterministic engine must never produce. */
  drifted: { signal: string; was: number | string; now: number | string }[];
  /** In the receipt but absent from the re-run, and vice versa. */
  missing: string[];
  added: string[];
}

/**
 * Re-derive and compare. This is the half that makes the receipt worth anything: a
 * document asserting reproducibility is a claim, and running it again is the check.
 *
 * `sameInput` is reported separately from `ok` on purpose. If the fingerprint differs the
 * manuscript was edited, and a value change is expected rather than alarming — conflating
 * "you changed the text" with "the engine is non-deterministic" would make the alarm useless.
 */
export function verifyReceipt(receipt: Receipt, text: string, claims: Claim[]): VerifyResult {
  const sameInput = fingerprint(text) === receipt.input.fingerprint;
  const now = new Map(claims.map((c) => [c.signal, c.value]));
  const matched: string[] = [];
  const drifted: { signal: string; was: number | string; now: number | string }[] = [];
  const missing: string[] = [];

  for (const c of receipt.claims) {
    if (!now.has(c.signal)) { missing.push(c.signal); continue; }
    const v = now.get(c.signal)!;
    if (v === c.value) matched.push(c.signal);
    else drifted.push({ signal: c.signal, was: c.value, now: v });
  }
  const known = new Set(receipt.claims.map((c) => c.signal));
  const added = claims.map((c) => c.signal).filter((s) => !known.has(s));

  return {
    ok: sameInput && drifted.length === 0 && missing.length === 0,
    sameInput, matched, drifted, missing, added,
  };
}

/** Render a receipt as Markdown. Grouped by epistemic tier, strongest first, so the
 *  reader sees which numbers are counts before which are labels. */
export function formatReceipt(r: Receipt): string {
  const L: string[] = [];
  L.push(`# ใบเสร็จการวัด — ${r.tool}`);
  L.push("");
  L.push(`engine \`${r.engine}\` · input ${r.input.chars} อักษร · fingerprint \`${r.input.fingerprint}\``);
  L.push("");
  L.push("> ใบเสร็จนี้**ไม่มีวันที่** — เครื่องยนต์ไม่มีนาฬิกา ต้นฉบับเดิมให้ใบเสร็จที่เหมือนกันทุกไบต์เสมอ");
  L.push("> ความเท่ากันนั้นคือตัวพิสูจน์เอง วันที่บอกได้แค่ว่าใครบังเอิญมาดูตอนไหน");
  L.push("");

  const order: EpistemicTier[] = ["paccakkha", "anumana", "sanna"];
  for (const t of order) {
    const rows = r.claims.filter((c) => c.tier === t);
    if (!rows.length) continue;
    const info = tierInfo(t);
    L.push(`## ${info.thai} — ${info.en}`);
    L.push("");
    L.push("| ค่า | สัญญาณ | เครื่องมือที่วัด |");
    L.push("|---|---|---|");
    for (const c of rows) L.push(`| ${c.value} | ${c.label} (\`${c.signal}\`) | ${c.instrument} |`);
    L.push("");
  }

  if (r.rejected.length) {
    L.push("## ปฏิเสธ — ขอมาแต่ออกใบเสร็จให้ไม่ได้");
    L.push("");
    for (const x of r.rejected) L.push(`- \`${x.signal}\` — ${x.why}`);
    L.push("");
  }
  if (r.badOverrides.length) {
    L.push("## เครื่องมือที่แจ้งไม่ตรงทะเบียน — ไม่ใช้ค่าที่แจ้ง");
    L.push("");
    for (const b of r.badOverrides) L.push(`- \`${b.signal}\` — แจ้งว่า "${b.claimed}" แต่ทะเบียนระบุ "${b.registry}"`);
    L.push("");
  }
  if (r.duplicates.length) {
    L.push("## สัญญาณซ้ำ — เก็บค่าแรก ตัวที่เหลือขึ้นบัญชีไว้");
    L.push("");
    for (const d of r.duplicates) L.push(`- \`${d.signal}\` — เก็บ ${d.kept} · ทิ้ง ${d.dropped} (สัญญาณเดียวมีสองค่าไม่ได้)`);
    L.push("");
  }
  if (r.unclassified.length) {
    L.push("## ไม่รู้จัก — ไม่มีในทะเบียนสัญญาณ");
    L.push("");
    L.push(`ตัวเลขที่จัดชั้นไม่ได้คือสิ่งที่ใบเสร็จนี้มีไว้เพื่อจับ: ${r.unclassified.map((s) => `\`${s}\``).join(", ")}`);
    L.push("");
  }

  L.push("## ทำซ้ำเอง");
  L.push("");
  L.push("```");
  L.push(r.reproduce);
  L.push("```");
  return L.join("\n");
}

/** The one-line warrant for a signal, for a UI that wants it inline. Re-exported here so
 *  a caller building receipts does not have to import two modules. */
export { warrant };
