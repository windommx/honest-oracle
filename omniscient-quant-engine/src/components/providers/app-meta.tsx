'use client';

/**
 * ข้อมูลกำกับของแอป (GET /api/meta) ให้ทุกส่วนของ UI อ่านจากที่เดียว:
 * ป้ายข้อมูล (จำลอง/จริง + ความสด) · เวอร์ชัน · กติกาที่ใช้ · ผู้ให้บริการ LLM · สิทธิ์เขียน (ผู้ชม = อ่านอย่างเดียว)
 */

import { createContext, useContext } from 'react';
import { useApi } from '@/hooks/use-api';
import type { RulesStampT } from '@/lib/quant/api-types';

export interface AppMeta {
  app: { name: string; version: string; commit: string | null };
  data: {
    kind: 'synthetic' | 'real' | 'unknown';
    label: string;
    source: string | null;
    license: string | null;
    stocks: number;
    firstDate: string | null;
    lastDate: string | null;
    freshness: { status: 'fresh' | 'lagging' | 'stale' | 'empty' | 'synthetic'; lagSessions: number | null; expectedSession: string; notes: string[] };
    coverage: { fundamentals: number; flows: number };
  };
  rules: RulesStampT;
  llm: { provider: string | null; configured: boolean };
  access: { mode: 'auth' | 'local'; actor: string; canWrite: boolean };
}

interface AppMetaState {
  meta: AppMeta | null;
  refresh: () => void;
}

const Ctx = createContext<AppMetaState>({ meta: null, refresh: () => {} });

export function AppMetaProvider({ children }: { children: React.ReactNode }) {
  const q = useApi<AppMeta>('/api/meta');
  return <Ctx.Provider value={{ meta: q.data, refresh: q.refresh }}>{children}</Ctx.Provider>;
}

export function useAppMeta(): AppMetaState {
  return useContext(Ctx);
}

/** ป้ายสั้นของชนิดข้อมูล สำหรับหัวตาราง/กลุ่ม เช่น "หุ้น SET (จำลอง)" */
export function dataKindTag(meta: AppMeta | null): string {
  if (!meta) return '';
  return meta.data.kind === 'real' ? 'ข้อมูลจริง' : meta.data.kind === 'synthetic' ? 'จำลอง' : 'ไม่ทราบที่มา';
}

/** ผู้เรียกแก้ข้อมูล/ใช้ LLM ได้ไหม (ผู้ชม = ไม่ได้) — ระหว่างโหลด meta ถือว่าได้ (proxy ตัดสินจริงอยู่แล้ว) */
export function useCanWrite(): boolean {
  return useContext(Ctx).meta?.access.canWrite ?? true;
}

export const READ_ONLY_HINT = 'ผู้ชม: อ่านอย่างเดียว — ต้องใช้รหัสผู้ดูแล';

/** ตั้งค่าผู้ให้บริการ LLM แล้วหรือยัง (ระหว่างโหลด meta ถือว่าพร้อม — API ตอบ 503 พร้อมวิธีตั้งค่าอยู่แล้ว) */
export function useLlmReady(): boolean {
  return useContext(Ctx).meta?.llm.configured ?? true;
}

export const LLM_MISSING_HINT = 'ยังไม่ได้ตั้งค่า LLM (OQE_LLM_API_KEY + OQE_LLM_MODEL ใน .env) — ส่วนอื่นของระบบทำงานได้โดยไม่ใช้ LLM';
