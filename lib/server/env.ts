import { z } from "zod";

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  Environment configuration.                                              ║
// ║                                                                          ║
// ║  This used to throw `new Error("Missing/invalid environment variables")`  ║
// ║  — the same nine words whether the database URL was absent, the session  ║
// ║  secret was empty, or NEXTAUTH_URL had a typo. An operator watching a    ║
// ║  deploy fail at 2am got no way to tell those apart.                      ║
// ║                                                                          ║
// ║  Now a failure names every variable that is wrong and says what was      ║
// ║  expected, and `inspectEnv()` reports the same thing without throwing,   ║
// ║  so a preflight script can print it before the deploy is live rather     ║
// ║  than after the first request 500s.                                      ║
// ╚══════════════════════════════════════════════════════════════════════════╝

/**
 * The recommended minimum for the NextAuth signing secret.
 *
 * Shorter is a real weakness, but it is a WARNING rather than a hard failure:
 * refusing to boot would take a running deployment down at upgrade time over
 * something that was already true yesterday. It is reported loudly instead.
 */
const SECRET_MIN_LENGTH = 32;

const schema = z.object({
  DATABASE_URL: z
    .string()
    .min(1, "required — the Postgres connection string")
    .refine((v) => v.startsWith("postgres://") || v.startsWith("postgresql://"), {
      message: "must be a postgres:// or postgresql:// URL",
    }),
  NEXTAUTH_SECRET: z.string().min(1, "required — used to sign session tokens"),
  NEXTAUTH_URL: z.string().url("must be an absolute URL, e.g. https://example.com"),

  FREE_ORACLE_DAILY_LIMIT: z.coerce.number().int().min(0).optional(),
  FREE_API_DAILY_LIMIT: z.coerce.number().int().min(0).optional(),

  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  STRIPE_PRICE_ID_PRO: z.string().min(1).optional(),
});

export type Env = z.infer<typeof schema>;

export interface EnvReport {
  ok: boolean;
  /** One line per variable that is missing or malformed. */
  errors: string[];
  /** Present but inadvisable — reported, never fatal. */
  warnings: string[];
}

/**
 * Check the environment without throwing.
 *
 * Used by the preflight script and anything else that would rather print a
 * complete diagnosis than die on the first problem it meets.
 */
// A plain record rather than NodeJS.ProcessEnv: the function only reads string
// keys, and the Next-augmented ProcessEnv demands NODE_ENV, which forces every
// caller building a fixture to supply a field the check does not need.
export function inspectEnv(
  source: Record<string, string | undefined> = process.env,
): EnvReport {
  const parsed = schema.safeParse(source);
  const errors = parsed.success
    ? []
    : parsed.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`);

  const warnings: string[] = [];
  const secret = source.NEXTAUTH_SECRET;
  if (secret && secret.length < SECRET_MIN_LENGTH) {
    warnings.push(
      `NEXTAUTH_SECRET is ${secret.length} characters; ${SECRET_MIN_LENGTH}+ is recommended. ` +
        `Generate one with: openssl rand -base64 32`,
    );
  }

  // Billing is optional, but half-configured billing is a trap: checkout will
  // 501 while the webhook silently accepts nothing, and the first symptom is a
  // customer who paid and did not get their plan.
  const stripeKeys = [
    ["STRIPE_SECRET_KEY", source.STRIPE_SECRET_KEY],
    ["STRIPE_WEBHOOK_SECRET", source.STRIPE_WEBHOOK_SECRET],
    ["STRIPE_PRICE_ID_PRO", source.STRIPE_PRICE_ID_PRO],
  ] as const;
  const present = stripeKeys.filter(([, v]) => v);
  if (present.length > 0 && present.length < stripeKeys.length) {
    const missing = stripeKeys.filter(([, v]) => !v).map(([k]) => k);
    warnings.push(
      `Stripe is partially configured — missing ${missing.join(", ")}. ` +
        `Billing will not complete until all three are set.`,
    );
  }

  if (source.NODE_ENV === "production" && source.NEXTAUTH_URL?.startsWith("http://")) {
    warnings.push("NEXTAUTH_URL is http:// in production; session cookies need https to be Secure.");
  }

  return { ok: errors.length === 0, errors, warnings };
}

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const report = inspectEnv();
    throw new Error(
      `Environment is not configured:\n  - ${report.errors.join("\n  - ")}\n` +
        `See .env.example for the full list.`,
    );
  }
  cached = parsed.data;
  return cached;
}

/** Test seam — the module-level memo would otherwise survive between cases. */
export function _resetEnvCache(): void {
  cached = null;
}
