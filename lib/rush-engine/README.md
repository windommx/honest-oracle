# Rush Engine

A pure, isomorphic engine for authoring books — **two halves that never call an LLM**:

1. **Generation** — turn a `BookConfig` into a copyable **prompt pack** to run in any
   LLM (ChatGPT / Claude / Gemini). The engine writes the *scaffolding*; the LLM writes
   the prose.
2. **Analysis** — run **deterministic** checks over drafts you've written: word/clause
   stats, sensory density, cross-chapter consistency, continuity radar, Story Codex
   audit, series (Saga) continuity, per-scene readouts.

No network, no `Date.now()`/`Math.random()` in output paths, no hidden model calls.
Used by the `/rush` UI, the `/api/rush/*` routes, and the `rush` CLI.

## The one rule: epistemic honesty

This engine refuses to fake rigor. It never emits a `0–100` quality score or an invented
confidence number, because a subjective judgement dressed as a measurement is a lie about
what was actually computed. `epistemics.ts` encodes this: every signal is classified by
*what kind of knowing it is* — a direct count (ประจักษ์), a derived value (อนุมาน), a
heuristic label (สัญญา), or **refused** (อวิสัย). If a thing can't be measured
deterministically, the engine generates an honest prompt for an LLM to do it — it does not
pretend the engine computed it. See `docs/epistemology.md`.

Everything the analysis half reports is a **count, not a verdict.**

## The CLI

`runCli` (in `cli.ts`) is itself pure — `argv` + an injected file reader → text out — so it
unit-tests without a shell. The thin bin is `scripts/rush.ts` (`npm run rush -- <cmd>`).

| Command | What it does |
|---|---|
| `prompts` | Generate the prompt pack for a book config (`--type --genre [--chapters --words --lang --full]`). |
| `analyze` | Deterministic analyzers on a manuscript (stats, sensory, consistency, story bible, AI-tell clichés; Thai spelling suggestions). |
| `rename` | Rename a character/term across chapters with a per-chapter audit + collision warning (`--from --to [--write]`). |
| `relations` | Character co-occurrence graph — who shares scenes with whom (`--names`). |
| `radar` | Continuity radar: canon names never used + off-canon names that recur, drift/typo (`--canon`). |
| `codex` | Audit a draft against a declared **Story Codex** (`--bible`): present / misspelled / not-referenced entities + off-canon drift. `--graph` emits a Mermaid graph instead. |
| `saga` | Series continuity across many book codices (`--books`, ordered): introduced / carried / dropped per book + the series backbone. |
| `scene` | Per-scene readout (Thai): words, clauses, rhythm cv, dialogue ratio, telling density, sensory/1k, AI-tells — real signals, never a 0–100 vibe score. |
| `narrative` | Presence / pacing / motif tracking (Thai). |

```bash
npm run rush -- prompts --type novel --genre thriller --lang th
npm run rush -- codex draft.md --bible bible.md          # continuity audit
npm run rush -- codex --bible bible.md --graph            # Mermaid relationship graph
npm run rush -- saga --books b1.md,b2.md,b3.md --titles "กำเนิด,สงคราม,ราชวงศ์"
```

## Story Codex + Saga (continuity)

A **Story Codex** is the cast of one book, declared by the author in labelled sections —
GraphRAG's shape without its dishonest part (the engine runs no LLM, so it doesn't fake
entity extraction from prose; you declare, it indexes):

```
[ตัวละคร] / [CHARACTERS]
อนันต์: นักสืบ กลัวความมืด
มาลี: น้องสาว
[สถานที่] / [PLACES]
กรุงเทพเก่า: ย่านที่เรื่องเกิด
[สิ่งของ] / [ITEMS]
กุญแจทองคำ: เปิดห้องใต้ดิน
[ความสัมพันธ์] / [RELATIONS]
อนันต์ - มาลี: พี่น้อง          # undirected
อนันต์ -> เสือ: ตามล่า           # directed
```

From that one declaration (`config.storyBible`) the engine derives:

