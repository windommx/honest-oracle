// ╔══════════════════════════════════════════════════════════════════╗
// ║  STORY CODEX — a GraphRAG-inspired continuity graph, done HONESTLY.║
// ║                                                                    ║
// ║  GraphRAG (Microsoft) indexes a corpus by having an LLM extract    ║
// ║  entities + relationships into a graph, then serves global         ║
// ║  (community) and local (entity-neighbourhood) views at query time. ║
// ║  We keep the *shape* of that idea but refuse the dishonest part:    ║
// ║  this engine is pure/deterministic and does NOT run an LLM, so we   ║
// ║  do not pretend to auto-extract entities from freeform prose        ║
// ║  (unreliable ⇒ fake capability). Instead the AUTHOR declares the    ║
// ║  graph in labelled sections (the "index"), and we compute:          ║
// ║    • a whole-book DIGEST  ≈ GraphRAG global/community view          ║
// ║    • a per-chapter LOCAL subgraph ≈ GraphRAG local search           ║
// ║  Entities that actually appear in a chapter pull in their 1-hop     ║
// ║  neighbours, and that subgraph is injected as continuity truth.     ║
// ║                                                                    ║
// ║  No declarations → empty codex → nothing injected. Zero magic.      ║
// ╚══════════════════════════════════════════════════════════════════╝

import { withinOneEdit, thaiMarkVariant } from "./consistency";
import { tokenizeThai } from "./thai-analyzer";
import { tokenizeProse } from "./prose-analyzer";

export type CodexEntityType = "character" | "place" | "item";
export interface CodexEntity {
  name: string;
  type: CodexEntityType;
  desc: string;
  /** Optional declared character depth (Want vs Need, flaw, ghost, speech voice).
   *  Author-declared only — never inferred. */
  want?: string;
  need?: string;
  flaw?: string;
  ghost?: string;
  voice?: string;
  /** Declared continuity status (e.g. "ตายในบท 5", "หายตัว") — powers the
   *  dead-but-present audit flag. */
  status?: string;
  /** Signature phrases this character DOES say (comma-separated). */
  catchphrase?: string;
  /** Words/phrases this character must NEVER say (comma-separated) — powers the
   *  deterministic voice guard in codexAudit. */
  forbidden?: string;
  /** What this character already KNOWS (comma-separated) — powers the
   *  knowledge-lock block: others must not know it without an on-page scene. */
  knows?: string;
}
export interface CodexRelation {
  from: string;
  to: string;
  kind: string;
  directed: boolean;
}
export type ThreadPriority = "low" | "medium" | "high" | "critical";
/** An open plot thread (ปมค้าง) the author has promised to pay off. */
export interface CodexThread {
  desc: string;
  priority: ThreadPriority;
}
export interface Codex {
  entities: CodexEntity[];
  relations: CodexRelation[];
  threads: CodexThread[];
}

// Section headers (bilingual). A line like "[CHARACTERS]", "ตัวละคร:", "CAST"
// switches the active section. Only lines INSIDE a recognised section are parsed,
// so freeform story-bible prose (no headers) yields an empty codex untouched.
const SECTION: Array<{ re: RegExp; type: CodexEntityType | "relation" | "thread" }> = [
  { re: /^\[?\s*(characters?|cast|ตัวละคร)\s*\]?\s*:?\s*$/i, type: "character" },
  { re: /^\[?\s*(places?|locations?|setting|สถานที่|ฉาก)\s*\]?\s*:?\s*$/i, type: "place" },
  { re: /^\[?\s*(items?|objects?|artifacts?|สิ่งของ|ไอเทม|วัตถุ)\s*\]?\s*:?\s*$/i, type: "item" },
  { re: /^\[?\s*(relations?|relationships?|ความสัมพันธ์)\s*\]?\s*:?\s*$/i, type: "relation" },
  { re: /^\[?\s*(threads?|open\s*threads?|ปมค้าง|ปมที่ค้าง|เส้นเรื่องค้าง)\s*\]?\s*:?\s*$/i, type: "thread" },
];

