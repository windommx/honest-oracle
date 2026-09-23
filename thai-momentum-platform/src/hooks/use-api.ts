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
          const j = await readJson(r)
          if (!r.ok) throw new Error((j as { error?: string } | null)?.error || `HTTP ${r.status}`)
          if (j === null) throw new Error(`รูปแบบข้อมูลไม่ถูกต้อง (HTTP ${r.status})`)
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

// body ที่ไม่ใช่ JSON (หน้า HTML ของ proxy/gateway timeout, body ว่าง) → null แทน SyntaxError ที่อ่านไม่รู้เรื่อง
async function readJson(r: Response): Promise<unknown> {
  try {
    return await r.json()
  } catch {
    return null
  }
}

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const j = (await readJson(r)) as (T & { error?: string }) | null
  if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`)
  if (j === null) throw new Error(`รูปแบบข้อมูลไม่ถูกต้อง (HTTP ${r.status})`)
  return j as T
}

/**
 * POST JSON แบบคืนสถานะ HTTP (ไม่ throw เมื่อ 4xx/5xx) — ใช้กับ endpoint ที่ต้อง "ยืนยัน" ก่อนเขียนทับข้อมูล
 * เช่น /api/seed ({confirm:"RESET"}) หรือ feed replaceDemo ({confirm:"REPLACE"}) ที่ตอบ 409 เมื่อยังไม่ยืนยัน
 * throw เฉพาะเมื่อเครือข่ายล้ม (fetch reject)
 */
export async function postJsonWithStatus<T>(
  url: string,
  body: unknown,
): Promise<{ ok: boolean; status: number; data: (T & { error?: string; message?: string }) | null }> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const j = (await readJson(r)) as (T & { error?: string; message?: string }) | null
  return { ok: r.ok && j !== null, status: r.status, data: j }
}

export function fmtPct(x: number | null | undefined, digits = 1): string {
  if (x === null || x === undefined || !isFinite(x)) return "—"
  return `${x >= 0 ? "+" : ""}${x.toFixed(digits)}%`
}

export function fmtNum(x: number | null | undefined, digits = 2): string {
  if (x === null || x === undefined || !isFinite(x)) return "—"
  return x.toFixed(digits)
}
