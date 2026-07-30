# ญาณวิทยาของ Rush — The Rush Epistemology

> **ยถาภูต — เห็นตามที่มันเป็นจริง.** Report the state as it is. Counts, not a verdict.

Every rival in this market sells the same thing: an LLM that looks at your novel and
prints a number — *momentum 73 / clarity 68 / tension 81*. Rush refuses to print that
number. This document is **why** the refusal is not a missing feature but the entire
product — a theory of knowledge that competitors cannot adopt without abandoning their
business model.

The layer that enforces it in code is [`lib/rush-engine/epistemics.ts`](../lib/rush-engine/epistemics.ts):
every signal the engine emits is classified by *what kind of knowing it is*, so nothing
subjective ever wears the costume of a measurement.

---

## The contract

**Rush may present a value as knowledge only when it is a re-derivable count, or a
transparent, deterministic computation over counts. Everything else — momentum, voice,
"is it good" — is named as the writer's (or an LLM's) interpretation, never scored.**

This splits every possible signal into four tiers.

| Tier | Pali / Thai | What it is | Admissible? |
|---|---|---|---|
| 1 | **paccakkha · ประจักษ์** | direct count — perception-grade | ✅ gold standard |
| 2 | **anumāna · อนุมาน** | derived from counts via a disclosed formula | ✅ if reproducible |
| 3 | **saññā · สัญญา** | a heuristic label that may be distorted | ✅ as "review", never a verdict |
| 4 | **avisaya · อวิสัย** | beyond this instrument's range | ❌ **refused** |

A competitor's 0–100 score lives in Tier 4 and is printed as if it were Tier 1. That
single category error is what Rush is built to not commit.

---

## Two lineages, one contract

### Buddhist pramāṇa — the Thai-native spine

Classical Buddhist epistemology (Dignāga–Dharmakīrti) recognises only **two** valid means
of knowledge, which map almost exactly onto Rush's contract:

- **paccakkha / pratyakṣa (ประจักษ์)** — *direct perception.* The most basic valid means.
  → a count you re-derive yourself. **Tier 1.**
- **anumāna (อนุมาน)** — *inference*, mediated by a sign. Legitimate, but lower, and must
  not be dressed up as perception. → a derived ratio (Tier 2) — or, when it is
  non-reproducible and its operation is hidden, **an LLM's guess (Tier 4, refused).**
- **śabda / āgama** — testimony that can't be checked first-hand. The weakest ground,
  because its validity is *borrowed.* → a score handed to you with no way to verify it.

And the distinction Thai readers will feel immediately:

- **saññā (สัญญา)** merely *labels* ("this is X") and can be mistaken (*viparīta-saññā*).
- **paññā (ปัญญา)** *penetrates* a thing's actual characteristics.

An LLM's fluent verdict is **saññā** — a confident label. Rush's countable evidence is the
substrate real **paññā** would work from. Rush refuses to **sell saññā-level labelling as
paññā-level knowing.**

#### The Kālāma Sutta (กาลามสูตร, AN 3.65)

The Buddha told the Kālāmas not to accept a teaching on any of **ten grounds** alone, but
to verify for themselves. Two of the ten describe an LLM score with uncanny precision:

- **#6 — mā nayahetu** — *"อย่าปลงใจเชื่อเพราะการอนุมาน"* — do not believe merely by
  **inference.** Inference is exactly what an LLM does.
- **#9 — mā bhabbarūpatāya** — do not believe merely because the speaker **looks
  credible.** A fluent, authoritative-sounding LLM output is *bhabbarūpatā* itself.

> **Honest framing (important):** the Kālāma Sutta is *not* blanket skepticism, and the
> popular "believe nothing" quote is a documented fake. It forbids accepting inference,
> logic, or authority *in place of* first-hand verification — it does not forbid reasoning.
> Rush's stance is identical: it does not forbid inference (Tier 2 is inference); it
> refuses to **present inference as if it were direct knowledge.**

### Western measurement theory — the rigor check

- **Operationalism (Bridgman, 1927).** A concept *is* its measurement operation. "Word
  count" has an operation; "quality" has none — so by operationalist lights quality is not
  yet a measurable concept, and refusing to score it is *correct*, not lazy.
- **Reliabilism (Goldman, 1979).** Justified belief comes from a reliable process. A
  deterministic counter — same text → same number, every run — is paradigmatically
  reliable. A stochastic 0–100 judgment has no such warrant.
- **Metrological traceability (BIPM VIM).** A measurement must relate to a reference
  through a documented chain. "A count you can re-derive" is fully traceable: the reference
  is the disclosed algorithm + lexicon; the chain is the code; the uncertainty is zero
  given fixed input. A subjective score fails metrology's *own* test for being a
  measurement.
- **Theory-ladenness (Hanson, 1958).** Even a count presupposes a chosen lexicon and Thai
  segmentation. So honesty ≠ claiming frame-free neutrality; honesty = **disclosing the
  instrument.** Every Tier-1/2/3 signal in the registry carries its `instrument`.
- **Stevens' levels of measurement (1946).** Word counts are *ratio*-scale (averaging is
  valid). A subjective 1–100 score is at best *ordinal*, so averaging it is a category
  error. *(Caveat: Stevens' ban on averaging ordinal data is an influential doctrine, not
  settled math — we present it as a principled stance.)*

---

## Why the invented score is epistemically bankrupt

