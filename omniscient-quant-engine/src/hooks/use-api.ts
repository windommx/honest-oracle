'use client';

import { useCallback, useEffect, useState } from 'react';

interface UseApiResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

interface State<T> {
  url: string | null;
  data: T | null;
  error: string | null;
}

/**
 * Fetch hook — setState เกิดเฉพาะใน async callback (ผ่าน lint react-hooks/set-state-in-effect)
 * loading ถูก derive จาก state เพื่อเลี่ยง cascading render
 */
export function useApi<T>(url: string | null, opts: { auto?: boolean } = {}): UseApiResult<T> {
  const auto = opts.auto ?? true;
  const [state, setState] = useState<State<T>>({ url: null, data: null, error: null });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!url || !auto) return;
    let cancelled = false;
    fetch(url)
      .then(async (res) => {
        if (!res.ok) throw new Error(await errorText(res));
        return res.json();
      })
      .then((json: T) => {
        if (!cancelled) setState({ url, data: json, error: null });
      })
      .catch((e: Error) => {
        if (!cancelled) setState({ url, data: null, error: e.message });
      });
    return () => {
      cancelled = true;
    };
  }, [url, auto, tick]);

  const data = state.url !== null && state.url === url ? state.data : null;
  const error = state.url !== null && state.url === url ? state.error : null;
  const loading = Boolean(auto && url) && data === null && error === null;

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, error, refresh };
}

export async function apiCall<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(await errorText(res));
  return res.json() as Promise<T>;
}

/**
 * ข้อความ error ที่อ่านรู้เรื่องจากคำตอบของ API ทุกรูปแบบ:
 * 400 {message, issues[]} · proxy {error: ข้อความ, code} · LLM {error: code, detail} · 500 {error, errorId, detail?}
 */
export async function errorText(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as {
    message?: unknown;
    detail?: unknown;
    error?: unknown;
    errorId?: unknown;
    issues?: Array<{ path?: unknown; message?: unknown }>;
  };
  const pick = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);
  let text = pick(body.message) ?? pick(body.detail) ?? pick(body.error) ?? `HTTP ${res.status}`;
  if (Array.isArray(body.issues) && body.issues.length) {
    text += ` — ${body.issues.slice(0, 3).map((i) => `${String(i.path ?? '')}: ${String(i.message ?? '')}`).join(' · ')}`;
  }
  if (pick(body.errorId)) text += ` (errorId ${String(body.errorId)})`;
  return text;
}
