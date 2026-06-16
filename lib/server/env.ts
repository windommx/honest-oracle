import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  NEXTAUTH_SECRET: z.string().min(1),
  NEXTAUTH_URL: z.string().url(),

  FREE_ORACLE_DAILY_LIMIT: z.coerce.number().int().min(0).optional(),
  FREE_API_DAILY_LIMIT: z.coerce.number().int().min(0).optional(),

  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  STRIPE_PRICE_ID_PRO: z.string().min(1).optional(),

  // Rush Engine — book generation via Claude
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
});

let cached: z.infer<typeof schema> | null = null;

export function getEnv() {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error("Missing/invalid environment variables");
  }
  cached = parsed.data;
  return cached;
}
