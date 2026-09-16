"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/components/toast";
import type { StageFeature, StageLimits, StagePlanKey } from "@/lib/stagelab/plans";

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  The client's single door to the StageLab API.                           ║
// ║                                                                          ║
// ║  Two things it does that a bare fetch() does not:                         ║
// ║                                                                          ║
// ║   1. It reads the server's `code` field. A 402 carrying                   ║
// ║      `upgrade_required` is not a failure to apologise for — it is a       ║
// ║      product state, and the caller gets it as a typed error it can turn   ║
// ║      into an upgrade prompt instead of a red toast.                       ║
// ║                                                                          ║
// ║   2. It survives unmounting. Every view here loads on mount and reloads   ║
// ║      after each mutation; without the alive-guard a fast tab switch sets  ║
// ║      state on a dead component.                                          ║
// ╚══════════════════════════════════════════════════════════════════════════╝

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(message: string, status: number, code: string | null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }

  /** True when the fix is a plan change, not a retry. */
  get isUpgrade(): boolean {
    return this.code === "upgrade_required" || this.code === "quota_exhausted";
  }

  /**
   * True when someone else's write landed first. The fix is to reload and
   * look at what changed — never to retry the same payload, which is exactly
   * the overwrite the version check just prevented.
   */
  get isConflict(): boolean {
    return this.status === 409;
  }
}

const BASE = "/api/stagelab";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init?.headers } : init?.headers,
  });

  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    /* a 204 or an HTML error page — handled below */
  }

  if (!res.ok) {
    const body = (payload ?? {}) as { error?: string; code?: string };
    throw new ApiError(body.error ?? `คำขอล้มเหลว (${res.status})`, res.status, body.code ?? null);
  }
  return payload as T;
}

export const post = <T,>(path: string, body: unknown) =>
  api<T>(path, { method: "POST", body: JSON.stringify(body) });
export const put = <T,>(path: string, body: unknown) =>
  api<T>(path, { method: "PUT", body: JSON.stringify(body) });
export const patch = <T,>(path: string, body: unknown) =>
  api<T>(path, { method: "PATCH", body: JSON.stringify(body) });
export const del = <T,>(path: string) => api<T>(path, { method: "DELETE" });

/** Report a failure once, in the right register. Returns the message shown. */
export function reportError(err: unknown, fallback = "ทำรายการไม่สำเร็จ"): string {
  const message = err instanceof Error ? err.message : fallback;
  // An upgrade prompt and a stale-tab notice are not errors; colouring them red
  // trains people to ignore the colour that does mean something is broken.
  const informational = err instanceof ApiError && (err.isUpgrade || err.isConflict);
  toast(message, { variant: informational ? "info" : "error" });
  return message;
}

// ─── Session ─────────────────────────────────────────────────────────────────

export interface StageSession {
  user: { id: string; email: string; name: string | null; role: string };
  plan: StagePlanKey;
  planLabel: string;
  features: StageFeature[];
  limits: StageLimits;
  usage: {
    watchlist: number;
    positions: number;
    theses: number;
    journal: number;
    computeRemaining: number;
  };
  isEmpty: boolean;
}

// ─── Cache ───────────────────────────────────────────────────────────────────

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  A small stale-while-revalidate cache.                                   ║
// ║                                                                          ║
// ║  Every view fetched on mount and threw the result away on unmount, so    ║
// ║  dashboard → watchlist → dashboard was three round trips and two         ║
// ║  skeleton flashes for data that had not changed. Worse, the dashboard    ║
// ║  and the portfolio both read positions, and mounting one told the other  ║
// ║  nothing.                                                                ║
// ║                                                                          ║
// ║  Three behaviours, and they are the whole thing:                         ║
// ║                                                                          ║
// ║   · SERVE THEN REVALIDATE. A cached path paints immediately and refetches║
// ║     behind the paint. Nobody waits to look at what they just looked at.  ║
// ║   · DEDUPE. Two components mounting on the same path in the same tick    ║
// ║     share one request, not two.                                          ║
// ║   · INVALIDATE ON WRITE. A mutation drops the affected paths and every   ║
// ║     mounted reader refetches, so the sidebar counts and the table on     ║
// ║     screen cannot disagree about what was just saved.                    ║
// ║                                                                          ║
// ║  Deliberately not a general cache library: no suspense, no focus         ║
// ║  revalidation, no retry policy. It is ~60 lines that this app needs,     ║
// ║  rather than a dependency whose behaviour has to be configured back down ║
// ║  to this.                                                                ║
// ╚══════════════════════════════════════════════════════════════════════════╝

interface CacheEntry {
  data: unknown;
  /** When it was written — compared against STALE_AFTER_MS on read. */
  at: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();
const listeners = new Map<string, Set<() => void>>();

/** Past this, a cached value still paints but a refetch starts behind it. */
const STALE_AFTER_MS = 30_000;

/** The app has a dozen or so paths; the cap is a guard, not a policy. */
const MAX_ENTRIES = 64;

function writeCache(path: string, data: unknown) {
  if (cache.size >= MAX_ENTRIES && !cache.has(path)) {
    const oldest = Array.from(cache.entries()).sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) cache.delete(oldest[0]);
  }
  cache.set(path, { data, at: Date.now() });
}

function notify(path: string) {
  listeners.get(path)?.forEach((fn) => fn());
}

/**
 * Fetch, sharing one request between concurrent callers for the same path.
 *
 * The in-flight entry is cleared in `finally` rather than on success, so a
 * failed request does not wedge the path into a permanently pending state.
 */
