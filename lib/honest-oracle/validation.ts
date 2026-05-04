import { z } from "zod";

export const oracleInputSchema = z.object({
  inputName: z.string().trim().min(1).max(120),
  birthDate: z.string().datetime(),
  birthTime: z.string().trim().max(20).optional().nullable(),
  birthPlace: z.string().trim().max(120).optional().nullable(),
});

export const apiKeyCreateSchema = z.object({
  label: z.string().trim().min(1).max(60),
});

