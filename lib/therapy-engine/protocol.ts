// ╔══════════════════════════════════════════════════════════════════╗
// ║  PROTOCOL — from a score to a plan, by rules printed on the plan.  ║
// ║                                                                    ║
// ║  Every commercial wellness app has a step like this, and it is     ║
// ║  almost always the dishonest one: a black box that "personalises"  ║
// ║  by means nobody can inspect, and that routes everyone to the      ║
// ║  content the app happens to own.                                   ║
// ║                                                                    ║
// ║  The rules here are a small, readable table, and `CarePlan.rulesTh`║
// ║  ships the rule that fired ALONGSIDE the plan, so a user can see   ║
// ║  why they got what they got and disagree with it.                  ║
// ║                                                                    ║
// ║  The load-bearing rule: SAFETY OUTRANKS THE PLAN. At crisis level  ║
// ║  the plan does not lead with breathing exercises. It leads with a  ║
// ║  phone number, and anything self-administered is explicitly        ║
// ║  demoted to "while you arrange that" — never presented as the      ║
// ║  treatment. An app that answers suicidal ideation with a playlist  ║
// ║  has not made a UX mistake; it has made a safety one.              ║
// ╚══════════════════════════════════════════════════════════════════╝

import { INTERVENTIONS, getIntervention } from "./evidence";
import { assessSafety, selfHelpIsSufficient, type SafetyResult } from "./safety";
import type { Intervention, ScoreResult } from "./types";

/** How much of the plan a person can carry out alone. */
export type CareTier = "self-help" | "guided" | "clinician-led";

export interface PlanStep {
  intervention: Intervention;
  /** The dose as a sentence, built from the intervention's own dose record. */
  doseTh: string;
  /** True when this step is information about a treatment the app cannot deliver. */
  informationalOnly: boolean;
}

export interface CarePlan {
  tier: CareTier;
  headlineTh: string;
  safety: SafetyResult;
  steps: PlanStep[];
  /** When to take the questionnaires again. Two weeks, because that is the recall
   *  window the items ask about — retaking sooner re-measures the same fortnight. */
  reassessInWeeks: number;
  /** The rules that produced this plan, in words. */
  rulesTh: string[];
  /** What the plan is not. Always non-empty. */
  disclaimersTh: string[];
}

const TIER_LABEL: Record<CareTier, string> = {
  "self-help": "ดูแลตัวเองได้ — ลอง intervention พื้นฐาน 4 สัปดาห์",
  guided: "ดูแลตัวเองควบคู่กับการปรึกษาผู้ให้บริการสุขภาพ",
  "clinician-led": "ควรให้ผู้ให้บริการสุขภาพเป็นผู้นำการดูแล",
};

function doseSentence(i: Intervention): string {
  if (!i.dose) return "ขนาดและวิธีใช้กำหนดโดยแพทย์เท่านั้น";
  const [lo, hi] = i.dose.minutesPerSession;
  const per = lo === hi ? `${lo} นาที` : `${lo}–${hi} นาที`;
  const freq = i.dose.sessionsPerWeek === 7 ? "ทุกวัน" : `${i.dose.sessionsPerWeek} ครั้ง/สัปดาห์`;
  return `${per} ${freq} · งานวิจัยเห็นผลที่ราว ${i.dose.weeksToEffect} สัปดาห์`;
}

const step = (i: Intervention): PlanStep => ({
  intervention: i,
  doseTh: doseSentence(i),
  informationalOnly: !i.selfAdministered,
});

/** Self-administered interventions in evidence order — strongest grade first, and
 *  within a grade, the catalog's own order. The user's plan is not a ranking we
 *  tuned; it is the evidence table filtered. */
function selfHelpSteps(): PlanStep[] {
  const order = { strong: 0, good: 1, moderate: 2, emerging: 3 };
  return INTERVENTIONS.filter((i) => i.selfAdministered)
    .slice()
    .sort((a, b) => order[a.grade] - order[b.grade])
    .map(step);
}