// Character-depth trait keys (bilingual). A line "อยาก: หาน้องสาว" following a
// character attaches to that character instead of declaring a new entity.
type TraitKey = "want" | "need" | "flaw" | "ghost" | "voice" | "status" | "catchphrase" | "forbidden" | "knows";
const TRAITS: Array<{ re: RegExp; key: TraitKey }> = [
  { re: /^(อยาก|want)$/i, key: "want" },
  { re: /^(ต้องการจริง|ปมจริง|need)$/i, key: "need" },
  { re: /^(จุดอ่อน|ปมด้อย|flaw)$/i, key: "flaw" },
  { re: /^(แผลใจ|ghost)$/i, key: "ghost" },
  { re: /^(เสียง|วิธีพูด|voice)$/i, key: "voice" },
  { re: /^(สถานะ|status)$/i, key: "status" },
  { re: /^(คำติดปาก|catchphrases?)$/i, key: "catchphrase" },
  { re: /^(คำต้องห้าม|ห้ามพูด|forbidden)$/i, key: "forbidden" },
  { re: /^(รู้แล้ว|รู้ความลับ|knows)$/i, key: "knows" },
];

// Thread priority keywords (bilingual). "desc: สูง" → high.
const PRIORITY: Array<{ re: RegExp; p: ThreadPriority }> = [
  { re: /^(critical|วิกฤต)$/i, p: "critical" },
  { re: /^(high|สูง)$/i, p: "high" },
  { re: /^(medium|กลาง|ปกติ)$/i, p: "medium" },
  { re: /^(low|ต่ำ)$/i, p: "low" },
];

/** Parse an author-declared story bible into a continuity graph. Deterministic;
 *  no declarations (or no recognised sections) → empty graph. */
export function parseCodex(text: string | undefined): Codex {
  const entities: CodexEntity[] = [];
  const relations: CodexRelation[] = [];
  const threads: CodexThread[] = [];
  if (!text) return { entities, relations, threads };

  const seen = new Set<string>(); // dedupe entity names (case-insensitive)
  let section: CodexEntityType | "relation" | "thread" | null = null;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().replace(/^[-•*]\s+/, ""); // tolerate list bullets
    if (!line) continue;

    const hdr = SECTION.find((s) => s.re.test(line));
    if (hdr) { section = hdr.type; continue; }
    if (!section) continue;

    if (section === "relation") {
      // "A -> B: kind" (directed) or "A - B: kind" (undirected). kind optional.
      const m = line.match(/^(.+?)\s*(->|—>|→|-|–|—)\s*(.+?)\s*(?::\s*(.*))?$/);
      if (m) {
        const from = m[1].trim();
        const to = m[3].trim();
        if (from && to) {
          const directed = /->|—>|→/.test(m[2]);
          relations.push({ from, to, kind: (m[4] ?? "").trim(), directed });
        }
      }
      continue;
    }

    if (section === "thread") {
      // "คำอธิบายปม: สูง" — text after the LAST colon is a priority keyword if it
      // matches; otherwise the whole line is the description (default: medium).
      const lastColon = line.lastIndexOf(":");
      const tail = lastColon >= 0 ? line.slice(lastColon + 1).trim() : "";
      const pr = PRIORITY.find((x) => x.re.test(tail));
      const desc = (pr ? line.slice(0, lastColon) : line).trim();
      if (desc) threads.push({ desc, priority: pr?.p ?? "medium" });
      continue;
    }

    // Entity line: "Name: description" or just "Name".
    const colon = line.indexOf(":");
    const name = (colon >= 0 ? line.slice(0, colon) : line).trim();
    const desc = colon >= 0 ? line.slice(colon + 1).trim() : "";
    if (!name) continue;

    // Depth trait for the character above ("อยาก: …", "voice: …") — attaches to
    // the last character instead of declaring an entity named "อยาก".
    if (section === "character" && colon >= 0 && desc) {
      const trait = TRAITS.find((t) => t.re.test(name));
      const last = entities[entities.length - 1];
      if (trait && last && last.type === "character") {
        if (!last[trait.key]) last[trait.key] = desc;
        continue;
      }
    }

    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    entities.push({ name, type: section, desc });
  }

  return { entities, relations, threads };
}

