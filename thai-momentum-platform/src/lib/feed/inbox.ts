// ============================================================
// Inbox — โฟลเดอร์รับไฟล์จากสคริปต์ภายนอก (data/feed/inbox/*.json|*.csv)
//   - lab/fetch_set_feed.py   → set-YYYYMMDD.csv (+ set-YYYYMMDD.sectors.json)
//   - lab/fetch_settrade_feed.py → settrade-YYYYMMDD.json ({source, rows})
//   - ไฟล์อื่น: JSON รูปแบบเดียวกับ POST /api/feed/ingest หรือ CSV รูปแบบการ์ดนำเข้า
// สายพานรายวันอ่าน → ตรวจ → ingest → ย้ายไฟล์ที่ใช้แล้วไป archive/YYYY-MM-DD/ (ไฟล์เสียไป rejected/)
// ============================================================

import { promises as fs } from "node:fs"
import path from "node:path"
import { parseSnapshotCsv, type ParsedCsvRow } from "@/lib/momentum/core"
import type { FeedIngestRow } from "@/lib/momentum/contracts"
import { normalizeFeedRows } from "./rows"

export const INBOX_DIR_DEFAULT = path.join("data", "feed", "inbox")

export interface InboxFile {
  name: string
  path: string
  kind: "json" | "csv"
  /** ไฟล์ sector ข้าง ๆ (set-YYYYMMDD.sectors.json ของ fetch_set_feed.py) */
  sectorsPath: string | null
}

export interface ParsedInbox {
  file: string
  source: string
  rows: ParsedCsvRow[]
  dropped: number
  sectors?: Record<string, string>
  notes: string[]
  error?: string
}

/** เดาแหล่งจากชื่อไฟล์ — set-*.csv = settfex · settrade-*.json = Settrade · yahoo-* = Yahoo */
export function sourceFromName(name: string): string | null {
  const m = /^([a-z]+)[-_]/i.exec(path.basename(name))
  const head = m?.[1]?.toLowerCase() ?? ""
  if (head === "set" || head === "settfex") return "set"
  if (head === "settrade") return "settrade"
  if (head === "yahoo") return "yahoo"
  return null
}

function sectorsOf(v: unknown): Record<string, string> | undefined {
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined
  const out: Record<string, string> = {}
  for (const [k, s] of Object.entries(v as Record<string, unknown>)) if (typeof s === "string" && s.trim()) out[k.toUpperCase()] = s
  return Object.keys(out).length > 0 ? out : undefined
}

/** JSON: {source, rows, sectors?} (เหมือน body ของ /api/feed/ingest) หรือ array ของแถวตรง ๆ */
export function parseInboxJson(text: string, fallbackSource: string): Omit<ParsedInbox, "file"> {
  let v: unknown
  try {
    v = JSON.parse(text)
  } catch (e) {
    return { source: fallbackSource, rows: [], dropped: 0, notes: [], error: `JSON เสีย: ${(e as Error).message}` }
  }
  const notes: string[] = []
  const obj = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  const rawRows = Array.isArray(v) ? v : Array.isArray(obj?.rows) ? (obj?.rows as unknown[]) : null
  if (!rawRows) return { source: fallbackSource, rows: [], dropped: 0, notes, error: "ไม่พบ rows (ต้องเป็น {source, rows:[…]} หรือ array)" }
  const source = typeof obj?.source === "string" && obj.source.trim() ? obj.source.trim().slice(0, 40) : fallbackSource
  if (obj?.replaceDemo === true) notes.push("ไฟล์ขอ replaceDemo — สายพานรายวันไม่ล้างข้อมูลให้ (ใช้ bun run fetch:th -- --replace-demo ครั้งแรกแทน)")
  const { rows, dropped } = normalizeFeedRows(rawRows as FeedIngestRow[])
  return { source, rows, dropped, sectors: sectorsOf(obj?.sectors), notes }
}

/** CSV รูปแบบการ์ดนำเข้า (date,symbol,open,high,low,close,val|volume) — ใช้ตัวอ่านเดียวกับ /api/ingest */
export function parseInboxCsv(text: string, source: string): Omit<ParsedInbox, "file"> {
  try {
    const { rows } = parseSnapshotCsv(text)
    return { source, rows, dropped: 0, notes: [] }
  } catch (e) {
    return { source, rows: [], dropped: 0, notes: [], error: `CSV อ่านไม่ได้: ${(e as Error).message}` }
  }
}

export async function listInbox(dir: string): Promise<InboxFile[]> {
  let names: string[]
  try {
    names = await fs.readdir(dir)
  } catch {
    return []
  }
  const set = new Set(names)
  const out: InboxFile[] = []
  for (const name of names.sort()) {
    const lower = name.toLowerCase()
    if (lower.endsWith(".sectors.json") || name.startsWith(".")) continue
    const full = path.join(dir, name)
    const st = await fs.stat(full).catch(() => null)
    if (!st?.isFile()) continue
    if (lower.endsWith(".json")) out.push({ name, path: full, kind: "json", sectorsPath: null })
    else if (lower.endsWith(".csv")) {
      const side = name.replace(/\.csv$/i, ".sectors.json")
      out.push({ name, path: full, kind: "csv", sectorsPath: set.has(side) ? path.join(dir, side) : null })
    }
  }
  return out
}

export async function readInboxFile(f: InboxFile): Promise<ParsedInbox> {
  const text = await fs.readFile(f.path, "utf8")
  const guess = sourceFromName(f.name)
  const parsed = f.kind === "json" ? parseInboxJson(text, guess ?? "external") : parseInboxCsv(text, guess ?? "csv")
  if (f.sectorsPath && !parsed.error) {
    try {
      parsed.sectors = { ...(sectorsOf(JSON.parse(await fs.readFile(f.sectorsPath, "utf8"))) ?? {}), ...(parsed.sectors ?? {}) }
    } catch {
      parsed.notes.push(`อ่านไฟล์ sector ${path.basename(f.sectorsPath)} ไม่ได้ — ข้าม`)
    }
  }
  return { file: f.name, ...parsed }
}

/** ย้ายไฟล์ (พร้อมไฟล์ sector ข้าง ๆ) ไปโฟลเดอร์ปลายทาง — ชื่อซ้ำเติม suffix ไม่ทับของเดิม */
export async function moveInboxFiles(files: InboxFile[], destDir: string): Promise<string[]> {
  await fs.mkdir(destDir, { recursive: true })
  const moved: string[] = []
  for (const f of files) {
    for (const p of [f.path, f.sectorsPath].filter((x): x is string => !!x)) {
      let target = path.join(destDir, path.basename(p))
      for (let i = 1; await fs.stat(target).then(() => true, () => false); i++) {
        target = path.join(destDir, path.basename(p).replace(/(\.[^.]+)$/, `.${i}$1`))
      }
      await fs.rename(p, target)
      moved.push(target)
    }
  }
  return moved
}
