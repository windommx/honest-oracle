/**
 * llm.ts — ชั้นเดียวที่คุยกับ LLM ของแพลตฟอร์ม (หลอมรวมด้วย AI · AI Auditor · แชท AI Analyst)
 *
 * ต้นฉบับผูกกับ z-ai-web-dev-sdk ของ container z.ai (อ่าน .z-ai-config) — นอก container นั้นทุกปุ่ม AI จะล้มด้วย 500
 * ชั้นนี้ทำให้ระบบ "ซื่อสัตย์": ไม่มีผู้ให้บริการ = ตอบ 503 พร้อมวิธีตั้งค่า ไม่ใช่ error ดิบ และเลือกผู้ให้บริการได้ 2 ทาง
 *   1. OpenAI-compatible (/v1/chat/completions) ผ่าน env OQE_LLM_API_KEY + OQE_LLM_MODEL (+ OQE_LLM_BASE_URL)
 *   2. z-ai-web-dev-sdk เมื่อพบไฟล์ .z-ai-config (พฤติกรรมเดิมของต้นฉบับ)
 * เอนจินวิเคราะห์ทั้งหมด (gates / backtest / synthesis score / meta-risk / apex) ไม่พึ่ง LLM — LLM มีหน้าที่ "เรียบเรียง" เท่านั้น
 * และทุก prompt บังคับให้อ้างตัวเลขจาก evidence JSON ที่ระบบคำนวณแล้ว
 */

import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

export type ChatRole = 'system' | 'user' | 'assistant';
export interface ChatMessage {
  role: ChatRole;
  content: string;
}
export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  /** เวลารอสูงสุด (ms) — ค่าเริ่มต้นจาก OQE_LLM_TIMEOUT_MS (90000) */
  timeoutMs?: number;
}

export type LlmProviderName = 'openai' | 'zai';
export type LlmMode = 'auto' | 'openai' | 'zai' | 'none';

export interface LlmConfig {
  mode: LlmMode;
  openai: { apiKey: string; model: string; baseUrl: string } | null;
  /** ไฟล์ .z-ai-config ที่พบ (โฟลเดอร์แอป → home → /etc) — null = ไม่พบ */
  zaiConfigPath: string | null;
  timeoutMs: number;
  /** ผู้ให้บริการที่จะใช้จริง — null = ไม่ได้ตั้งค่า (ปุ่ม AI ตอบ 503) */
  provider: LlmProviderName | null;
  warnings: string[];
}

export const MSG_LLM_UNAVAILABLE =
  'ยังไม่ได้ตั้งค่า LLM — ตั้ง OQE_LLM_API_KEY + OQE_LLM_MODEL (endpoint แบบ OpenAI-compatible) ในไฟล์ .env ' +
  'หรือวางไฟล์ .z-ai-config แล้วรีสตาร์ต · ส่วนวิเคราะห์อื่นทั้งหมดใช้งานได้ตามปกติโดยไม่ต้องใช้ LLM';

export class LlmUnavailableError extends Error {
  readonly code = 'llm_unavailable' as const;
  constructor(message = MSG_LLM_UNAVAILABLE) {
    super(message);
    this.name = 'LlmUnavailableError';
  }
}

export class LlmRequestError extends Error {
  readonly code = 'llm_failed' as const;
  constructor(
    message: string,
    /** HTTP status ที่ผู้ให้บริการตอบ (0 = เครือข่าย/timeout) */
    readonly upstreamStatus: number,
  ) {
    super(message);
    this.name = 'LlmRequestError';
  }
}

type Env = Record<string, string | undefined>;

function clean(v: string | undefined): string | null {
  const t = (v ?? '').trim();
  return t ? t : null;
}

/** ตำแหน่งที่ z-ai-web-dev-sdk มองหา .z-ai-config (ลำดับเดียวกับ SDK: cwd → home → /etc) */
export function zaiConfigCandidates(cwd = process.cwd(), home = homedir()): string[] {
  return [path.join(cwd, '.z-ai-config'), path.join(home, '.z-ai-config'), '/etc/.z-ai-config'];
}