export function hasCodex(codex: Codex): boolean {
  return codex.entities.length > 0 || codex.threads.length > 0;
}

export interface LocalCodex {
  entities: CodexEntity[];
  relations: CodexRelation[];
}

/** GraphRAG-style local view: entities whose name appears in `text`, plus their
 *  1-hop neighbours and every relation touching a mentioned entity. */
export function codexLocal(codex: Codex, text: string): LocalCodex {
  if (!hasCodex(codex) || !text) return { entities: [], relations: [] };
  const hay = text.toLowerCase();
  const mentioned = new Set(
    codex.entities.filter((e) => hay.includes(e.name.toLowerCase())).map((e) => e.name)
  );
  if (mentioned.size === 0) return { entities: [], relations: [] };

  const relations = codex.relations.filter((r) => mentioned.has(r.from) || mentioned.has(r.to));
  const neighbours = new Set<string>(mentioned);
  relations.forEach((r) => { neighbours.add(r.from); neighbours.add(r.to); });
  const entities = codex.entities.filter((e) => neighbours.has(e.name));
  return { entities, relations };
}

// ── Rendering (Thai + English) ──────────────────────────────────────

const TYPE_TH: Record<CodexEntityType, string> = { character: "ตัวละคร", place: "สถานที่", item: "สิ่งของ" };
const TYPE_EN: Record<CodexEntityType, string> = { character: "Character", place: "Place", item: "Item" };

function renderRelation(r: CodexRelation): string {
  const arrow = r.directed ? "→" : "—";
  const kind = r.kind ? `(${r.kind})` : "";
  return `${r.from} ${arrow}${kind}${arrow} ${r.to}`;
}

const hasDepth = (e: CodexEntity): boolean =>
  !!(e.want || e.need || e.flaw || e.ghost || e.voice || e.status || e.catchphrase || e.forbidden || e.knows);

/** "อยาก: X · ต้องการจริง: Y …" — only declared traits, in a fixed order.
 *  skipVoiceVocab leaves catchphrase/forbidden out (the digest renders those as
 *  contrastive ✓/✗ lines instead, which steer a model better than flat labels). */
function renderDepth(e: CodexEntity, lang: "th" | "en", skipVoiceVocab = false): string {
  const th = lang === "th";
  const parts: string[] = [];
  if (e.want) parts.push(`${th ? "อยาก" : "want"}: ${e.want}`);
  if (e.need) parts.push(`${th ? "ต้องการจริง" : "need"}: ${e.need}`);
  if (e.flaw) parts.push(`${th ? "จุดอ่อน" : "flaw"}: ${e.flaw}`);
  if (e.ghost) parts.push(`${th ? "แผลใจ" : "ghost"}: ${e.ghost}`);
  if (e.voice) parts.push(`${th ? "เสียง" : "voice"}: ${e.voice}`);
  if (e.status) parts.push(`${th ? "สถานะ" : "status"}: ${e.status}`);
  if (!skipVoiceVocab && e.catchphrase) parts.push(`${th ? "คำติดปาก" : "catchphrases"}: ${e.catchphrase}`);
  if (!skipVoiceVocab && e.forbidden) parts.push(`${th ? "คำต้องห้าม" : "never says"}: ${e.forbidden}`);
  if (e.knows) parts.push(`${th ? "รู้แล้ว" : "knows"}: ${e.knows}`);
  return parts.join(" · ");
}

/** Contrastive voice lines for the digest: ✓ what they DO say, ✗ what they never
 *  say — declared examples only, shown side by side (steers voice better than a
 *  description alone). "" when neither is declared. */
function renderContrastiveVoice(e: CodexEntity, lang: "th" | "en"): string {
  if (!e.catchphrase && !e.forbidden) return "";
  const th = lang === "th";
  const L: string[] = [];
  if (e.catchphrase) L.push(`  ✓ ${th ? "พูดแบบนี้" : "does say"}: ${e.catchphrase}`);
  if (e.forbidden) L.push(`  ✗ ${th ? "ห้ามพูด" : "never says"}: ${e.forbidden}`);
  return L.join("\n") + "\n";
}

