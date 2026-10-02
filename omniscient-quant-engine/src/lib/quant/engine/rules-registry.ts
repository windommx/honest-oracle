/**
 * rules-registry.ts — pre-registration ของกติกา (server-only, ใช้ DB)
 * ล็อก = บันทึก sha256 ของ RULES ปัจจุบันลง RuleRegistration · ทุกรายงานติด stamp ว่า hash ที่ใช้ตรงกับที่ล็อกไว้ล่าสุดหรือไม่
 */

import { db } from '@/lib/db';
import { RULES, RULES_HASH, RULES_HASH_SHORT, RULES_PROVENANCE, RULES_VERSION } from './rules';

export interface RulesStamp {
  hash: string;
  hashShort: string;
  version: string;
  /** การล็อกล่าสุด — null = ยังไม่เคยล็อก */
  registered: { hash: string; hashShort: string; at: string; note: string | null; actor: string; version: string } | null;
  /** hash ปัจจุบันตรงกับที่ล็อกล่าสุด (กติกาไม่ถูกแก้หลังล็อก) */
  matchesRegistered: boolean;
  tunedOn: string;
}

export async function latestRegistration() {
  return db.ruleRegistration.findFirst({ orderBy: { createdAt: 'desc' } });
}

export async function rulesStamp(): Promise<RulesStamp> {
  let reg: Awaited<ReturnType<typeof latestRegistration>> = null;
  try {
    reg = await latestRegistration();
  } catch {
    reg = null; // DB ยังไม่มีตาราง (schema เก่า) — รายงานว่ายังไม่ล็อก ไม่ทำให้รายงานหลักล้ม
  }
  return {
    hash: RULES_HASH,
    hashShort: RULES_HASH_SHORT,
    version: RULES_VERSION,
    registered: reg
      ? { hash: reg.rulesHash, hashShort: reg.rulesHash.slice(0, 12), at: reg.createdAt.toISOString(), note: reg.note, actor: reg.actor, version: reg.rulesVersion }
      : null,
    matchesRegistered: reg?.rulesHash === RULES_HASH,
    tunedOn: RULES_PROVENANCE.tunedOn,
  };
}

export async function registerRules(note: string | null, actor: string) {
  return db.ruleRegistration.create({
    data: { rulesHash: RULES_HASH, rulesVersion: RULES_VERSION, rules: RULES as unknown as object, note, actor },
  });
}