/** อ่าน env → LlmConfig (pure ต่อ env/fs ที่ส่งเข้า — ใช้ใน test ได้) */
export function readLlmConfig(
  env: Env = process.env,
  opts: { exists?: (p: string) => boolean; cwd?: string; home?: string } = {},
): LlmConfig {
  const warnings: string[] = [];
  const exists = opts.exists ?? existsSync;
  const modeRaw = (clean(env.OQE_LLM_PROVIDER) ?? 'auto').toLowerCase();
  const mode: LlmMode = modeRaw === 'openai' || modeRaw === 'zai' || modeRaw === 'none' ? modeRaw : 'auto';
  if (modeRaw !== mode) warnings.push(`OQE_LLM_PROVIDER="${modeRaw}" ไม่รู้จัก — ใช้ auto (ค่าที่รับ: auto | openai | zai | none)`);

  const apiKey = clean(env.OQE_LLM_API_KEY);
  const model = clean(env.OQE_LLM_MODEL);
  const baseUrl = (clean(env.OQE_LLM_BASE_URL) ?? 'https://api.openai.com/v1').replace(/\/+$/, '');
  let openai: LlmConfig['openai'] = null;
  if (apiKey && model) {
    openai = { apiKey, model, baseUrl };
  } else if (apiKey || model) {
    warnings.push('ตั้ง OQE_LLM_API_KEY หรือ OQE_LLM_MODEL เพียงอย่างเดียว — ต้องตั้งทั้งคู่ จึงจะใช้ endpoint แบบ OpenAI-compatible ได้');
  }
  if (openai && !/^https?:\/\//.test(openai.baseUrl)) {
    warnings.push(`OQE_LLM_BASE_URL="${openai.baseUrl}" ต้องขึ้นต้นด้วย http:// หรือ https:// — ละเว้นผู้ให้บริการนี้`);
    openai = null;
  }

  const zaiConfigPath = zaiConfigCandidates(opts.cwd, opts.home).find((p) => exists(p)) ?? null;

  const timeoutRaw = Number(clean(env.OQE_LLM_TIMEOUT_MS) ?? '90000');
  const timeoutMs = Number.isFinite(timeoutRaw) && timeoutRaw >= 1000 ? Math.round(timeoutRaw) : 90_000;

  let provider: LlmProviderName | null = null;
  if (mode === 'openai') {
    provider = openai ? 'openai' : null;
    if (!openai) warnings.push('OQE_LLM_PROVIDER=openai แต่ยังไม่ได้ตั้ง OQE_LLM_API_KEY + OQE_LLM_MODEL');
  } else if (mode === 'zai') {
    provider = zaiConfigPath ? 'zai' : null;
    if (!zaiConfigPath) warnings.push('OQE_LLM_PROVIDER=zai แต่ไม่พบไฟล์ .z-ai-config');
  } else if (mode === 'auto') {
    provider = openai ? 'openai' : zaiConfigPath ? 'zai' : null;
  }

  return { mode, openai, zaiConfigPath, timeoutMs, provider, warnings };
}

// เตือนครั้งเดียวต่อค่า env (proxy กับ route เป็น bundle แยกกันแต่อยู่ process เดียว → เก็บบน globalThis)
const holder = globalThis as unknown as { __oqeLlmWarned?: Set<string> };

export function getLlmConfig(env: Env = process.env): LlmConfig {
  const cfg = readLlmConfig(env);
  const fp = `${cfg.mode}|${cfg.provider}|${cfg.warnings.join('|')}`;
  const warned = (holder.__oqeLlmWarned ??= new Set());
  if (!warned.has(fp) && env.NODE_ENV !== 'test') {
    warned.add(fp);
    for (const w of cfg.warnings) console.warn(`[llm] ⚠️ ${w}`);
  }
  return cfg;
}

/** สรุปสำหรับ /api/health (ไม่มีความลับ) */
export function describeLlmProvider(env: Env = process.env): { provider: string | null; configured: boolean } {
  const cfg = getLlmConfig(env);
  if (cfg.provider === 'openai' && cfg.openai) return { provider: `openai-compatible · ${cfg.openai.model}`, configured: true };
  if (cfg.provider === 'zai') return { provider: 'z-ai-web-dev-sdk', configured: true };
  return { provider: null, configured: false };
}

// ───────────────────────── providers ─────────────────────────

interface ZaiLike {
  chat: {
    completions: {
      create(body: {
        messages: Array<{ role: string; content: string }>;
        thinking?: { type: 'disabled' | 'enabled' };
        temperature?: number;
        max_tokens?: number;
      }): Promise<{ choices?: Array<{ message?: { content?: string | null } }> }>;
    };
  };
}

export interface LlmDeps {
  fetch?: typeof fetch;
  createZai?: () => Promise<ZaiLike>;
  env?: Env;
  /** config ที่อ่านไว้แล้ว (test ใช้บังคับผู้ให้บริการโดยไม่ต้องมีไฟล์จริง) */
  config?: LlmConfig;
}

async function defaultCreateZai(): Promise<ZaiLike> {
  // import แบบ dynamic — ไม่โหลด SDK เลยถ้าไม่ได้ใช้
  const mod = (await import('z-ai-web-dev-sdk')) as unknown as { default: { create(): Promise<ZaiLike> } };
  return mod.default.create();
}

function shortBody(text: string): string {
  return text.replace(/\s+/g, ' ').slice(0, 200);
}

