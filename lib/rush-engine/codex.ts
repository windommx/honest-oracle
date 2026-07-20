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
}
export interface CodexRelation {
  from: string;
  to: string;
  kind: string;
  directed: boolean;
}
export interface Codex {
  entities: CodexEntity[];
  relations: CodexRelation[];
}

// Section headers (bilingual). A line like "[CHARACTERS]", "ตัวละคร:", "CAST"
// switches the active section. Only lines INSIDE a recognised section are parsed,
// so freeform story-bible prose (no headers) yields an empty codex untouched.
const SECTION: Array<{ re: RegExp; type: CodexEntityType | "relation" }> = [
  { re: /^\[?\s*(characters?|cast|ตัวละคร)\s*\]?\s*:?\s*$/i, type: "character" },
  { re: /^\[?\s*(places?|locations?|setting|สถานที่|ฉาก)\s*\]?\s*:?\s*$/i, type: "place" },
  { re: /^\[?\s*(items?|objects?|artifacts?|สิ่งของ|ไอเทม|วัตถุ)\s*\]?\s*:?\s*$/i, type: "item" },
  { re: /^\[?\s*(relations?|relationships?|ความสัมพันธ์)\s*\]?\s*:?\s*$/i, type: "relation" },
];

/** Parse an author-declared story bible into a continuity graph. Deterministic;
 *  no declarations (or no recognised sections) → empty graph. */
export function parseCodex(text: string | undefined): Codex {
  const entities: CodexEntity[] = [];
  const relations: CodexRelation[] = [];
  if (!text) return { entities, relations };

  const seen = new Set<string>(); // dedupe entity names (case-insensitive)
  let section: CodexEntityType | "relation" | null = null;

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

    // Entity line: "Name: description" or just "Name".
    const colon = line.indexOf(":");
    const name = (colon >= 0 ? line.slice(0, colon) : line).trim();
    const desc = colon >= 0 ? line.slice(colon + 1).trim() : "";
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    entities.push({ name, type: section, desc });
  }

  return { entities, relations };
}

export function hasCodex(codex: Codex): boolean {
  return codex.entities.length > 0;
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

/** Whole-book codex block ≈ GraphRAG global/community view (Thai). "" if empty. */
export function codexDigestTh(codex: Codex): string {
  if (!hasCodex(codex)) return "";
  let p = `═══ Codex ของหนังสือ (สารบบต่อเนื่องทั้งเล่ม) ═══\n`;
  (["character", "place", "item"] as CodexEntityType[]).forEach((t) => {
    const es = codex.entities.filter((e) => e.type === t);
    if (es.length) p += `${TYPE_TH[t]} (${es.length}): ` + es.map((e) => e.desc ? `${e.name} — ${e.desc}` : e.name).join(" · ") + "\n";
  });
  if (codex.relations.length) p += `ความสัมพันธ์ (${codex.relations.length}):\n` + codex.relations.map((r) => `• ${renderRelation(r)}`).join("\n") + "\n";
  p += `กฎ: ถือ Codex นี้เป็นแหล่งความจริง คงชื่อ/ลักษณะ/ความสัมพันธ์ให้สอดคล้องตลอดเล่ม ห้ามขัดแย้ง\n`;
  return p;
}

/** Whole-book codex block (English). "" if empty. */
export function codexDigestEn(codex: Codex): string {
  if (!hasCodex(codex)) return "";
  let p = `═══ STORY CODEX (book-wide continuity index) ═══\n`;
  (["character", "place", "item"] as CodexEntityType[]).forEach((t) => {
    const es = codex.entities.filter((e) => e.type === t);
    if (es.length) p += `${TYPE_EN[t]}s (${es.length}): ` + es.map((e) => e.desc ? `${e.name} — ${e.desc}` : e.name).join(" · ") + "\n";
  });
  if (codex.relations.length) p += `Relations (${codex.relations.length}):\n` + codex.relations.map((r) => `• ${renderRelation(r)}`).join("\n") + "\n";
  p += `RULE: treat this codex as source of truth — keep names/traits/relations consistent, never contradict it.\n`;
  return p;
}

/** Per-chapter local subgraph block (Thai) for entities appearing in `text`. "" if none. */
export function codexLocalTh(codex: Codex, text: string): string {
  const local = codexLocal(codex, text);
  if (local.entities.length === 0) return "";
  let p = `═══ Codex ต่อเนื่อง (เฉพาะบทนี้) ═══\nปรากฏในบทนี้:\n`;
  p += local.entities.map((e) => `• ${e.name} (${TYPE_TH[e.type]})${e.desc ? ` — ${e.desc}` : ""}`).join("\n") + "\n";
  if (local.relations.length) p += `ความสัมพันธ์ที่เกี่ยวข้อง:\n` + local.relations.map((r) => `• ${renderRelation(r)}`).join("\n") + "\n";
  p += `คงลักษณะและความสัมพันธ์เหล่านี้ให้ตรงกับ Codex\n`;
  return p;
}

/** Per-chapter local subgraph block (English). "" if none. */
export function codexLocalEn(codex: Codex, text: string): string {
  const local = codexLocal(codex, text);
  if (local.entities.length === 0) return "";
  let p = `═══ CODEX (this chapter) ═══\nAppears here:\n`;
  p += local.entities.map((e) => `• ${e.name} (${TYPE_EN[e.type]})${e.desc ? ` — ${e.desc}` : ""}`).join("\n") + "\n";
  if (local.relations.length) p += `Relevant relations:\n` + local.relations.map((r) => `• ${renderRelation(r)}`).join("\n") + "\n";
  p += `Keep these traits and relations consistent with the codex.\n`;
  return p;
}

// ── Visualisation — the declared graph as Mermaid (draws only what's declared) ─

/** Render the codex as a Mermaid graph: nodes shaped/coloured by entity type,
 *  edges labelled by relation kind (→ directed, — undirected). "" if empty.
 *  Undeclared relation endpoints become plain nodes so no edge is dropped. */
export function codexMermaid(codex: Codex): string {
  if (!hasCodex(codex)) return "";
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
  canonSize: number;
}

/** Check a draft against the codex, reusing the existing near-miss detectors
 *  (withinOneEdit for Latin, thaiMarkVariant for Thai). Pure/deterministic. */
export function codexAudit(codex: Codex, draft: string, lang: "th" | "en"): CodexAudit {
  const present: CodexEntity[] = [];
  const variants: Array<{ declared: string; found: string }> = [];
  const missing: CodexEntity[] = [];
  if (!hasCodex(codex) || !draft) {
    return { present, variants, missing: codex.entities.slice(), canonSize: codex.entities.length };
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
  return { present, variants, missing, canonSize: codex.entities.length };
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
