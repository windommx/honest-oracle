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
  const upgrade = err instanceof ApiError && err.isUpgrade;
  toast(message, { variant: upgrade ? "info" : "error" });
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
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    if (path === null) return;
    setLoading(true);
    try {
      const next = await api<T>(path);
      if (!alive.current) return;
      setData(next);
      setError(null);
    } catch (err) {
      if (!alive.current) return;
      setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, error, loading, reload };
}

/** Run a mutation with a busy flag, a success toast and uniform error reporting. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    async (fn: () => Promise<unknown>, successMessage?: string): Promise<boolean> => {
      setBusy(true);
      try {
        await fn();
        if (successMessage) toast(successMessage, { variant: "success" });
        return true;
      } catch (err) {
        reportError(err);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [],
  );
  return { busy, run };
}