async function chatOpenAiCompatible(
  cfg: NonNullable<LlmConfig['openai']>,
  messages: ChatMessage[],
  opts: ChatOptions,
  timeoutMs: number,
  fetchFn: typeof fetch,
): Promise<string> {
  const body: Record<string, unknown> = { model: cfg.model, messages };
  if (opts.temperature !== undefined) body.temperature = opts.temperature;
  if (opts.maxTokens !== undefined) body.max_tokens = opts.maxTokens;
  let res: Response;
  try {
    res = await fetchFn(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    const msg = (e as Error)?.name === 'TimeoutError' ? `LLM ไม่ตอบภายใน ${Math.round(timeoutMs / 1000)} วินาที` : `เชื่อมต่อ LLM ไม่ได้: ${(e as Error)?.message ?? e}`;
    throw new LlmRequestError(msg, 0);
  }
  const text = await res.text();
  if (!res.ok) {
    // ไม่ส่ง header/คีย์ออกไป — เฉพาะ status กับ body สั้น ๆ ของผู้ให้บริการ
    throw new LlmRequestError(`ผู้ให้บริการ LLM ตอบ HTTP ${res.status}: ${shortBody(text)}`, res.status);
  }
  let parsed: { choices?: Array<{ message?: { content?: string | null } }> };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new LlmRequestError(`ผู้ให้บริการ LLM ตอบไม่ใช่ JSON: ${shortBody(text)}`, res.status);
  }
  const content = parsed.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new LlmRequestError('ผู้ให้บริการ LLM ตอบว่างเปล่า', res.status);
  return content;
}

async function chatZai(messages: ChatMessage[], opts: ChatOptions, timeoutMs: number, createZai: () => Promise<ZaiLike>): Promise<string> {
  let zai: ZaiLike;
  try {
    zai = await createZai();
  } catch (e) {
    throw new LlmUnavailableError(`z-ai-web-dev-sdk ใช้งานไม่ได้: ${(e as Error)?.message ?? e}`);
  }
  // ต้นฉบับส่งคำสั่งระบบเป็น role "assistant" ผ่าน SDK นี้ — คงพฤติกรรมเดิมไว้ (system → assistant)
  const body = {
    messages: messages.map((m) => ({ role: m.role === 'system' ? 'assistant' : m.role, content: m.content })),
    thinking: { type: 'disabled' as const },
    ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
    ...(opts.maxTokens !== undefined ? { max_tokens: opts.maxTokens } : {}),
  };
  const timer = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new LlmRequestError(`LLM ไม่ตอบภายใน ${Math.round(timeoutMs / 1000)} วินาที`, 0)), timeoutMs),
  );
  let completion: Awaited<ReturnType<ZaiLike['chat']['completions']['create']>>;
  try {
    completion = await Promise.race([zai.chat.completions.create(body), timer]);
  } catch (e) {
    if (e instanceof LlmRequestError) throw e;
    throw new LlmRequestError(`z-ai-web-dev-sdk ล้มเหลว: ${(e as Error)?.message ?? e}`, 0);
  }
  const content = completion.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new LlmRequestError('ผู้ให้บริการ LLM ตอบว่างเปล่า', 0);
  return content;
}

/**
 * เรียก chat completion ผ่านผู้ให้บริการที่ตั้งค่าไว้
 * - ไม่มีผู้ให้บริการ → LlmUnavailableError (route ตอบ 503)
 * - ผู้ให้บริการล้ม/timeout → LlmRequestError (route ตอบ 502)
 */
export async function chatCompletion(
  messages: ChatMessage[],
  opts: ChatOptions = {},
  deps: LlmDeps = {},
): Promise<{ text: string; provider: LlmProviderName }> {
  const cfg = deps.config ?? getLlmConfig(deps.env ?? process.env);
  const timeoutMs = opts.timeoutMs ?? cfg.timeoutMs;
  if (cfg.provider === 'openai' && cfg.openai) {
    return { text: await chatOpenAiCompatible(cfg.openai, messages, opts, timeoutMs, deps.fetch ?? fetch), provider: 'openai' };
  }
  if (cfg.provider === 'zai') {
    return { text: await chatZai(messages, opts, timeoutMs, deps.createZai ?? defaultCreateZai), provider: 'zai' };
  }
  throw new LlmUnavailableError();
}

// ───────────────────────── helpers for routes ─────────────────────────

/**
 * ดึง JSON object จากคำตอบของ LLM — ตัด code fence (```json … ```) และข้อความห่อหน้า/หลัง
 * ไม่ใช่ JSON เลย → throw (ผู้เรียกตัดสินใจ fallback เอง)
 */
export function extractJsonObject(text: string): Record<string, unknown> {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const tryParse = (s: string): Record<string, unknown> | null => {
    try {
      const v = JSON.parse(s);
      return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  };
  const direct = tryParse(cleaned);
  if (direct) return direct;
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) {
    const inner = tryParse(cleaned.slice(start, end + 1));
    if (inner) return inner;
  }
  throw new Error('LLM response is not a JSON object');
}

/** แปลง error ของชั้น LLM เป็นคำตอบ HTTP — คืน null ถ้าไม่ใช่ error ของชั้นนี้ (ให้ route จัดการเอง) */
export function llmErrorResponse(e: unknown): { status: 502 | 503; body: { error: string; detail: string } } | null {
  if (e instanceof LlmUnavailableError) return { status: 503, body: { error: e.code, detail: e.message } };
  if (e instanceof LlmRequestError) return { status: 502, body: { error: e.code, detail: e.message } };
  return null;
}
