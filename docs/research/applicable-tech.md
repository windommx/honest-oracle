# Applicable Tech — world scan for Rush Engine

Curated external tools / algorithms / patterns that Rush Engine could adopt, scored
against the platform's founding principles. Web-sourced July 2026 (links at each item);
re-check before committing effort.

**Scoring key**
- **Fit** with Rush principles (deterministic · client-side / privacy · no fake metrics · Thai-native): ✅ strong · 🟡 partial · 🔴 breaks a principle
- **Effort**: S (hours) · M (a few days) · L (weeks+)

> Interpretation note: the request listed *LOGICS, algorithms, CLI, TUI, Plugin, addon,
> "J-space​conscious-like", multi-tab*. "J-space conscious-like" is ambiguous — I read it
> as **notebook / literate + local-first workspace** (a "space" you think in). Flagged in §6.

---

## TL;DR — adopt in this order

| # | Adopt | Why it wins here | Fit | Effort |
|---|-------|------------------|-----|--------|
| 1 | **Aho-Corasick** multi-pattern matcher | one-pass lexicon matching for sensory / AI-tell / tell-words — replaces per-phrase splits | ✅ | S–M |
| 2 | **SymSpell** (symmetric-delete) | fast, principled name-variant / spell clustering — retires the O(n²) union-find | ✅ | M |
| 3 | **Dictionary Thai tokenizer** (newmm via nlpo3 / thai-wordcut-ts) | raises the *segmentation ceiling* — the #1 documented Thai gap — deterministically | ✅ | M |
| 4 | **Local-first / CRDT** (Yjs or Automerge + IndexedDB + BroadcastChannel) | offline + **multi-tab** sync + optional cloud, **no backend, data stays on client** — matches the moat exactly | ✅ | M–L |
| 5 | **Plugin architecture** (Obsidian model: manifest + lifecycle) | community-contributed prompt modules / analyzers → closes the "community" gap the CI engine flagged | 🟡 | L |
| 6 | **CLI / TUI** (Ink or OpenTUI) | run the deterministic analyzers headless / in-terminal — a dev-loved surface | ✅ | M |

---

## 1. String algorithms — faster, cleaner analyzers