function fetchShared<T>(path: string): Promise<T> {
  const pending = inflight.get(path);
  if (pending) return pending as Promise<T>;

  const promise = api<T>(path)
    .then((data) => {
      writeCache(path, data);
      notify(path);
      return data;
    })
    .finally(() => {
      inflight.delete(path);
    });

  inflight.set(path, promise);
  return promise;
}

/**
 * Drop cached paths and make every mounted reader refetch.
 *
 * Called with no argument after a write, because the blast radius of a save is
 * genuinely wide here — adding a position changes the portfolio, the overview,
 * the alerts and the session counts. Clearing everything and letting the two
 * or three mounted readers refetch is cheaper than maintaining a dependency
 * graph that would be wrong the first time someone adds an endpoint.
 */
export function invalidate(prefix?: string): void {
  const paths = Array.from(cache.keys()).filter((p) => !prefix || p.startsWith(prefix));
  for (const path of paths) cache.delete(path);
  const toNotify = prefix ? paths : Array.from(listeners.keys());
  for (const path of toNotify) notify(path);
}

/** Test seam. */
export function _resetCache(): void {
  cache.clear();
  inflight.clear();
}

// ─── Data hook ───────────────────────────────────────────────────────────────

export interface Resource<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => Promise<void>;
}

/**
 * Load a GET endpoint, with reload-after-mutation.
 *
 * `path` doubles as the dependency: pass a stable string, or null to hold off
 * entirely (used by views whose fetch depends on a symbol the user has not
 * picked yet).
 */
export function useResource<T>(path: string | null): Resource<T> {
  const cached = path === null ? undefined : cache.get(path);
  // Seeded from the cache so a revisit paints on the first frame rather than
  // flashing a skeleton for data already in memory.
  const [data, setData] = useState<T | null>((cached?.data as T) ?? null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(path !== null && cached === undefined);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(
    async (showSpinner: boolean) => {
      if (path === null) return;
      if (showSpinner) setLoading(true);
      try {
        const next = await fetchShared<T>(path);
        if (!alive.current) return;
        setData(next);
        setError(null);
      } catch (err) {
        if (!alive.current) return;
        setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ");
      } finally {
        if (alive.current) setLoading(false);
      }
    },
    [path],
  );

  /** Force a refetch — used after a mutation, so it must never serve cache. */
  const reload = useCallback(async () => {
    if (path === null) return;
    cache.delete(path);
    await load(false);
  }, [path, load]);

  useEffect(() => {
    if (path === null) return;

    const entry = cache.get(path);
    if (entry === undefined) {
      void load(true);
    } else {
      setData(entry.data as T);
      setLoading(false);
      // Paint the stale copy, then quietly check whether it still holds.
      if (Date.now() - entry.at > STALE_AFTER_MS) void load(false);
    }

    // Subscribe so an invalidation elsewhere — or another component's fetch of
    // the same path — updates this one instead of leaving it showing the past.
    const onChange = () => {
      const fresh = cache.get(path);
      if (fresh) setData(fresh.data as T);
      else void load(false);
    };
    const set = listeners.get(path) ?? new Set();
    set.add(onChange);
    listeners.set(path, set);

    return () => {
      set.delete(onChange);
      if (set.size === 0) listeners.delete(path);
    };
  }, [path, load]);

  return { data, error, loading, reload };
}

/**
 * Boolean toggles that move when they are clicked.
 *
 * A checkbox that waits for a round trip before moving reads as a broken
 * checkbox, and on a slow connection people click it again — which is how one
 * intended toggle becomes three requests and an ambiguous final state.
 *
 * So the flag flips locally first. If the server refuses, it flips back and
 * says why. The override is dropped either way once the write settles: on
 * success the refetched data already carries this value, and on failure the
 * server's value is the one to show. A local copy must never outlive the truth
 * it was predicting.
 */
export function useOptimisticFlags() {
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  const valueOf = useCallback(
    (id: string | number, serverValue: boolean) => overrides[String(id)] ?? serverValue,
    [overrides],
  );

  const toggle = useCallback(
    async (id: string | number, next: boolean, write: () => Promise<unknown>) => {
      const key = String(id);
      setOverrides((o) => ({ ...o, [key]: next }));
      try {
        await write();
        invalidate();
      } catch (err) {
        reportError(err);
      } finally {
        setOverrides((o) => {
          const { [key]: _settled, ...rest } = o;
          return rest;
        });
      }
    },
    [],
  );

  return { valueOf, toggle };
}

/**
 * Run a mutation with a busy flag, a success toast and uniform error reporting.
 *
 * `onConflict` is called when the server rejects a write as stale, so the
 * caller can refresh before the customer edits the same wrong numbers again.
 */
export function useAction(onConflict?: () => Promise<void> | void) {
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    async (fn: () => Promise<unknown>, successMessage?: string): Promise<boolean> => {
      setBusy(true);
      try {
        await fn();
        // A write invalidates broadly — see invalidate()'s note on blast radius.
        invalidate();
        if (successMessage) toast(successMessage, { variant: "success" });
        return true;
      } catch (err) {
        reportError(err);
        // A conflict means our copy is stale, so pull the fresh one rather than
        // leaving the screen showing values the server has already rejected.
        if (err instanceof ApiError && err.isConflict && onConflict) await onConflict();
        return false;
      } finally {
        setBusy(false);
      }
    },
    [onConflict],
  );
  return { busy, run };
}