/** Knowledge-lock block: who already knows what. Others must not "just know" it —
 *  information travels only through on-page scenes. "" when nothing declared. */
function renderKnowledgeLock(codex: Codex, lang: "th" | "en"): string {
  const knowers = codex.entities.filter((e) => e.knows);
  if (!knowers.length) return "";
  const th = lang === "th";
  let p = th ? `การควบคุมข้อมูล (ใครรู้อะไรแล้ว):\n` : `Knowledge control (who already knows what):\n`;
  p += knowers.map((e) => `• ${e.name} ${th ? "รู้แล้ว" : "knows"}: ${e.knows}`).join("\n") + "\n";
  p += th
    ? `กฎ: ตัวละครอื่นยังไม่รู้ข้อมูลเหล่านี้ ห้าม "รู้เอง" — ข้อมูลเดินทางผ่านฉากบนหน้ากระดาษเท่านั้น และผู้รู้ต้องมีปฏิกิริยาที่สอดคล้องกับสิ่งที่รู้\n`
    : `RULE: other characters do NOT know these yet and must never "just know" — information travels only through on-page scenes, and knowers must react consistently with what they know.\n`;
  return p;
}

/** Explicit status constraints for the digest: dead/missing characters must not
 *  walk into the present timeline unannounced. "" when none declared. */
function renderStatusConstraints(codex: Codex, lang: "th" | "en"): string {
  const gone = codex.entities.filter((e) => e.status && GONE.test(e.status));
  if (!gone.length) return "";
  const th = lang === "th";
  let p = th ? `ข้อจำกัดสถานะ:\n` : `Status constraints:\n`;
  p += gone
    .map((e) =>
      th
        ? `• ${e.name} — สถานะ "${e.status}": ห้ามปรากฏมีชีวิตในไทม์ไลน์ปัจจุบันหลังจุดนั้น การย้อนอดีต/ความฝัน/ผี ต้องบอกผู้อ่านให้ชัด`
        : `• ${e.name} — status "${e.status}": must not appear alive in the present timeline past that point; flashbacks/dreams/ghosts must be clearly signalled`
    )
    .join("\n") + "\n";
  return p;
}

const PRIORITY_TH: Record<ThreadPriority, string> = { critical: "วิกฤต", high: "สูง", medium: "กลาง", low: "ต่ำ" };

/** "ปมที่ค้าง" block for digests (bilingual). "" if no threads. */
function renderThreads(codex: Codex, lang: "th" | "en"): string {
  if (!codex.threads.length) return "";
  const th = lang === "th";
  const order: ThreadPriority[] = ["critical", "high", "medium", "low"];
  const sorted = [...codex.threads].sort((a, b) => order.indexOf(a.priority) - order.indexOf(b.priority));
  let p = th ? `ปมที่ค้าง (${codex.threads.length}):\n` : `Open threads (${codex.threads.length}):\n`;
  p += sorted.map((t) => `• [${th ? PRIORITY_TH[t.priority] : t.priority.toUpperCase()}] ${t.desc}`).join("\n") + "\n";
  p += th
    ? `ปมระดับสูง/วิกฤตต้องถูกแตะหรือพัฒนาในบทที่เหมาะสม — ห้ามทิ้งเงียบ และห้ามปิดปมนอกฉาก\n`
    : `High/critical threads must be touched or advanced in an appropriate chapter — never silently dropped, never resolved off-page.\n`;
  return p;
}

/** Whole-book codex block ≈ GraphRAG global/community view (Thai). "" if empty.
 *  ORDER IS EVIDENCE-DRIVEN (IFScale, arXiv:2507.11538 — primacy bias: earlier
 *  rules are followed more reliably): hard constraints (status / knowledge /
 *  threads) come FIRST, reference material (cast/relations) after. */
