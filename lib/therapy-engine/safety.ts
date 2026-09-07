// ╔══════════════════════════════════════════════════════════════════╗
// ║  SAFETY — the one module that is never gated, never A/B tested,   ║
// ║  and never behind a paywall.                                       ║
// ║                                                                    ║
// ║  Design rule: risk is NOT a function of the total score. A person  ║
// ║  can answer 0 to eight PHQ-9 items and 1 to item 9 — a total of 1  ║
// ║  out of 27, which every severity band calls "minimal" — while      ║
// ║  reporting thoughts of self-harm. An app that routes on the sum    ║
// ║  alone shows that person a congratulatory "you're doing great".    ║
// ║  So item 9 is checked BEFORE the total, and it alone can raise the ║
// ║  highest level this engine has.                                    ║
// ║                                                                    ║
// ║  Honest about what this is: a rule table over questionnaire        ║
// ║  answers. It is NOT risk prediction. Suicide risk cannot be        ║
// ║  predicted from a screening item — meta-analyses of risk scales    ║
// ║  find their positive predictive value too low to allocate care by. ║
// ║  What the rules do is decide WHEN TO SHOW THE PHONE NUMBERS, which ║
// ║  is a display decision this engine can honestly make. The engine   ║
// ║  never says "you are safe": absence of a flag is absence of a      ║
// ║  flag, and `SafetyResult.note` says so in as many words.           ║
// ╚══════════════════════════════════════════════════════════════════╝

import type { ScoreResult } from "./types";

/** How urgently the app should put a human in front of the user.
 *  Ordered: crisis > urgent > advised > none. */
export type SafetyLevel = "crisis" | "urgent" | "advised" | "none";

export interface CrisisResource {
  th: string;
  /** Dialable string exactly as a Thai user would dial it. */
  phone: string;
  hoursTh: string;
  note?: string;
}

export interface SafetyResult {
  level: SafetyLevel;
  /** Which rule fired, named, so the routing is auditable rather than magic. */
  reasonsTh: string[];
  /** Shown whenever level !== "none". Empty otherwise. */
  resources: CrisisResource[];
  /** The standing caveat: the engine screens, it does not predict. */
  note: string;
}

/** Thai crisis lines. Verify before each release — numbers and operating hours
 *  change, and a dead hotline in a mental-health app is a safety defect, not a
 *  stale string. */
export const CRISIS_RESOURCES: CrisisResource[] = [
  {
    th: "สายด่วนสุขภาพจิต กรมสุขภาพจิต",
    phone: "1323",
    hoursTh: "ตลอด 24 ชั่วโมง · ไม่มีค่าบริการ",
  },
  {
    th: "สายด่วนการแพทย์ฉุกเฉิน (กรณีเจ็บป่วยฉุกเฉิน/ทำร้ายตัวเองแล้ว)",
    phone: "1669",
    hoursTh: "ตลอด 24 ชั่วโมง",
  },
  {
    th: "Samaritans of Thailand — สายด่วนรับฟัง",
    phone: "02-113-6789",
    hoursTh: "ทุกวัน 12:00–22:00 น.",
    note: "อาสาสมัครรับฟังโดยไม่ตัดสิน (ให้บริการภาษาไทยและอังกฤษ)",
  },
  {
    th: "เหตุด่วนเหตุร้าย — ตำรวจ",
    phone: "191",
    hoursTh: "ตลอด 24 ชั่วโมง",
  },
];

const NOTE =
  "แบบคัดกรองนี้บอกได้เพียงว่าคุณตอบอะไรมา — ไม่สามารถทำนายความเสี่ยงได้ " +
  "การที่ไม่ขึ้นคำเตือนไม่ได้แปลว่าปลอดภัย ถ้ารู้สึกไม่ไหว โทรหาใครสักคนได้เสมอ";

/** Score thresholds at which the app proactively recommends seeing a clinician.
 *  These are the top published severity bands, not thresholds we invented. */
const URGENT_TOTALS = { phq9: 20, gad7: 15 } as const;

/**
 * Decide how urgently to surface human help, from one or more scored instruments.
 *
 * Rule order is deliberate and load-bearing:
 *  1. any endorsement of PHQ-9 item 9  → crisis  (checked first, ignores totals)
 *  2. a score in the top severity band → urgent
 *  3. any score at or above the screening cut-point → advised
 *  4. otherwise → none
 */
export function assessSafety(scores: readonly ScoreResult[]): SafetyResult {
  const reasonsTh: string[] = [];
  let level: SafetyLevel = "none";

  // 1. The item-9 rule. Runs before anything looks at a total.
  if (scores.some((s) => s.safetyFlag)) {
    level = "crisis";
    reasonsTh.push("มีการตอบข้อที่เกี่ยวกับความคิดทำร้ายตัวเอง (PHQ-9 ข้อ 9)");
  }

  // 2. Top severity band on either instrument.
  for (const s of scores) {
    const threshold = URGENT_TOTALS[s.instrument];
    if (s.total >= threshold) {
      if (level === "none") level = "urgent";
      reasonsTh.push(`คะแนน ${s.instrument.toUpperCase()} = ${s.total} อยู่ในช่วง${s.band.th}`);
    }
  }

  // 3. At or above the screening cut-point.
  if (level === "none" && scores.some((s) => s.total >= 10)) {
    level = "advised";
    reasonsTh.push("มีคะแนนถึงจุดตัดของการคัดกรอง — แนะนำให้ปรึกษาผู้ให้บริการสุขภาพ");
  }

  return {
    level,
    reasonsTh,
    resources: level === "none" ? [] : CRISIS_RESOURCES,
    note: NOTE,
  };
}

/** Interventions must never be presented as an alternative to human help when the
 *  level is crisis. The UI asks this before rendering a self-help plan. */
export function selfHelpIsSufficient(level: SafetyLevel): boolean {
  return level === "none" || level === "advised";
}
