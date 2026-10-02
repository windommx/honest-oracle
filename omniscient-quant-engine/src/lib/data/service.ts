// ============================================================
// บริการนำเข้าข้อมูล (server-only) — ใช้ร่วมกันโดย POST /api/data/ingest และสคริปต์ CLI
// ตรวจรูปแบบ → prepare → (dry run จบที่นี่) → backup (บังคับโดยค่าเริ่มต้น) → แทนที่ใน transaction → ล้าง cache
// ============================================================

import { invalidateAnalytics } from "@/lib/quant/engine/api"
import { invalidateMarketCache } from "@/lib/quant/engine/panel"
import { backupDatabase } from "@/lib/ops/backup"
import { DatasetSchema, prepareDataset, replaceMarketData, type IngestSummary } from "./ingest"

export type IngestOutcome =
  | { ok: false; stage: "schema" | "prepare" | "backup"; errors: string[]; warnings: string[]; summary: IngestSummary | null }
  | {
      ok: true
      dryRun: boolean
      warnings: string[]
      summary: IngestSummary
      backup: { file: string; bytes: number } | null
      result: { stocks: number; prices: number; dataSourceId: string; tookMs: number } | null
    }

export async function ingestDataset(raw: unknown, opts: { dryRun?: boolean; requireBackup?: boolean } = {}): Promise<IngestOutcome> {
  const parsed = DatasetSchema.safeParse(raw)
  if (!parsed.success) {
    const errors = parsed.error.issues.slice(0, 30).map((i) => `${i.path.map(String).join(".") || "(body)"}: ${i.message}`)
    return { ok: false, stage: "schema", errors, warnings: [], summary: null }
  }
  const prepared = prepareDataset(parsed.data)
  if (!prepared.ok || !prepared.summary) {
    return { ok: false, stage: "prepare", errors: prepared.errors, warnings: prepared.warnings, summary: prepared.summary }
  }
  if (opts.dryRun) {
    return { ok: true, dryRun: true, warnings: prepared.warnings, summary: prepared.summary, backup: null, result: null }
  }
  const backup = await backupDatabase({ reason: "before-ingest" })
  if (!backup && (opts.requireBackup ?? true)) {
    return {
      ok: false,
      stage: "backup",
      errors: ["backup ฐานข้อมูลก่อนแทนที่ไม่สำเร็จ — ยกเลิกการนำเข้า (ข้อมูลเดิมไม่ถูกแตะ) · ดู log 'backup failed'"],
      warnings: prepared.warnings,
      summary: prepared.summary,
    }
  }
  const result = await replaceMarketData(prepared)
  invalidateMarketCache()
  invalidateAnalytics()
  return {
    ok: true,
    dryRun: false,
    warnings: prepared.warnings,
    summary: prepared.summary,
    backup: backup ? { file: backup.file, bytes: backup.bytes } : null,
    result,
  }
}