export function codexDigestTh(codex: Codex): string {
  if (!hasCodex(codex)) return "";
  let p = `═══ Codex ของหนังสือ (สารบบต่อเนื่องทั้งเล่ม) ═══\n`;
  p += renderStatusConstraints(codex, "th");
  p += renderKnowledgeLock(codex, "th");
  p += renderThreads(codex, "th");
  (["character", "place", "item"] as CodexEntityType[]).forEach((t) => {
    const es = codex.entities.filter((e) => e.type === t);
    if (es.length) p += `${TYPE_TH[t]} (${es.length}): ` + es.map((e) => e.desc ? `${e.name} — ${e.desc}` : e.name).join(" · ") + "\n";
  });
  const deep = codex.entities.filter(hasDepth);
  if (deep.length) {
    p += `เจาะลึกตัวละคร:\n` + deep.map((e) => {
      const inline = renderDepth(e, "th", true);
      const line = inline ? `• ${e.name} — ${inline}` : `• ${e.name}`;
      const cv = renderContrastiveVoice(e, "th");
      return cv ? `${line}\n${cv.trimEnd()}` : line;
    }).join("\n") + "\n";
  }
  if (codex.relations.length) p += `ความสัมพันธ์ (${codex.relations.length}):\n` + codex.relations.map((r) => `• ${renderRelation(r)}`).join("\n") + "\n";
  p += `กฎ: ถือ Codex นี้เป็นแหล่งความจริง คงชื่อ/ลักษณะ/ความสัมพันธ์ให้สอดคล้องตลอดเล่ม ห้ามขัดแย้ง`;
  if (deep.some((e) => e.voice)) p += ` ทุกบทพูดของตัวละครที่ระบุ "เสียง" ต้องคงเอกลักษณ์นั้น`;
  if (deep.some((e) => e.forbidden)) p += ` สำหรับคำต้องห้าม (✗): แทนที่จะพยายาม "ไม่พูด" ให้เลือกใช้คำติดปาก/สำนวนตามเสียงที่ประกาศ (✓) แทนเสมอ`;
  p += `\n`;
  return p;
}

/** Whole-book codex block (English). "" if empty. Constraint-first ordering —
 *  see codexDigestTh for the evidence rationale. */
export function codexDigestEn(codex: Codex): string {
  if (!hasCodex(codex)) return "";
  let p = `═══ STORY CODEX (book-wide continuity index) ═══\n`;
  p += renderStatusConstraints(codex, "en");
  p += renderKnowledgeLock(codex, "en");
  p += renderThreads(codex, "en");
  (["character", "place", "item"] as CodexEntityType[]).forEach((t) => {
    const es = codex.entities.filter((e) => e.type === t);
    if (es.length) p += `${TYPE_EN[t]}s (${es.length}): ` + es.map((e) => e.desc ? `${e.name} — ${e.desc}` : e.name).join(" · ") + "\n";
  });
  const deep = codex.entities.filter(hasDepth);
  if (deep.length) {
    p += `Character depth:\n` + deep.map((e) => {
      const inline = renderDepth(e, "en", true);
      const line = inline ? `• ${e.name} — ${inline}` : `• ${e.name}`;
      const cv = renderContrastiveVoice(e, "en");
      return cv ? `${line}\n${cv.trimEnd()}` : line;
    }).join("\n") + "\n";
  }
  if (codex.relations.length) p += `Relations (${codex.relations.length}):\n` + codex.relations.map((r) => `• ${renderRelation(r)}`).join("\n") + "\n";
  p += `RULE: treat this codex as source of truth — keep names/traits/relations consistent, never contradict it.`;
  if (deep.some((e) => e.voice)) p += ` Every line of dialogue from a character with a declared "voice" must keep that voice.`;
  if (deep.some((e) => e.forbidden)) p += ` For never-says words (✗): rather than trying to "not say" them, always reach for the declared catchphrases/voice (✓) instead.`;
  p += `\n`;
  return p;
}

