// GET /api/events/export — ส่งออกหลักฐานสำหรับการตรวจสอบ (compliance)
//   ?format=json (ค่าเริ่มต้น) → EventLog ทั้ง hash chain + Decision ทั้งหมด + สถานะการตรวจ chain ในไฟล์เดียว
//   ?format=csv&table=events|decisions → CSV (UTF-8 BOM ให้ Excel อ่านภาษาไทยได้) + สถานะ chain ใน header X-Audit-*
//   ?from=YYYY-MM-DD&to=YYYY-MM-DD → กรองช่วงวันที่ (เวลาไทย) · ?download=1 → แนบเป็นไฟล์ (JSON)
// การตรวจ chain ใช้ auditEvents() ตัวเดียวกับ /api/events/audit เสมอ (ตรวจทั้งสาย ไม่ขึ้นกับตัวกรอง)
// ผู้ตรวจสอบคำนวณซ้ำเองได้จาก JSON: hash_n = sha256(prevHash + JSON.stringify({kind, actor, payload, ts}))

import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { auditEvents } from "@/lib/research/events"

export const dynamic = "force-dynamic"
export const maxDuration = 120

const MAX_ROWS = 200_000
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

type Cell = string | number | boolean | null | undefined

// กัน CSV/formula injection (ค่าเริ่มด้วย = + - @ tab CR ถูก Excel ตีความเป็นสูตร) — ใส่ ' นำหน้าเฉพาะช่องข้อความอิสระ
// ช่อง payload / prevHash / hash ไม่แตะ (ต้องคงค่าเดิมเพื่อคำนวณ hash ซ้ำได้ · payload เป็น JSON ไม่เริ่มด้วยอักขระสูตร)
function csvCell(v: Cell, raw = false): string {
  if (v === null || v === undefined) return ""
  let s = typeof v === "string" ? v : String(v)
  if (!raw && typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function toCsv(header: string[], rows: Cell[][], rawCols: ReadonlySet<number> = new Set()): string {
  const lines = [header.join(",")]
  for (const r of rows) lines.push(r.map((v, i) => csvCell(v, rawCols.has(i))).join(","))
  return `﻿${lines.join("\r\n")}\r\n`
}

function ymd(d = new Date()): string {
  return new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10).replace(/-/g, "")
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const format = url.searchParams.get("format") === "csv" ? "csv" : "json"
    const table = url.searchParams.get("table") === "decisions" ? "decisions" : "events"
    const from = url.searchParams.get("from")
    const to = url.searchParams.get("to")
    if ((from && !DATE_RE.test(from)) || (to && !DATE_RE.test(to))) {
      return NextResponse.json({ error: "from/to ต้องเป็นรูปแบบ YYYY-MM-DD" }, { status: 400 })
    }

    const audit = await auditEvents(1)
    const tip = await db.eventLog.findFirst({ orderBy: { id: "desc" }, select: { id: true, hash: true } })
    const verifiedAt = new Date().toISOString()
    const chainValid = (id: number) => audit.brokenAt === null || id < audit.brokenAt

    const tsFilter =
      from || to
        ? {
            ts: {
              ...(from ? { gte: new Date(`${from}T00:00:00.000+07:00`) } : {}),
              ...(to ? { lte: new Date(`${to}T23:59:59.999+07:00`) } : {}),
            },
          }
        : {}
    const dateFilter = from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}

    const wantEvents = format === "json" || table === "events"
    const wantDecisions = format === "json" || table === "decisions"
    const events = wantEvents
      ? await db.eventLog.findMany({ where: tsFilter, orderBy: { id: "asc" }, take: MAX_ROWS + 1 })
      : []
    const decisions = wantDecisions
      ? await db.decision.findMany({ where: dateFilter, orderBy: { id: "asc" }, take: MAX_ROWS + 1 })
      : []
    const truncated = { events: events.length > MAX_ROWS, decisions: decisions.length > MAX_ROWS }
    const evRows = events.slice(0, MAX_ROWS)
    const decRows = decisions.slice(0, MAX_ROWS)

    const auditHeaders: Record<string, string> = {
      "Cache-Control": "no-store",
      "X-Audit-Status": audit.ok ? "ok" : "broken",
      "X-Audit-Total": String(audit.total),
      "X-Audit-Broken-At": audit.brokenAt === null ? "" : String(audit.brokenAt),
      "X-Audit-Tip": tip?.hash ?? "GENESIS",
    }
    console.info(`[export] ${format}${format === "csv" ? `/${table}` : ""} events=${evRows.length} decisions=${decRows.length} chain=${audit.ok ? "ok" : `broken@${audit.brokenAt}`}`)

    if (format === "csv") {
      const body =
        table === "events"
          ? toCsv(
              ["id", "ts", "kind", "actor", "payload", "prevHash", "hash", "chainVerified"],
              evRows.map((e) => [e.id, e.ts.toISOString(), e.kind, e.actor, e.payload, e.prevHash, e.hash, chainValid(e.id)]),
              new Set([4, 5, 6]),
            )
          : toCsv(
              ["id", "date", "question", "target", "action", "conf", "reason", "executed", "outcome", "source", "createdAt"],
              decRows.map((d) => [
                d.id,
                d.date,
                d.question,
                d.target,
                d.action,
                d.conf,
                d.reason,
                d.executed,
                d.outcome,
                d.source,
                d.createdAt.toISOString(),
              ]),
            )
      return new NextResponse(body, {
        headers: {
          ...auditHeaders,
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="tmp-${table}-${ymd()}.csv"`,
          ...(truncated[table] ? { "X-Export-Truncated": String(MAX_ROWS) } : {}),
        },
      })
    }

    const payload = {
      generatedAt: verifiedAt,
      app: "Thai Momentum Platform",
      mode: "paper",
      disclaimer: "ไม่ใช่คำแนะนำการลงทุน · โหมดกระดาษ 100% (ไม่มีคำสั่งซื้อขายจริง)",
      filter: { from: from ?? null, to: to ?? null, timezone: "Asia/Bangkok" },
      audit: {
        ok: audit.ok,
        total: audit.total,
        brokenAt: audit.brokenAt,
        tipId: tip?.id ?? null,
        tipHash: tip?.hash ?? "GENESIS",
        genesis: "GENESIS",
        algorithm: "hash_n = sha256(hash_{n-1} + JSON.stringify({kind, actor, payload, ts}))  (ts = ISO-8601 UTC)",
        verifiedAt,
        scope: "ตรวจทั้งสาย (ไม่ขึ้นกับตัวกรองวันที่)",
      },
      counts: { events: evRows.length, decisions: decRows.length },
      truncated,
      events: evRows.map((e) => ({
        id: e.id,
        ts: e.ts.toISOString(),
        kind: e.kind,
        actor: e.actor,
        payload: e.payload,
        prevHash: e.prevHash,
        hash: e.hash,
        chainVerified: chainValid(e.id),
      })),
      decisions: decRows.map((d) => ({ ...d, createdAt: d.createdAt.toISOString() })),
    }
    const headers: Record<string, string> = { ...auditHeaders }
    if (url.searchParams.get("download") === "1") {
      headers["Content-Disposition"] = `attachment; filename="tmp-audit-${ymd()}.json"`
    }
    return NextResponse.json(payload, { headers })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
