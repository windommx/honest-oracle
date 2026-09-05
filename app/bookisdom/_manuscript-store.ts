// Client-side manuscript store (IndexedDB via Dexie). Lets a writer keep multiple
// named drafts and run the analyzers / NIS against them WITHOUT any server —
// staying true to the no-server-LLM principle.
//
// Storage: IndexedDB (origin-quota scale, not localStorage's ~5MB) with a
// one-time import of any drafts saved by the previous localStorage store.
// Environments without IndexedDB (SSR, old private modes) fall back to the
// original localStorage path — every public function is safe to call anywhere.

import Dexie, { type Table } from "dexie";

export interface StoredManuscript {
  id: string;
  title: string;
  lang: "th" | "en";
  text: string;
  updatedAt: number;
}

const LEGACY_KEY = "bookisdom.manuscripts";
const MIGRATED_KEY = "bookisdom.manuscripts.migrated";

class ManuscriptDB extends Dexie {
  manuscripts!: Table<StoredManuscript, string>;
  constructor() {
    super("bookisdom-manuscripts");
    this.version(1).stores({ manuscripts: "id, lang, updatedAt" });
  }
}

let dbInstance: ManuscriptDB | null = null;
function db(): ManuscriptDB | null {
  if (typeof indexedDB === "undefined") return null;
  if (!dbInstance) dbInstance = new ManuscriptDB();
  return dbInstance;
}

// ---- legacy localStorage path (fallback + migration source) ----

function lsRead(): StoredManuscript[] {
  try {
    const raw = window.localStorage.getItem(LEGACY_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? (list as StoredManuscript[]) : [];
  } catch {
    return [];
  }
}

/** Returns whether the write actually landed. A quota-exceeded write MUST be observable —
 *  swallowing it silently is how a writer's draft vanishes on reload. */
function lsWrite(list: StoredManuscript[]): boolean {
  try {
    window.localStorage.setItem(LEGACY_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false; // quota / unavailable — caller decides what to do
  }
}

/** Thrown when a manuscript could not be persisted to EITHER store (both full/unavailable).
 *  The draft is NOT saved; the caller must tell the user rather than pretend success. */
export class ManuscriptNotSavedError extends Error {
  constructor() {
    super("Manuscript was not saved: both IndexedDB and localStorage failed (storage full or unavailable).");
    this.name = "ManuscriptNotSavedError";
  }
}

// One-time import of localStorage drafts into IndexedDB. The legacy record is
// kept as a backup; a marker (not emptiness) gates the import so that a user
// who deletes every draft doesn't have the old copies resurrect.
async function migrateOnce(d: ManuscriptDB): Promise<void> {
  try {
    if (window.localStorage.getItem(MIGRATED_KEY)) return;
    const legacy = lsRead();
    if (legacy.length) await d.manuscripts.bulkPut(legacy);
    window.localStorage.setItem(MIGRATED_KEY, "1");
  } catch {
    /* storage unavailable — nothing to migrate */
  }
}

function newId(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// Best-effort, once per session: ask the browser to protect this origin's
// storage from eviction (Safari evicts most aggressively; a writer's drafts
// should never silently disappear). Fire-and-forget — no permission UI on
// most browsers, and failure changes nothing.
let persistRequested = false;
function requestPersistence(): void {
  if (persistRequested) return;
  persistRequested = true;
  try {
    void navigator.storage?.persist?.();
  } catch {
    /* unavailable (SSR/old browser) — ignore */
  }
}

/** List stored manuscripts, newest first; optionally filtered by language. */
export async function listManuscripts(lang?: "th" | "en"): Promise<StoredManuscript[]> {
  const d = db();
  if (d) {
    try {
      await migrateOnce(d);
      const all = await d.manuscripts.toArray();
      all.sort((a, b) => b.updatedAt - a.updatedAt);
      return lang ? all.filter((m) => m.lang === lang) : all;
    } catch {
      /* fall through to localStorage */
    }
  }
  const all = lsRead().sort((a, b) => b.updatedAt - a.updatedAt);
  return lang ? all.filter((m) => m.lang === lang) : all;
}

export async function getManuscript(id: string): Promise<StoredManuscript | undefined> {
  const d = db();
  if (d) {
    try {
      await migrateOnce(d);
      return await d.manuscripts.get(id);
    } catch {
      /* fall through */
    }
  }
  return lsRead().find((m) => m.id === id);
}

/** True when the origin's storage is nearing its browser-granted quota (>70%).
 *  IndexedDB quotas are origin-scale (usually GBs), so this should stay false in
 *  normal use — it exists so the UI can warn instead of silently losing a save. */
export async function storeNearQuota(): Promise<boolean> {
  try {
    if (db()) {
      const est = await navigator.storage?.estimate?.();
      if (est?.quota && est.usage != null) return est.usage / est.quota > 0.7;
      return false;
    }
    // localStorage fallback keeps the old ~5MB heuristic (UTF-16 units).
    const raw = window.localStorage.getItem(LEGACY_KEY);
    return (raw?.length ?? 0) > 3_500_000;
  } catch {
    return false;
  }
}

/** Insert or update (by id) a manuscript and return the saved record. */
export async function saveManuscript(input: { id?: string; title: string; lang: "th" | "en"; text: string }): Promise<StoredManuscript> {
  requestPersistence();
  const d = db();
  if (d) {
    try {
      await migrateOnce(d);
      // Read-max + put in ONE rw transaction so two concurrent saves cannot read the same
      // "newest" and mint the SAME updatedAt — IndexedDB serializes rw txns on the store, so
      // the second sees the first's put. Outside a transaction the two collide (audit finding).
      return await d.transaction("rw", d.manuscripts, async () => {
        const newest = await d.manuscripts.orderBy("updatedAt").last();
        const record: StoredManuscript = {
          id: input.id ?? newId(),
          title: input.title,
          lang: input.lang,
          text: input.text,
          updatedAt: Math.max(Date.now(), (newest?.updatedAt ?? 0) + 1),
        };
        await d.manuscripts.put(record);
        return record;
      });
    } catch {
      /* Dexie failed (quota / unavailable) — try the localStorage fallback below. */
    }
  }
  const list = lsRead();
  const maxTs = list.reduce((mx, m) => Math.max(mx, m.updatedAt), 0);
  const record: StoredManuscript = {
    id: input.id ?? newId(),
    title: input.title,
    lang: input.lang,
    text: input.text,
    updatedAt: Math.max(Date.now(), maxTs + 1),
  };
  const idx = list.findIndex((m) => m.id === record.id);
  if (idx >= 0) list[idx] = record;
  else list.push(record);
  // If BOTH stores failed, the draft is gone. Do NOT return a record that was never
  // persisted — the caller would show "saved" and the writer would lose it on reload.
  if (!lsWrite(list)) throw new ManuscriptNotSavedError();
  return record;
}

export async function deleteManuscript(id: string): Promise<void> {
  const d = db();
  if (d) {
    try {
      await migrateOnce(d);
      await d.manuscripts.delete(id);
      return;
    } catch {
      /* fall through */
    }
  }
  lsWrite(lsRead().filter((m) => m.id !== id));
}