### Aho-Corasick (multi-pattern search) ✅ · S–M
Finds every occurrence of *all* dictionary patterns in **one pass**, `O(n + m + z)`, via a trie
+ failure links. Rush's `countPhrases` currently does a `split()` per phrase (fine at today's
lexicon sizes, but O(patterns × text)). As the Thai sensory/AI-tell/tell-word lists grow
(and they should — see the moat), Aho-Corasick keeps matching flat and single-pass.
- **Apply to**: `sensory.ts`, `thai-analyzer` AI-tell / tell-word matching, any lexicon match.
- **Note**: keep it pure/deterministic; a small hand-rolled trie avoids a dependency.
- Sources: [Aho-Corasick (GfG)](https://www.geeksforgeeks.org/dsa/aho-corasick-algorithm-pattern-searching/) · [npm aho-corasick](https://www.npmjs.com/search?q=keywords%3Aaho-corasick)

### SymSpell — Symmetric Delete spelling correction ✅ · M
Precomputes only *deletes* of dictionary terms; reportedly **~1,870× faster than a BK-tree**
and 10⁶× faster than Norvig for fuzzy/edit-distance lookup. Rush's consistency ledger clusters
name variants with an O(n²) union-find over `withinOneEdit`; SymSpell (or its idea) gives near-
linear variant lookup and a cleaner "is this a misspelling of a known name?" query — pairs well
with the writer glossary.
- **Apply to**: `consistency.ts` variant clustering; glossary "did you mean" suggestions.
- **Caveat for Thai**: edit distance on Thai monosyllables is noisy (we already learned this) —
  keep the Thai path on the mark-variant heuristic; use SymSpell mainly for English + glossary.
- Sources: [SymSpell](https://github.com/wolfgarbe/SymSpell) · [SymSpell vs BK-tree](https://seekstorm.com/blog/symspell-vs-bk-tree/)

---

## 2. Thai NLP — raise the segmentation ceiling (the moat's #1 gap)

Intl.Segmenter's Thai dictionary splits unknown proper nouns (มะลีนั่ง → มะลี + นั่ง), which we
mitigated with a writer glossary + auto-suggest. A stronger tokenizer would lift the ceiling
for everyone.

| Library | Kind | Fit | Notes |
|---|---|---|---|
| **nlpo3** (PyThaiNLP, Rust + Node bindings) | dictionary (newmm) + deepcut | ✅ / 🟡 | Rust core; Node binding is server-side (native addon), not browser. Great for a CLI/API path. |
| **thai-wordcut-ts** | dictionary, TypeScript | ✅ | Pure TS fork of `wordcut` → runs client-side, deterministic, supports custom dictionaries (glue with the glossary!). Best browser fit. |
| **AttaCut / deepcut** | neural | 🟡 | Higher accuracy but needs a model → heavier; browser only via WASM/ONNX. Reserve for a server/opt-in path. |

- **Recommendation**: adopt **thai-wordcut-ts** as a client-side option with a **custom-dictionary
  hook fed by the writer glossary** — deterministic, no server, and the writer's cast names become
  first-class dictionary entries. Keep Intl.Segmenter as the zero-dep fallback.
- Sources: [nlpo3](https://github.com/pythainlp/nlpo3) · [thai-wordcut-ts](https://github.com/kitaclang/thai-wordcut-ts) · [AttaCut paper](https://arxiv.org/pdf/1911.07056) · [NLP for Thai](https://nlpforthai.com/tasks/word-segmentation/)

---

## 3. Local-first / CRDT — multi-tab + offline + optional cloud (no backend)

This is the sleeper win: Rush is already client-side, privacy-first, BYO-key. **Local-first**
(CRDTs) lets projects/manuscripts live in the browser (IndexedDB), sync across **tabs** via
`BroadcastChannel`, work fully **offline**, and *optionally* sync to a peer/cloud — **without a
server holding your text**. This deepens the moat instead of compromising it, and directly
answers the "multi-tab" ask.

- **Yjs** — mature, JSON + rich-text CRDTs, huge ecosystem; `y-indexeddb` (offline) +
  `y-broadcastchannel` (multi-tab) need no backend.
- **Automerge (2.0, WASM)** — batteries-included repo with IndexedDB storage + BroadcastChannel/
  MessageChannel adapters; "no backend needed" offline editors are a documented pattern.
- **Apply to**: manuscript autosave (today localStorage) → CRDT doc synced across tabs; Pro cloud
  sync becomes an *optional* network adapter, not a requirement — honest to the moat.
- Sources: [Yjs](https://github.com/yjs/yjs) · [Automerge](https://automerge.org/) · [Automerge Repo](https://automerge.org/blog/automerge-repo/) · [Offline CRDT + IndexedDB, no backend](https://dev.to/hexshift/building-offline-first-collaborative-editors-with-crdts-and-indexeddb-no-backend-needed-4p7l)

---

## 4. Plugin / addon architecture — user-contributed modules (closes the "community" gap)

The CI engine computed that **community (5/9 rivals)** is a real gap. A plugin system turns Rush's
50+ modules into an *open* catalog: writers publish custom prompt modules, lexicons (e.g. a
BL-genre sensory list), or deterministic analyzers.

- **Obsidian model** (recommended shape): a `manifest.json` (id, name, minAppVersion) + a `Plugin`
  class with `onload()/onunload()` lifecycle; the host exposes a stable API object; cleanup is
  framework-managed. Simple, TypeScript-native, proven at community scale.
- **Fit 🟡**: extensibility fits; the risk is **running untrusted plugin code** — for a web app,
  sandbox via iframe/Worker or restrict plugins to *declarative data* (prompt text + lexicon JSON,
  no arbitrary JS) first. Declarative-only plugins are 100% safe and still very useful for Rush.
- Sources: [Obsidian plugin docs](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin) · [Sample plugin](https://github.com/obsidianmd/obsidian-sample-plugin)

---

## 5. CLI / TUI — a terminal surface for the deterministic engine

Every analyzer is pure and headless-ready, so a **Rush CLI** (`rush analyze book.md`,
`rush prompts --type novel --genre romance`) is low-friction and beloved by power users.
A **TUI** could show the per-chapter heatmap + sensory bars in the terminal.

| Framework | Lang | Fit | Notes |
|---|---|---|---|
| **Ink** (React) | JS/TS | ✅ | Same React mental model; used by Claude Code + Gemini CLI. Caveats: ~30 FPS cap, heavier memory. |
| **OpenTUI** | JS/TS (Zig core, Bun) | ✅ | Newer; faster render, no 30 FPS cap — worth watching if perf matters. |
| **Bubble Tea v2** (Go) / **Textual** (Python) | Go / Py | 🟡 | Excellent, but a different runtime than the TS engine. |
- **Recommendation**: a thin **CLI first** (Node, no TUI) wrapping the existing pure functions —
  reuses 100% of the engine, ships in a day. Add an **Ink** TUI later for the heatmap.
- Sources: [7 TUI libraries (LogRocket)](https://blog.logrocket.com/7-tui-libraries-interactive-terminal-apps/) · [OpenTUI](https://www.stork.ai/blog/the-tui-library-thats-killing-ink)

---

## 6. "J-space conscious-like" → notebook / literate + local-first workspace 🟡

Best guess at the term: a **notebook / literate** surface (think Jupyter/Observable) where prose,
the generated prompts, and the deterministic analysis live in one scrollable "space", plus
**multi-tab** panes per chapter. Combined with §3 (local-first), this is a coherent "writing
space": cells = chapters, each cell shows its sensory/consistency readout inline, all offline and
synced across tabs. No specific library needed beyond §3 + a pane/tab layout — but flag this back
to the user to confirm the intended meaning before building.

---

## Explicitly out of scope (would break a principle) 🔴
- Cloud "AI writes your book" SaaS wrappers, LLM-graded "quality scores", market/BSR scrapers —
  these reintroduce fake metrics / server-LLM cost / vendor lock the platform rejects.

---

_Sources are inline per item. All assessments are the author's judgement against Rush's stated
principles; competitor/library facts are web-sourced (July 2026) and may change._