The failure modes have names, and they all apply to "momentum 73/100":

- **Reification / misplaced concreteness (Whitehead).** Printing "momentum = 73" treats an
  abstraction as a concrete measured object.
- **McNamara fallacy (Yankelovich's 4 steps).** Assigning an arbitrary number to the
  unmeasurable (step 2), sliding toward pretending it exists (step 4).
- **Goodhart's Law (Strathern's phrasing).** "When a measure becomes a target, it ceases
  to be a good measure." Optimising prose to raise a fake score corrupts the writing the
  score claims to assess (**Campbell's Law**).
- **False objectivity (Porter, *Trust in Numbers*).** "73/100" borrows measurement's
  authority — two significant figures! — for what is a vibe.
- **Map ≠ territory (Korzybski).** The number is a crude map presented as the territory of
  the writing's worth.
- **The empirical clincher — LLM-as-judge is not a measurement.** Recent studies find the
  *same* input scores differently across runs from ordering, temperature, and prompt
  phrasing (≈20–35% verdict shifts): *reliability without validity.* An LLM quality score
  is a measurement of **the judge**, not the text. *(These are 2026 preprints,
  cross-corroborated across several papers; exact arXiv IDs should be checked before formal
  citation.)*

The honest move, when you cannot measure something, is the opposite of the streetlight
effect: **name what you cannot measure and stop there.** That is Tier 4.

---

## How it lives in the product

- `SIGNAL_REGISTRY` tags every emitted signal with its tier, Stevens level, instrument, and
  reproducibility. Edit a row → the badges and warrants update everywhere.
- `REFUSED_CONSTRUCTS` is the boundary: the constructs Rush will not score, each annotated
  with the fallacy scoring it would commit.
- `warrant(id)` returns, for any signal, *why you may trust it and where its limits are.*
- `KALAMA_GROUNDS` encodes the ten grounds and marks the ones an LLM score leans on.
- The analyzer UI badges each readout by tier and shows the refused constructs with their
  reasons — turning the old "counts, not a verdict" disclaimer into a cited, principled
  panel.

## Why competitors can't copy this

Their product **is** the Tier-4 score. To adopt this epistemology, they would have to stop
selling the number that is their headline feature. Rush's moat here is not a feature that
can be cloned in a sprint — it is a **commitment** that is expensive precisely for the
people who most need to make it.

---

### Sources & honest caveats

Primary attributions verified against the Stanford Encyclopedia of Philosophy, the BIPM
*International Vocabulary of Metrology*, and standard references: Gettier (1963), Bridgman
(1927), Goldman (1979), Stevens (1946), Hanson (1958), Popper (1934), Whitehead (1929),
Korzybski (1933), Goodhart (1975) / Strathern (1997), Campbell (1976), Yankelovich (1972),
Porter (1995). Buddhist terms from the Kālāma Sutta (AN 3.65, Access to Insight; Thai
Wikipedia; Phra Payutto glosses) and the Dignāga–Dharmakīrti pramāṇa tradition.

Held to the same standard this document argues for:

- Stevens' ban on averaging ordinal data — his doctrine, **contested** among statisticians.
- Popper's falsifiability as *the* demarcation — influential but **criticised**
  (Duhem–Quine, Kuhn, Lakatos). Used as a lens, not a settled criterion.
- LLM-as-judge papers — 2026 **preprints**; the finding is robustly cross-corroborated but
  exact IDs are unverified.

## What the research says (updated July 2026)

The refusal of invented quality scores has since accumulated direct empirical support
(all multi-source-verified; numbers should be re-checked against primary PDFs before
citing in print):

- **Art or Artifice?** (Chakrabarty et al., CHI 2024; arXiv:2309.14556) — with a
  Torrance-derived rubric and 10 expert judges, **no LLM assessor correlated positively
  with expert creativity judgments**.
- **WritingPreferenceBench** (arXiv:2510.14616, 2025) — once objective signals (grammar,
  length, factuality) are neutralized, zero-shot LLM judges score **53.9% ≈ chance** on
  subjective writing preference, with per-genre variance from 18% to 92%.
- **LitBench** (arXiv:2507.00769, 2025) — the best zero-shot judge agrees with human
  story preferences only 73% of the time.
- **Self-preference bias** (arXiv:2410.21819, 2024) — judges systematically favor
  low-perplexity, LLM-flavored prose over human prose; a 0–100 "quality score" from a
  judge partly measures *how LLM-like the text is*.
- **NoCha** (EMNLP 2024, arXiv:2406.16264) — on true/false claims about full novels, no
  open-weight model beats random; even GPT-4o reaches only 55.8%. Long-range consistency
  cannot be delegated to a model reading the whole book — which is why this engine makes
  the author DECLARE canon (Story Codex) and then counts against it.
- Conversely, the *countable* signals this engine reports align with what research
  measures: sentence-rhythm variance (our rhythm CV) matches the low-"burstiness"
  AI-tell finding (O'Sullivan 2025), and per-character declared voice mirrors the
  persona-diversification mitigation for AI homogenization (arXiv:2504.13868).
- "Not everything that counts can be counted" — **Cameron (1963)**, not Einstein.
- ประมาณ (*pramāṇa*) colloquially means "approximately" in Thai — glossed as
  เครื่องวัด/เกณฑ์ตัดสินความรู้ wherever it surfaces, to avoid the "estimate" reading.
