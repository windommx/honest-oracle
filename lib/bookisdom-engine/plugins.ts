// ╔══════════════════════════════════════════════════════════════════╗
// ║  PLUGINS — declarative, sandbox-free community extensions.         ║
// ║  A Bookisdom plugin is DATA, never code: a manifest + prompt modules +  ║
// ║  optional lexicon terms (sensory / AI-tell). Because nothing runs, ║
// ║  loading an untrusted plugin is 100% safe — no eval, no imports.   ║
// ║  This closes the "community" gap (writers share modules/lexicons)  ║
// ║  without a security surface. (Obsidian-style manifest, data-only.) ║
// ╚══════════════════════════════════════════════════════════════════╝

import { SENSES, type Sense } from "./sensory";

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  author?: string;
}
export interface PluginPromptModule {
  id: string;
  name: string;
  group: string;
  description?: string;
  usage?: string;
  body: string;
}
export interface PluginLexicon {
  lang: "th" | "en";
  sense?: Sense; // present → sensory terms; absent → AI-tell / cliché phrases
  terms: string[];
}
export interface BookisdomPlugin {
  manifest: PluginManifest;
  promptModules?: PluginPromptModule[];
  lexicons?: PluginLexicon[];
}

const SLUG = /^[a-z0-9][a-z0-9-]{1,48}$/;
const SEMVERISH = /^\d+\.\d+(\.\d+)?$/;

/** Validate untrusted JSON into a BookisdomPlugin. Pure; reads ONLY known fields, so any
 *  extra keys (including anything that looks like code) are ignored, not executed. */
export function validatePlugin(raw: unknown): { ok: true; plugin: BookisdomPlugin } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const r = raw as Record<string, unknown>;
  const m = (r?.manifest ?? {}) as Record<string, unknown>;

  if (typeof m.id !== "string" || !SLUG.test(m.id)) errors.push("manifest.id ต้องเป็น slug (a-z 0-9 -, 2–49 ตัว)");
  if (typeof m.name !== "string" || !m.name.trim()) errors.push("manifest.name ว่างไม่ได้");
  if (typeof m.version !== "string" || !SEMVERISH.test(m.version)) errors.push("manifest.version ต้องเป็นเลขเวอร์ชัน เช่น 1.0.0");

  const modules: PluginPromptModule[] = [];
  const rawModules = Array.isArray(r?.promptModules) ? (r.promptModules as unknown[]) : [];
  rawModules.forEach((pm, i) => {
    const o = pm as Record<string, unknown>;
    if (typeof o?.id !== "string" || !SLUG.test(o.id)) errors.push(`promptModules[${i}].id ต้องเป็น slug`);
    else if (typeof o?.name !== "string" || !o.name.trim()) errors.push(`promptModules[${i}].name ว่างไม่ได้`);
    else if (typeof o?.group !== "string" || !o.group.trim()) errors.push(`promptModules[${i}].group ว่างไม่ได้`);
    else if (typeof o?.body !== "string" || o.body.trim().length < 10) errors.push(`promptModules[${i}].body สั้นเกินไป`);
    else modules.push({ id: o.id, name: o.name, group: o.group, description: typeof o.description === "string" ? o.description : "", usage: typeof o.usage === "string" ? o.usage : "", body: o.body });
  });

  const lexicons: PluginLexicon[] = [];
  const rawLex = Array.isArray(r?.lexicons) ? (r.lexicons as unknown[]) : [];
  rawLex.forEach((lx, i) => {
    const o = lx as Record<string, unknown>;
    const lang = o?.lang;
    if (lang !== "th" && lang !== "en") { errors.push(`lexicons[${i}].lang ต้องเป็น "th" หรือ "en"`); return; }
    if (o.sense !== undefined && !SENSES.includes(o.sense as Sense)) { errors.push(`lexicons[${i}].sense ไม่ถูกต้อง`); return; }
    const terms = Array.isArray(o?.terms) ? (o.terms as unknown[]).filter((t): t is string => typeof t === "string" && !!t.trim()) : [];
    if (!terms.length) { errors.push(`lexicons[${i}].terms ว่างไม่ได้`); return; }
    lexicons.push({ lang, sense: o.sense as Sense | undefined, terms });
  });

  if (errors.length) return { ok: false, errors };
  return { ok: true, plugin: { manifest: { id: m.id as string, name: m.name as string, version: m.version as string, author: typeof m.author === "string" ? m.author : undefined }, promptModules: modules, lexicons } };
}

export interface PluginPrompt { id: string; group: string; name: string; description: string; usage: string; prompt: string; pluginId: string }

/** Flatten validated plugins' prompt modules into ready-to-show prompts. IDs are
 *  namespaced by plugin (`pluginId:moduleId`) so they never collide with core modules. */
export function pluginPrompts(plugins: BookisdomPlugin[]): PluginPrompt[] {
  const out: PluginPrompt[] = [];
  for (const p of plugins) {
    for (const m of p.promptModules ?? []) {
      out.push({ id: `${p.manifest.id}:${m.id}`, group: m.group, name: m.name, description: m.description ?? "", usage: m.usage ?? "", prompt: m.body, pluginId: p.manifest.id });
    }
  }
  return out;
}

/** Collect extra lexicon terms from plugins, keyed for the analyzers. `sense === undefined`
 *  entries are AI-tell/cliché phrases. */
export function pluginLexiconTerms(plugins: BookisdomPlugin[], lang: "th" | "en"): { sensory: Record<Sense, string[]>; aiTells: string[] } {
  const sensory = Object.fromEntries(SENSES.map((s) => [s, [] as string[]])) as Record<Sense, string[]>;
  const aiTells: string[] = [];
  for (const p of plugins) {
    for (const lx of p.lexicons ?? []) {
      if (lx.lang !== lang) continue;
      if (lx.sense) sensory[lx.sense].push(...lx.terms);
      else aiTells.push(...lx.terms);
    }
  }
  return { sensory, aiTells };
}