/** Per-chapter local subgraph block (Thai) for entities appearing in `text`. "" if none. */
export function codexLocalTh(codex: Codex, text: string): string {
  const local = codexLocal(codex, text);
  if (local.entities.length === 0) return "";
  let p = `═══ Codex ต่อเนื่อง (เฉพาะบทนี้) ═══\nปรากฏในบทนี้:\n`;
  p += local.entities.map((e) => `• ${e.name} (${TYPE_TH[e.type]})${e.desc ? ` — ${e.desc}` : ""}${hasDepth(e) ? ` | ${renderDepth(e, "th")}` : ""}`).join("\n") + "\n";
  if (local.relations.length) p += `ความสัมพันธ์ที่เกี่ยวข้อง:\n` + local.relations.map((r) => `• ${renderRelation(r)}`).join("\n") + "\n";
  p += `คงลักษณะและความสัมพันธ์เหล่านี้ให้ตรงกับ Codex\n`;
  return p;
}

/** Per-chapter local subgraph block (English). "" if none. */
export function codexLocalEn(codex: Codex, text: string): string {
  const local = codexLocal(codex, text);
  if (local.entities.length === 0) return "";
  let p = `═══ CODEX (this chapter) ═══\nAppears here:\n`;
  p += local.entities.map((e) => `• ${e.name} (${TYPE_EN[e.type]})${e.desc ? ` — ${e.desc}` : ""}${hasDepth(e) ? ` | ${renderDepth(e, "en")}` : ""}`).join("\n") + "\n";
  if (local.relations.length) p += `Relevant relations:\n` + local.relations.map((r) => `• ${renderRelation(r)}`).join("\n") + "\n";
  p += `Keep these traits and relations consistent with the codex.\n`;
  return p;
}

// ── Visualisation — the declared graph as Mermaid (draws only what's declared) ─

/** Render the codex as a Mermaid graph: nodes shaped/coloured by entity type,
 *  edges labelled by relation kind (→ directed, — undirected). "" if empty.
 *  Undeclared relation endpoints become plain nodes so no edge is dropped. */
