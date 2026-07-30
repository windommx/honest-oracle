// Client-side manuscript store (localStorage). Lets a writer keep multiple named
// drafts and run the analyzers / NIS against them WITHOUT any server — staying
// true to the no-server-LLM principle. SSR/private-mode safe (all access guarded).

export interface StoredManuscript {
  id: string;
  title: string;
  lang: "th" | "en";
  text: string;
  updatedAt: number;
}

const KEY = "rush.manuscripts";

function read(): StoredManuscript[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? (list as StoredManuscript[]) : [];
  } catch {
    return [];
  }
}

function write(list: StoredManuscript[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* quota / unavailable — ignore */
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

/** List stored manuscripts, newest first; optionally filtered by language. */
export function listManuscripts(lang?: "th" | "en"): StoredManuscript[] {
  const all = read().sort((a, b) => b.updatedAt - a.updatedAt);
  return lang ? all.filter((m) => m.lang === lang) : all;
}

export function getManuscript(id: string): StoredManuscript | undefined {
  return read().find((m) => m.id === id);
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

/** True when the store is nearing localStorage's ~5MB ceiling — surfaced so the
 *  UI can warn instead of silently dropping a save. (The durable fix is an
 *  IndexedDB migration — tracked as follow-up engineering.) */
export function storeNearQuota(): boolean {
  try {
    const raw = window.localStorage.getItem(KEY);
    return (raw?.length ?? 0) > 3_500_000; // ~70% of the common 5MB budget (UTF-16 units)
  } catch {
    return false;
  }
}

/** Insert or update (by id) a manuscript and return the saved record. */
export function saveManuscript(input: { id?: string; title: string; lang: "th" | "en"; text: string }): StoredManuscript {
  requestPersistence();
  const list = read();
  // Strictly newer than every existing record so "newest first" is deterministic
  // even when two saves land in the same millisecond.
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
  write(list);
  return record;
}

export function deleteManuscript(id: string): void {
  write(read().filter((m) => m.id !== id));
}