- **book digest** ≈ GraphRAG *global* view → injected into the master prompt;
- **per-chapter local subgraph** ≈ GraphRAG *local search* → only entities appearing in a
  chapter's beat (+ 1-hop neighbours) are injected into that chapter's prompt;
- **audit** (`codexAudit`) → check a draft: present / misspelled (`withinOneEdit` /
  `thaiMarkVariant`) / not-referenced;
- **graph** (`codexMermaid`) → the declared relations as Mermaid;
- **Saga** (`analyzeSaga`) → across an ordered series of codices: who is introduced /
  carried / dropped per book, plus the backbone (entities in ≥2 books).

All of these are surfaced in the web analyzer (`CodexView`, `SagaView`) and the CLI.
Nothing is injected when no codex is declared, so existing prompt snapshots stay byte-identical.

**Entry-writing rules** (converged practice across NovelAI/SillyTavern/Novelcrafter docs,
plus positioning research):
- Phrase facts **positively** ("ตาบอด", never "มองไม่เห็น") — negations leak into prose.
- Terse standalone facts, not prose; start small and extend later.
- Secrets that must not surface in the text yet belong in `รู้แล้ว:` (knowledge lock),
  not in a character's description.
- Where possible, echo the wording your chapters actually use — models lose reference
  material fastest when it shares no vocabulary with the scene (NoLiMa, arXiv:2502.05167).
- The digest deliberately puts hard constraints (status/knowledge/threads) BEFORE the
  cast list: instruction-following research shows earlier rules are obeyed more reliably
  (IFScale, arXiv:2507.11538).
- Anti-drift is architectural here: every chapter gets a fresh full prompt, which is the
  "re-anchor near the generation point" pattern practitioner tools implement with
  Author's-Note injection — no extra mechanism needed.

## File map

**Generation**
| File | Responsibility |
|---|---|
| `types.ts` | Shared types (`BookConfig`, `Architecture`, `GeneratedPrompt`, …) |
| `book-types.ts` | `BOOK_TYPES` registry (8 types) + `isFictionType` |
| `standards.ts` | Quality standards, writing rules, citation guide, checklists |
| `context.ts` · `architecture.ts` | Per-type global context + architecture (acts/tension/beats, chapter plans) |
| `core-prompts.ts` · `th.ts` | Master / chapter / overview / analysis / front·back-matter prompts (EN + native Thai) |
| `modules.ts` | 61 optional module builders across 10 groups (`MODULE_CATALOG` / `MODULE_GROUPS` / `defaultGroupsFor`) |
| `thai-structures.ts` | Authentic Thai/Asian narrative structures (kishōtenketsu, จักร ๆ วงศ์ ๆ, ชาดก, …) |
| `starter.ts` | Guided starter sequence/groups |
| `engine.ts` | Public **barrel** — re-exports everything + `generateAllPrompts` orchestrator |

**Analysis (deterministic, no LLM)**
| File | Responsibility |
|---|---|
| `thai-analyzer.ts` · `prose-analyzer.ts` | Thai / English manuscript analyzers + tokenizers |
| `sensory.ts` · `consistency.ts` · `radar.ts` | Sensory density · consistency ledger + story bible · continuity radar |
| `relationships.ts` · `narrative.ts` | Co-occurrence graph · character presence / pacing / motifs |
| `rename.ts` · `register.ts` · `translation.ts` | Cross-chapter rename · Thai register (RI spellings) · Thai→EN term check |
| `epistemics.ts` | The signal registry + refused constructs — the theory of knowledge, in code |
| `router.ts` | อาการ → โมดูล: an ordered keyword ladder (R1–R20, R0 fallback) that turns a writer's own description of the problem into modules to open. Prints the matched keywords, lists competing rungs, returns nothing rather than force-fitting (`rush route "<อาการ>"`) |

**Continuity** — `codex.ts` · `saga.ts` · `outline.ts`
**Publishing** — `kdp.ts` (trim/page math) · `competitive.ts` (capability matrix)
**Infra/util** — `cli.ts` · `chapters.ts` · `epub.ts` · `text-util.ts` · `aho-corasick.ts` · `symspell.ts` · `sync.ts` · `plugins.ts` · `llm-provider.ts`