export function codexMermaid(codex: Codex): string {
  if (codex.entities.length === 0) return ""; // threads have no graph shape
  const id = new Map<string, string>();
  codex.entities.forEach((e, i) => id.set(e.name.toLowerCase(), `n${i}`));
  // Neutralise every Mermaid-significant char (unquoted edge labels are the strict
  // case: & is its multi-node operator, <>#;|(){}[] all have syntax meaning). Fall
  // back to "?" so a name of only-special chars never emits an empty label.
  const esc = (s: string) => s.replace(/"/g, "'").replace(/[[\]{}()|&<>#;]/g, " ").replace(/\s+/g, " ").trim() || "?";

  const adhoc: Array<{ id: string; label: string }> = [];
  let extra = 0;
  const idOf = (name: string): string => {
    const k = name.toLowerCase();
    const found = id.get(k);
    if (found) return found;
    const nid = `x${extra++}`;
    id.set(k, nid);
    adhoc.push({ id: nid, label: esc(name) });
    return nid;
  };

  // Build edges first so ad-hoc endpoints are discovered before we emit nodes.
  const edges: string[] = [];
  for (const r of codex.relations) {
    const a = idOf(r.from);
    const b = idOf(r.to);
    const arrow = r.directed ? "-->" : "---";
    edges.push(r.kind ? `  ${a} ${arrow}|${esc(r.kind)}| ${b}` : `  ${a} ${arrow} ${b}`);
  }

  const L = ["graph LR"];
  for (const e of codex.entities) {
    const n = id.get(e.name.toLowerCase())!;
    const label = esc(e.name);
    const shape = e.type === "place" ? `(["${label}"])` : e.type === "item" ? `{{"${label}"}}` : `["${label}"]`;
    L.push(`  ${n}${shape}:::${e.type}`);
  }
  for (const a of adhoc) L.push(`  ${a.id}["${a.label}"]:::unknown`);
  L.push(...edges);
  L.push("  classDef character fill:#c9a84c22,stroke:#c9a84c,color:#e6c86a;");
  L.push("  classDef place fill:#4c9ac922,stroke:#6bb0d8,color:#9fd0ea;");
  L.push("  classDef item fill:#9a4cc922,stroke:#b47cd8,color:#d0a8ea;");
  L.push("  classDef unknown stroke-dasharray:4,stroke:#888,color:#aaa;");
  return L.join("\n");
}

// ── Codex audit — deterministic continuity check of a DRAFT vs the codex ──────
//  The codex is the declared cast; a draft chapter is checked against it. Every
//  finding is a COUNT, never a 0–100 verdict. "Not referenced" is a signal, not
//  an error — an entity may simply not belong in this chapter.

/** The declared cast as a flat name list — feed straight into continuityRadar(). */
export function codexCanon(codex: Codex): string[] {
  return codex.entities.map((e) => e.name);
}

export interface CodexAudit {
  present: CodexEntity[];                              // named verbatim in the draft
  variants: Array<{ declared: string; found: string }>; // near-miss spelling in the draft
  missing: CodexEntity[];                              // neither present nor a near-miss
  /** Present in the draft while their declared status says dead/missing — could be
   *  a flashback or a ghost, so it's a SIGNAL to check, not an error. */
  statusConflicts: CodexEntity[];
  /** A declared คำต้องห้าม appears in the draft. We cannot attribute dialogue to a
   *  speaker deterministically, so this only says the word OCCURS — the writer
   *  checks who says it. */
  forbiddenHits: Array<{ name: string; word: string; count: number }>;
  /** High/critical threads whose keywords leave no trace in this draft — a
   *  HEURISTIC keyword match (Thai-aware tokenization), framed as "this chapter
   *  may not be its place", never "you forgot". matched/total are real counts. */
  threadsNoTrace: Array<{ desc: string; priority: ThreadPriority; matched: number; total: number }>;
  canonSize: number;
}

const GONE = /ตาย|เสียชีวิต|สิ้นชีวิต|หายตัว|สาบสูญ|dead|deceased|missing/i;

/** Check a draft against the codex, reusing the existing near-miss detectors
 *  (withinOneEdit for Latin, thaiMarkVariant for Thai). Pure/deterministic. */
export function codexAudit(codex: Codex, draft: string, lang: "th" | "en"): CodexAudit {
  const present: CodexEntity[] = [];
  const variants: Array<{ declared: string; found: string }> = [];
  const missing: CodexEntity[] = [];
  if (!hasCodex(codex) || !draft) {
    return { present, variants, missing: codex.entities.slice(), statusConflicts: [], forbiddenHits: [], threadsNoTrace: [], canonSize: codex.entities.length };
  }
  const hay = draft.toLowerCase();
  const tokens = lang === "th" ? tokenizeThai(draft) : tokenizeProse(draft);
  for (const e of codex.entities) {
    if (hay.includes(e.name.toLowerCase())) { present.push(e); continue; }
    const hit = tokens.find((t) =>
      lang === "th" ? thaiMarkVariant(e.name, t) : withinOneEdit(e.name.toLowerCase(), t.toLowerCase())
    );
    if (hit) variants.push({ declared: e.name, found: hit });
    else missing.push(e);
  }
  const statusConflicts = present.filter((e) => e.status && GONE.test(e.status));

  // Voice guard: count occurrences of each declared คำต้องห้าม in the draft.
  const forbiddenHits: Array<{ name: string; word: string; count: number }> = [];
  for (const e of codex.entities) {
    if (!e.forbidden) continue;
    for (const raw of e.forbidden.split(/[,、]/)) {
      const word = raw.trim();
      if (word.length < 2) continue;
      let count = 0;
      let idx = hay.indexOf(word.toLowerCase());
      while (idx !== -1) { count++; idx = hay.indexOf(word.toLowerCase(), idx + word.length); }
      if (count > 0) forbiddenHits.push({ name: e.name, word, count });
    }
  }
  // Thread-trace heuristic: does anything from a high/critical thread's wording
  // appear in this draft? Thai has no spaces between words, so the description is
  // TOKENIZED (not space-split) before matching. Content words only (≥4 chars);
  // a thread whose description yields no usable keywords is skipped, not flagged.
  const threadsNoTrace: CodexAudit["threadsNoTrace"] = [];
  for (const t of codex.threads) {
    if (t.priority !== "high" && t.priority !== "critical") continue;
    const words = (lang === "th" ? tokenizeThai(t.desc) : t.desc.toLowerCase().split(/[^a-z0-9ก-๙]+/))
      .filter((w) => w.length >= 4);
    if (!words.length) continue;
    const matched = words.filter((w) => hay.includes(w.toLowerCase())).length;
    if (matched === 0) threadsNoTrace.push({ desc: t.desc, priority: t.priority, matched, total: words.length });
  }

  return { present, variants, missing, statusConflicts, forbiddenHits, threadsNoTrace, canonSize: codex.entities.length };
}

/** Human-readable audit report (bilingual). Counts, not a verdict. */
export function formatCodexAudit(audit: CodexAudit, lang: "th" | "en"): string {
  const th = lang === "th";
  const L: string[] = [
    th
      ? `# codex audit — canon ${audit.canonSize} (นับได้ ไม่ใช่คำตัดสิน)`
      : `# codex audit — canon of ${audit.canonSize} (counts, not a verdict)`,
  ];
  L.push(
    th
      ? `ปรากฏในดราฟต์ (${audit.present.length}/${audit.canonSize}): ${audit.present.map((e) => e.name).join(", ") || "—"}`
      : `present in draft (${audit.present.length}/${audit.canonSize}): ${audit.present.map((e) => e.name).join(", ") || "—"}`
  );
  if (audit.statusConflicts.length) {
    L.push(
      "",
      th
        ? "⚠ สถานะขัดแย้ง — ประกาศว่าตาย/หายตัว แต่ปรากฏในดราฟต์ (ย้อนอดีต? ผี? หรือหลุด continuity?):"
        : "⚠ status conflict — declared dead/missing yet appears in the draft (flashback? ghost? or a continuity slip?):"
    );
    for (const e of audit.statusConflicts) L.push(`  ${e.name} — ${e.status}`);
  }
  if (audit.threadsNoTrace.length) {
    L.push(
      "",
      th
        ? "🧵 ปมสูง/วิกฤตที่ไม่พบร่องรอยในดราฟต์นี้ (เทียบคำสำคัญแบบ heuristic — บทนี้อาจไม่ใช่ที่ของมัน):"
        : "🧵 high/critical threads with no trace in this draft (heuristic keyword match — this chapter may not be its place):"
    );
    for (const t of audit.threadsNoTrace) L.push(`  [${t.priority}] ${t.desc} (0/${t.total} ${th ? "คำสำคัญ" : "keywords"})`);
  }
  if (audit.forbiddenHits.length) {
    L.push(
      "",
      th
        ? "🗣 voice guard — คำต้องห้ามที่ประกาศไว้ปรากฏในดราฟต์ (ระบบชี้แค่ว่า 'มีคำนี้' — ตรวจเองว่าใครพูด):"
        : "🗣 voice guard — a declared never-says word occurs in the draft (we only detect occurrence — check who says it):"
    );
    for (const h of audit.forbiddenHits) L.push(`  ${h.name}: "${h.word}" ×${h.count}`);
  }
  if (audit.variants.length) {
    L.push("", th ? "อาจสะกดเพี้ยน (เช็กความสอดคล้อง):" : "possible misspellings (check consistency):");
    for (const v of audit.variants) L.push(`  "${v.declared}" ~ "${v.found}"`);
  }
  if (audit.missing.length) {
    L.push(
      "",
      th
        ? `ไม่ถูกอ้างถึง (${audit.missing.length}) — ตั้งใจ หรือช่องว่าง continuity?`
        : `not referenced (${audit.missing.length}) — intentional, or a continuity gap?`
    );
    for (const e of audit.missing) L.push(`  ${e.name}`);
  }
  if (!audit.variants.length && !audit.missing.length) {
    L.push("", th ? "ครบทุกชื่อในดราฟต์ ไม่มีชื่อเพี้ยน" : "every declared name appears; no misspellings.");
  }
  return L.join("\n") + "\n";
}
