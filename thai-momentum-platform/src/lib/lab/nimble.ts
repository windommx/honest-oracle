// ============================================================
// Shadow Lab — Nimble decision runner (z-ai-web-dev-sdk — BACKEND ONLY)
//
// Nimble = LLM ที่ตัดสินจาก State Packet เดียวกับ rule engine
// ห้าม import ไฟล์นี้ใน client component เด็ดขาด (server / route เท่านั้น)
// ============================================================

import ZAI from 'z-ai-web-dev-sdk'
import type { Gates, StatePacket } from './state'

// Prompt หลักของ THE CORE (ตามสเปกเป๊ะ — ห้ามแก้ข้อความ)
export const SYSTEM_PROMPT =
  'You are THE CORE risk manager. Decide ONLY from the five gates (regime, selection, level, trigger, risk) plus context circuit-breakers. action=ENTER_LONG iff all gates=1 and day_pnl_R>-2. confidence = calibrated probability this is a grade-A setup. Respond with ONLY a JSON object: {"action":"ENTER_LONG"|"NO_TRADE","confidence":0..1,"gates":{"regime":0|1,"selection":0|1,"level":0|1,"trigger":0|1,"risk":0|1},"edge_case_note":""}'

// Prompt กลาง ๆ (base) — ใช้เทียบ no-regression ใน gate 5 ของ eval
export const GENERIC_PROMPT =
  'You are a trading assistant. Respond with ONLY a JSON object with keys action (ENTER_LONG|NO_TRADE), confidence (0..1), gates (five 0|1 sub-keys), edge_case_note.'

// ค่าความมั่นใจขั้นต่ำที่ wouldExecute จะเกิดจริง (double-key: rule ✓ + Nimble ✓ + conf ≥ 0.75)
export const CONF_MIN = 0.75

export interface NimbleDecision {
  action: 'ENTER_LONG' | 'NO_TRADE'
  confidence: number
  gates: Gates
  edgeCaseNote?: string
  error?: string
}

const ZERO_GATES: Gates = { regime: 0, selection: 0, level: 0, trigger: 0, risk: 0 }

// ---------------- lazy singleton ----------------
let zaiPromise: Promise<ZAI> | null = null

function getZAI(): Promise<ZAI> {
  if (!zaiPromise) {
    zaiPromise = ZAI.create()
  }
  return zaiPromise
}

// ---------------- response parsing ----------------
function extractContent(res: unknown): string {
  if (typeof res === 'string') return res
  const r = res as {
    choices?: { message?: { content?: unknown }; text?: unknown }[]
    content?: unknown
  }
  const c0 = r?.choices?.[0]
  const raw = c0?.message?.content ?? c0?.text ?? r?.content
  return typeof raw === 'string' ? raw : ''
}

function stripFences(text: string): string {
  const trimmed = text.trim()
  const m = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)
  return m ? m[1].trim() : trimmed
}

const coerce01 = (v: unknown): number => (v === 1 || v === '1' || v === true ? 1 : 0)

function normalize(obj: Record<string, unknown> | null, rawError?: string): NimbleDecision {
  if (!obj) {
    return { action: 'NO_TRADE', confidence: 0, gates: { ...ZERO_GATES }, error: rawError ?? 'unparseable_response' }
  }
  const action = obj.action === 'ENTER_LONG' ? 'ENTER_LONG' : 'NO_TRADE'
  let conf = typeof obj.confidence === 'string' ? Number(obj.confidence) : (obj.confidence as number)
  if (typeof conf !== 'number' || !Number.isFinite(conf)) conf = 0
  conf = Math.min(1, Math.max(0, conf))

  const g = (obj.gates ?? {}) as Record<string, unknown>
  const gates: Gates = {
    regime: coerce01(g.regime),
    selection: coerce01(g.selection),
    level: coerce01(g.level),
    trigger: coerce01(g.trigger),
    risk: coerce01(g.risk),
  }

  // grammar check — ใช้ตัด gate 4 ของ eval: action/confidence/gates ต้องครบและไม่มี error
  const confOk =
    typeof obj.confidence === 'number'
      ? Number.isFinite(obj.confidence)
      : typeof obj.confidence === 'string' && obj.confidence.trim() !== '' && Number.isFinite(Number(obj.confidence)) // โมเดลบางครั้งส่ง "0.85" — ยอมรับได้
  const complete =
    typeof obj.action === 'string' &&
    (obj.action === 'ENTER_LONG' || obj.action === 'NO_TRADE') &&
    confOk &&
    typeof obj.gates === 'object' &&
    obj.gates !== null &&
    ['regime', 'selection', 'level', 'trigger', 'risk'].every((k) => (obj.gates as Record<string, unknown>)[k] !== undefined)

  return {
    action,
    confidence: conf,
    gates,
    edgeCaseNote: typeof obj.edge_case_note === 'string' ? obj.edge_case_note : undefined,
    error: complete ? undefined : (rawError ?? 'incomplete_json'),
  }
}

// ---------------- main API ----------------

export async function decide(state: StatePacket, opts?: { genericPrompt?: boolean }): Promise<NimbleDecision> {
  try {
    const zai = await getZAI()
    const messages = [
      { role: "assistant" as const, content: opts?.genericPrompt ? GENERIC_PROMPT : SYSTEM_PROMPT },
      { role: "user" as const, content: JSON.stringify(state) },
    ]

    // เรียก LLM + ถอยหลังเมื่อโดน rate limit (429) — ลองใหม่สูงสุด 2 ครั้ง
    let lastErr = ""
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const completion = await zai.chat.completions.create({
          messages,
          thinking: { type: "disabled" },
          temperature: 0,
          maxTokens: 300,
        })
        const raw = extractContent(completion)
        if (!raw.trim()) {
          return { action: "NO_TRADE", confidence: 0, gates: { ...ZERO_GATES }, error: "empty_response" }
        }
        const cleaned = stripFences(raw)
        try {
          return normalize(JSON.parse(cleaned) as Record<string, unknown>)
        } catch {
          // fallback: ดึง {...} ออกจากข้อความที่มีสิ่งแปลกปน
          const m = cleaned.match(/\{[\s\S]*\}/)
          if (m) {
            try {
              return normalize(JSON.parse(m[0]) as Record<string, unknown>)
            } catch {
              return normalize(null, "json_parse_failed")
            }
          }
          return normalize(null, "json_parse_failed")
        }
      } catch (e) {
        lastErr = (e as Error).message
        const is429 = lastErr.includes("429")
        if (is429 && attempt < 2) {
          await new Promise((r) => setTimeout(r, attempt === 0 ? 2000 : 4000))
          continue
        }
        break
      }
    }
    return {
      action: "NO_TRADE",
      confidence: 0,
      gates: { ...ZERO_GATES },
      error: lastErr || "unknown_error",
    }
  } catch (e) {
    return {
      action: "NO_TRADE",
      confidence: 0,
      gates: { ...ZERO_GATES },
      error: (e as Error).message,
    }
  }
}

// รันชุดด้วย concurrency 6 (คงลำดับเดิมของ input)
export async function decideBatch(
  states: StatePacket[],
  opts?: { genericPrompt?: boolean }
): Promise<NimbleDecision[]> {
  const out: NimbleDecision[] = new Array(states.length)
  let next = 0
  const workers = Array.from({ length: Math.min(6, Math.max(1, states.length)) }, async () => {
    for (;;) {
      const i = next++
      if (i >= states.length) return
      out[i] = await decide(states[i], opts)
    }
  })
  await Promise.all(workers)
  return out
}