Import everything from `@/lib/rush-engine/engine`. The dependency graph is acyclic
(leaf files `types`/`book-types`/`standards` don't import the barrel).

## Entry point

```ts
import { generateAllPrompts, defaultGroupsFor } from "@/lib/rush-engine/engine";

const pack = generateAllPrompts(config, defaultGroupsFor(config.type));
// pack: GeneratedPrompt[] — { id, group, name, description, usage, prompt }
```

- `config.promptLanguage === "th"` → native Thai pack (no regex post-processing).
- `config.storyBible` → parsed into the Story Codex + injected as source-of-truth STATE.
- `config.outline` → threaded into each chapter prompt; `config.structure` → per-chapter beat.

## Craft module index (one question each — keep it orthogonal)

Every craft module answers ONE question no other module answers. Before adding
a craft module, find your question here; if a row already answers it, extend
that module instead of adding a sibling.

| Module | The one question it answers |
|---|---|
| `GENRE_CORE` | What promise does this genre make to its reader? |
| `STRUCTURE` | How is the whole book shaped? (see also `thai-structures.ts` for per-chapter beats) |
| `VOICE_SHEET` | How does each character speak distinctly? |
| `CHAR_ARC` | How does a character change? (Lie-vs-Truth) |
| `PSYCH_ARC` | How does a *relationship* change believably? (attachment, earned security, repair) |
| `WORLD_CODEX` | What is true about this world? |
| `SCENE` | How is one dramatic unit built? (Scene/Sequel + MRU) |
| `QUIET_SCENE` | How does a low-dialogue scene carry weight? (prosody, staged co-regulation, distance/timing/objects, quiet repair) |
| `DIALOGUE` | How does dialogue sharpen? (action beats, subtext, trimmed tags) |
| `HOOK_CRAFT` | How does a chapter END? (hook typology + restraint: almost-moment, what-they-don't-do, body-betrays-last, micro-conflict) |
| `ANTI_SAFE` | How do we break tidy AI defaults? |
| `SENSORY` | Are the five senses actually on the page? |
| `IMMERSION` | How close is the reader to the POV? (deep POV, Gardner psychic-distance ladder) |
| `THAI_SOUND` | How does the Thai *sound* layer work? (คำซ้อนเพื่อเสียง, สัมผัสใน, คำซ้ำ, register) |
| `HARD_SF` | Does the sci-fi premise survive physics? (seven constraints → the scene each one forces) |

Topics that intentionally do NOT get their own module (they live inside the
rows above): body language & restraint → `HOOK_CRAFT`/`QUIET_SCENE`; prosody &
co-regulation & silence → `QUIET_SCENE`; subtext → `DIALOGUE`; repair &
attachment → `PSYCH_ARC`; emotional sensory anchoring → `SENSORY` + the
high-tension chapter block in `th.ts`. Splitting these out would give users a
dozen 80%-overlapping craft modules and no way to choose.

## Adding a module

1. Add an EN builder `(config) => string` in `modules.ts` and register it in
   `MODULE_CATALOG` with an `id`, `group`, `name`, `description`, `usage`.
2. Add the Thai builder to `TH_MODULES` and metadata to `TH_META` in `th.ts`.
3. Add an assertion (count/content) to `engine.test.ts`.

## Testing

```bash
npm test              # vitest run — 318 tests: unit + snapshots + route tests
npm run verify        # typecheck · lint · test · build — the one gate (CI runs the same)
```

Snapshots in `__snapshots__/` lock the exact prompt output; a behavior change must update
them intentionally (`vitest run -u`). CI runs `npm run verify` on push/PR
(`.github/workflows/web-tests.yml`).

## Persistence

Projects are stored as `RushProject` (config only — prompts derive). Saving snapshots a
`RushProjectVersion` (history). Public sharing uses `shareToken` + `visibility`. Run
`npm run db:push` after schema changes.
