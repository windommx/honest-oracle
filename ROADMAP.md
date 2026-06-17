# Rush Engine — Product Positioning & Roadmap

## The decision (positioning)

**Rush Engine is a prompt platform, not an AI writer.** It generates a complete,
copyable **prompt pack** for authoring books of any type, to run in any LLM
(ChatGPT / Claude / Gemini). It deliberately makes **no server-side LLM calls**.

This keeps the product:

- **Model-agnostic** — no lock-in; works with future models.
- **Zero token cost** to operate; one platform, any LLM.
- **Transparent** — every prompt is editable, nothing is a black box.
- **Thai-native** — the strongest moat (native Thai prompts + the client-side
  Thai Analyzer), which frontier-model tools don't match.

### What it is

- 8 book types · 8 core prompts + 32 optional modules in 7 groups.
- Automatic continuity (`<<<STATE>>>` protocol + editable Story Bible).
- Native Thai prompt mode + **Thai Analyzer** (real in-browser tokenizer:
  word/echo/near-repeat/AI-tell checks — no LLM).
- Save / share / version projects (account-gated).

### What it is NOT (on purpose)

- It does **not** run an agent loop, call LLMs, or host tool execution.
- The **Agent Pack** group outputs *system prompts* for a multi-agent setup you
  run elsewhere (e.g. Claude Projects). It is not executed inside this app.

Anything requiring a runtime — executing agents, blocking hooks, MCP servers,
server-side LLM proxying — is **out of scope for Rush Engine** and belongs to a
separate track below.

---

## Rush Studio — the runtime track (future, separate product)

The "Novel Studio" fusion architecture (5-layer agent system + swarm + runtime)
is a genuinely different product: a **hosted writing system** that *executes* the
workflow rather than handing the user prompts. It needs a backend, server-side
API keys, and orchestration — i.e. the thing Rush Engine deliberately removed.

Capturing it here so the vision is a deliberate roadmap, not scope-creep.

### Layer mapping (Novel Studio → Rush Studio)

| Layer | Concept | Status / home |
|---|---|---|
| Memory | `NOVEL_STUDIO.md` Constraint DNA | ✅ Partly in Rush Engine (master prompt + Anti-Safe / Quality Gate modules) |
| Skills | `/skills/*.md` trigger-loaded knowledge | ✅ Rush Engine modules are the prompt-side of this |
| Hooks | quality gates that **block** actions | ⛔ Runtime — needs an execution layer |
| Subagents | orchestrator + swarm **execution** | ⛔ Runtime — Rush Engine ships the *prompts*, not the loop |
| Plugins | MCP servers (storage/export/reader) | ⛔ Runtime |
| Thai NLP | tokenizer / echoes / proofread | ✅ Shipped as the Thai Analyzer tool |

### Phased plan (only if/when Rush Studio is greenlit)

1. **Runtime spine** — server LLM proxy (key server-side), project DB, the
   5-stage state machine (Plan → Write → Studio → Publish → Test).
2. **Swarm executor** — orchestrator that runs the Agent Pack prompts as real
   waves (research → bible → architect → writer → critic) with a critique loop.
3. **Hooks (enforcing)** — continuity / sensory / anti-safe gates that actually
   block phase transitions, not just advise.
4. **Plugins** — export (epub/pdf/docx) + reader-feedback links via MCP/servers.
5. **Studio dashboard** — the 5-zone analysis surface (reuses the Thai Analyzer).

### When to start it

Start Rush Studio only when there's demand for an **end-to-end hosted writer**
(not a prompt toolkit) and a willingness to own server cost + API keys. Until
then, every Rush Engine module is reusable inside it — Rush Engine is the
prompt/knowledge layer Rush Studio would orchestrate.

---

## Near-term backlog (Rush Engine, in-scope)

- Split `page.tsx` further (sidebar/output) + more component tests.
- Expand the Thai Analyzer (proximity windows, sentence-length, readability).
- Consolidate the module definition into one source of truth (EN + TH + meta)
  to remove the 3-file edit footprint (guarded by tests today).
- `npm run db:push` is required on deploy for the project/share/version tables.
