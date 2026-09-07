// ╔══════════════════════════════════════════════════════════════════╗
// ║  LOCAL-FIRST STORE.                                               ║
// ║                                                                    ║
// ║  MindBridge works with no account. That is a privacy decision, not ║
// ║  a convenience one: requiring a login to answer a depression       ║
// ║  questionnaire means the first thing the product asks a person in  ║
// ║  distress for is their identity. Answers live in this browser      ║
// ║  until they choose to sync.                                        ║
// ║                                                                    ║
// ║  Everything here is a pure function over a Storage-shaped object,  ║
// ║  so the whole store is testable without a DOM and degrades to a    ║
// ║  no-op wherever localStorage is unavailable (SSR, private modes,   ║
// ║  a browser set to block site data) rather than throwing at the top ║
// ║  of a page render.                                                 ║
// ╚══════════════════════════════════════════════════════════════════╝

import type { SleepDiaryEntry } from "@/lib/therapy-engine/sleep";
import type { InstrumentId } from "@/lib/therapy-engine/types";

export interface LocalAssessment {
  /** Epoch ms. Recorded by the caller so the store itself never reads a clock. */
  at: number;
  instrument: InstrumentId;
  /** The answers. The total is NOT stored — it is re-derived by scoring.ts on
   *  read, so a local row cannot drift from the engine any more than a server
   *  row can. */
  responses: number[];
}

export interface LocalSession {
  at: number;
  kind: "music" | "breath";
  plannedMin: number;
  completedMin: number;
  startBpm?: number;
  targetBpm?: number;
  breathPattern?: string;
}

export const KEYS = {
  assessments: "mindbridge.assessments",
  sessions: "mindbridge.sessions",
  nights: "mindbridge.sleep",
} as const;

/** The slice of the Storage API this module needs. Narrowing it keeps the tests
 *  honest — they exercise the real code path with a plain object. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** The browser's localStorage, or null wherever it is unavailable or blocked.
 *  Accessing the property itself can throw in some privacy modes, so even the
 *  lookup is guarded. */
export function browserStorage(): StorageLike | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function readArray<T>(store: StorageLike | null, key: string): T[] {
  if (!store) return [];
  try {
    const raw = store.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    // Corrupt JSON is treated as "no data" rather than crashing the page. The
    // alternative — a white screen on the assessment route — is worse than a
    // lost history.
    return [];
  }
}

function writeArray<T>(store: StorageLike | null, key: string, value: T[]): void {
  if (!store) return;
  try {
    store.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded or storage disabled. Silent by design: the session the user
    // is in the middle of still works, it just will not be remembered.
  }
}

// ── Assessments ───────────────────────────────────────────────────────────────

export function readAssessments(store: StorageLike | null): LocalAssessment[] {
  return readArray<LocalAssessment>(store, KEYS.assessments)
    .filter((a) => Number.isFinite(a?.at) && Array.isArray(a?.responses))
    .sort((a, b) => a.at - b.at);
}

/** Append an assessment. Returns the new list so callers can render without a
 *  second read — sorted, so what a caller renders is exactly what the next read
 *  will give. (An append-only return quietly disagrees with readAssessments()
 *  whenever an entry arrives out of order, which is how a history list ends up
 *  showing a different order before and after a refresh.) */
export function addAssessment(store: StorageLike | null, entry: LocalAssessment): LocalAssessment[] {
  const next = [...readAssessments(store), entry].sort((a, b) => a.at - b.at).slice(-500);
  writeArray(store, KEYS.assessments, next);
  return next;
}

// ── Sessions ──────────────────────────────────────────────────────────────────

export function readSessions(store: StorageLike | null): LocalSession[] {
  return readArray<LocalSession>(store, KEYS.sessions)
    .filter((s) => Number.isFinite(s?.at) && Number.isFinite(s?.completedMin))
    .sort((a, b) => a.at - b.at);
}

export function addSession(store: StorageLike | null, entry: LocalSession): LocalSession[] {
  const next = [...readSessions(store), entry].sort((a, b) => a.at - b.at).slice(-1000);
  writeArray(store, KEYS.sessions, next);
  return next;
}

/** Minutes actually completed, in total. Adherence, not intention. */
export function totalMinutes(sessions: readonly LocalSession[]): number {
  return sessions.reduce((n, s) => n + (s.completedMin || 0), 0);
}

// ── Sleep diary ───────────────────────────────────────────────────────────────

export function readNights(store: StorageLike | null): SleepDiaryEntry[] {
  return readArray<SleepDiaryEntry>(store, KEYS.nights)
    .filter((n) => typeof n?.date === "string" && Number.isFinite(n?.timeInBedMin))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** One row per night: re-submitting a date corrects it rather than adding a
 *  duplicate that the weekly criterion would then count twice. */
export function upsertNight(store: StorageLike | null, entry: SleepDiaryEntry): SleepDiaryEntry[] {
  const next = [...readNights(store).filter((n) => n.date !== entry.date), entry]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-365);
  writeArray(store, KEYS.nights, next);
  return next;
}

/** Erase everything this browser holds. The local half of the right to erasure —
 *  the server half is DELETE /api/therapy/export. */
export function clearAll(store: StorageLike | null): void {
  if (!store) return;
  try {
    for (const key of Object.values(KEYS)) store.removeItem(key);
  } catch {
    /* nothing to do — the data is already unreachable */
  }
}