/** Treatments the app cannot deliver, listed so the full picture is visible. */
function clinicianSteps(includeSleep: boolean): PlanStep[] {
  const ids = includeSleep ? ["cbt", "cbti", "ssri"] : ["cbt", "ssri"];
  return ids.map((id) => step(getIntervention(id)!));
}

export interface PlanInput {
  scores: readonly ScoreResult[];
  /** From sleep.ts — when the diary meets the conventional frequency criterion,
   *  CBT-I joins the plan. */
  sleepDisturbed?: boolean;
}

/**
 * Build a care plan.
 *
 * Rule order, and it is the order that matters:
 *  1. safety.assessSafety() first — its level can override the tier downward-safe
 *     but never upward-permissive.
 *  2. tier from the highest severity band reached across instruments.
 *  3. steps = self-administered interventions, plus clinician-led ones as
 *     information whenever the tier is above self-help.
 */
export function buildPlan({ scores, sleepDisturbed = false }: PlanInput): CarePlan {
  const safety = assessSafety(scores);
  const rulesTh: string[] = [];

  const worst = scores.reduce((max, s) => Math.max(max, s.total >= 15 ? 3 : s.total >= 10 ? 2 : s.total >= 5 ? 1 : 0), 0);

  let tier: CareTier = worst >= 3 ? "clinician-led" : worst === 2 ? "guided" : "self-help";
  rulesTh.push(
    tier === "clinician-led"
      ? "มีคะแนนอยู่ในช่วงรุนแรงอย่างน้อยหนึ่งแบบประเมิน → ให้ผู้ให้บริการสุขภาพนำการดูแล"
      : tier === "guided"
        ? "มีคะแนนถึงจุดตัดของการคัดกรอง (≥10) → ดูแลตัวเองควบคู่กับการปรึกษาผู้ให้บริการสุขภาพ"
        : "คะแนนต่ำกว่าจุดตัดของการคัดกรอง → เริ่มจาก intervention ที่ทำเองได้"
  );

  // Safety can only tighten the tier, never loosen it.
  if (!selfHelpIsSufficient(safety.level) && tier !== "clinician-led") {
    tier = "clinician-led";
    rulesTh.push("ระดับความปลอดภัยอยู่เหนือผลคะแนน → ยกระดับเป็นการดูแลโดยผู้ให้บริการสุขภาพ");
  }

  const steps =
    tier === "self-help"
      ? selfHelpSteps()
      : [...clinicianSteps(sleepDisturbed), ...selfHelpSteps()];

  if (sleepDisturbed && tier === "self-help") {
    rulesTh.push("บันทึกการนอนเข้าเกณฑ์เชิงปริมาณ → แนะนำให้ปรึกษาเรื่อง CBT-I");
    steps.push(step(getIntervention("cbti")!));
  }

  const disclaimersTh = [
    "แผนนี้สร้างจากตารางกฎที่แสดงไว้ด้านบน ไม่ใช่การประเมินโดยผู้เชี่ยวชาญ และไม่ใช่การวินิจฉัย",
    "ลำดับของ intervention มาจากระดับหลักฐานในตารางอ้างอิง ไม่ได้ปรับตามสิ่งที่แอปนี้ให้บริการ",
    "แอปนี้ไม่ได้ให้บริการ CBT, CBT-I หรือการสั่งจ่ายยา — รายการเหล่านั้นแสดงไว้เพื่อให้เห็นทางเลือกครบ",
  ];

  return {
    tier,
    headlineTh:
      safety.level === "crisis"
        ? "ติดต่อขอความช่วยเหลือก่อน — สิ่งที่ทำเองได้เป็นเพียงตัวช่วยระหว่างรอ"
        : TIER_LABEL[tier],
    safety,
    steps,
    reassessInWeeks: 2,
    rulesTh,
    disclaimersTh,
  };
}
