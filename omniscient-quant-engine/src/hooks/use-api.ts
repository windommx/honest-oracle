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
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.detail || body.error || `HTTP ${res.status}`);
        }
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
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || body.error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}
