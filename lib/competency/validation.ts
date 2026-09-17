import { z } from "zod";
import { CRITERIA, DEFAULT_POSITION } from "./criteria";
import { parseAssessDate } from "./format";
import { validateScores, type Scores } from "./scoring";

// ╔══════════════════════════════════════════════════════════════════╗
// ║  REQUEST VALIDATION — zod schemas for /api/competency. The scores  ║
// ║  rule delegates to scoring.validateScores so the API, the form    ║
// ║  preview and the tests all enforce the same definition of         ║
// ║  "complete".                                                       ║
// ╚══════════════════════════════════════════════════════════════════╝

/** "" and whitespace collapse to null; anything else is trimmed. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

const mgmtLevel = z
  .union([z.literal(6), z.literal(7)])
  .nullish()
  .transform((v) => v ?? null);

export const nurseCreateSchema = z.object({
  fullName: z.string().trim().min(1, "กรุณาระบุชื่อ-นามสกุล").max(120),
  nickname: optionalText(60),
  position: z
    .string()
    .trim()
    .max(120)
    .nullish()
    .transform((v) => (v ? v : DEFAULT_POSITION)),
  mgmtLevel,
});

export const nurseUpdateSchema = z
  .object({
    fullName: z.string().trim().min(1, "กรุณาระบุชื่อ-นามสกุล").max(120),
    nickname: optionalText(60),
    position: z
      .string()
      .trim()
      .max(120)
      .transform((v) => (v ? v : DEFAULT_POSITION)),
    mgmtLevel,
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "ไม่มีข้อมูลที่จะแก้ไข" });

/** A complete scores map: exactly the ten criteria, each an integer 1-5. */
export const scoresSchema = z
  .record(z.string(), z.number().int().min(1).max(5))
  .superRefine((value, ctx) => {
    const v = validateScores(value);
    if (!v.ok) ctx.addIssue({ code: z.ZodIssueCode.custom, message: v.message ?? "คะแนนไม่ครบ" });
    const known = new Set(CRITERIA.map((c) => String(c.id)));
    for (const k of Object.keys(value)) {
      if (!known.has(k)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `ไม่รู้จักเกณฑ์ "${k}"` });
    }
  })
  .transform((v) => v as Scores);

const assessDateSchema = z
  .string()
  .refine((v) => parseAssessDate(v) !== null, { message: "วันที่ประเมินไม่ถูกต้อง" })
  .transform((v) => parseAssessDate(v) as Date);

export const assessmentCreateSchema = z
  .object({
    nurseId: z.string().trim().min(1).optional(),
    nurse: nurseCreateSchema.optional(),
    scores: scoresSchema,
    assessDate: assessDateSchema.optional(),
    assessor: optionalText(120),
    note: optionalText(1000),
  })
  .refine((v) => Boolean(v.nurseId) !== Boolean(v.nurse), {
    message: "กรุณาเลือกพยาบาลหรือระบุชื่อพยาบาลใหม่ (อย่างใดอย่างหนึ่ง)",
    path: ["nurseId"],
  });

export const assessmentUpdateSchema = z
  .object({
    scores: scoresSchema,
    assessDate: assessDateSchema,
    assessor: optionalText(120),
    note: optionalText(1000),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "ไม่มีข้อมูลที่จะแก้ไข" });

export type NurseCreateInput = z.infer<typeof nurseCreateSchema>;
export type NurseUpdateInput = z.infer<typeof nurseUpdateSchema>;
export type AssessmentCreateInput = z.infer<typeof assessmentCreateSchema>;
export type AssessmentUpdateInput = z.infer<typeof assessmentUpdateSchema>;

/** First issue message, for a 400 body a Thai-speaking user can act on. */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง";
}
