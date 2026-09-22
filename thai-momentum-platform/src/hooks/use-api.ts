"use client"

import { useCallback, useEffect, useState } from "react"

// Simple fetch hook สำหรับ API routes ภายในเว็บ (ใช้ relative path เท่านั้น)
export function useApi<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(!!url)
  const [tick, setTick] = useState(0)

  const refetch = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    let alive = true
    // ย้ายทุก setState ไป microtask เพื่อไม่รัน synchronous ใน effect body
    Promise.resolve().then(() => {
      if (!alive) return
      if (!url) {
        setLoading(false)
        return
      }
      setLoading(true)
      fetch(url)
        .then(async (r) => {
          const j = await r.json()
          if (!r.ok) throw new Error((j as { error?: string }).error || `HTTP ${r.status}`)
          return j as T
        })
        .then((j) => {
          if (alive) {
            setData(j)
            setError(null)
          }
        })
        .catch((e: Error) => {
          if (alive) setError(e.message)
        })
        .finally(() => {
          if (alive) setLoading(false)
        })
    })
    return () => {
      alive = false
    }
  }, [url, tick])

  return { data, error, loading, refetch }
}

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const j = (await r.json()) as T & { error?: string }
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
  return j as T
}

export function fmtPct(x: number | null | undefined, digits = 1): string {
  if (x === null || x === undefined || !isFinite(x)) return "—"
  return `${x >= 0 ? "+" : ""}${x.toFixed(digits)}%`
}

export function fmtNum(x: number | null | undefined, digits = 2): string {
  if (x === null || x === undefined || !isFinite(x)) return "—"
  return x.toFixed(digits)
}
