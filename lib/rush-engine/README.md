# Rush Engine

A pure, isomorphic engine that generates a complete **prompt pack** for authoring
books of any type. The output is copyable prompts to run in any LLM — the engine
makes **no LLM calls itself**. Used by the `/rush` UI and the `/api/rush/*` routes.

## Files

| File | Responsibility |
|---|---|
| `types.ts` | Shared types (`BookConfig`, `Architecture`, `GeneratedPrompt`, `PromptGroup`, …) |
| `book-types.ts` | `BOOK_TYPES` registry (8 types) + `isFictionType` |
| `standards.ts` | Quality standards, writing rules, citation guide, checklists, analysis metrics |
| `context.ts` | Per-type global-context builders + `buildGlobalContext` |
| `architecture.ts` | Per-type architecture (acts/tension/beats, chapter plans) + `buildArchitecture` |
| `core-prompts.ts` | Master, chapter, overview, analysis, revision, front/back matter, feedback (EN) |
| `modules.ts` | 22 optional module builders + `MODULE_CATALOG` / `MODULE_GROUPS` / `defaultGroupsFor` |
| `th.ts` | Native Thai builders + Thai metadata (used when `promptLanguage === "th"`) |
| `engine.ts` | Public **barrel** — re-exports everything + `generateAllPrompts` orchestrator |

Import everything from `@/lib/rush-engine/engine`. The dependency graph is acyclic
(leaf files `types`/`book-types`/`standards` don't import the barrel).

## Entry point

```ts
import { generateAllPrompts, defaultGroupsFor } from "@/lib/rush-engine/engine";

const pack = generateAllPrompts(config, defaultGroupsFor(config.type));
// pack: GeneratedPrompt[] — { id, group, name, description, usage, prompt }
```

- `config.promptLanguage === "th"` → native Thai pack (no regex post-processing).
- `config.storyBible` → injected into every chapter prompt as source-of-truth STATE.
- `config.outline` → threaded into each chapter prompt.

## Adding a module

1. Add an EN builder `(config) => string` in `modules.ts` and register it in
   `MODULE_CATALOG` with an `id`, `group`, `name`, `description`, `usage`.
2. Add the Thai builder to `TH_MODULES` and metadata to `TH_META` in `th.ts`.
3. Add an assertion (count/content) to `engine.test.ts`.

## Testing

```bash
npm test          # vitest run — unit + snapshots (engine) + route tests
npm run test:watch
```

Snapshots in `__snapshots__/` lock the exact prompt output; a behavior change
must update them intentionally (`vitest run -u`). CI runs the suite + `tsc` on
push/PR (`.github/workflows/web-tests.yml`).

## Persistence

Projects are stored as `RushProject` (config only — prompts derive). Saving snapshots
a `RushProjectVersion` (history). Public sharing uses `shareToken` + `visibility`.
Run `npm run db:push` after schema changes.
