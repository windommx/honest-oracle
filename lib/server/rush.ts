import Anthropic from "@anthropic-ai/sdk";
import { requireUser } from "@/lib/server/session";
import { getEnv } from "@/lib/server/env";
import { getUsageDay } from "@/lib/server/usage";

type AuthUser = NonNullable<Awaited<ReturnType<typeof requireUser>>>;

export type RushAuth =
  | { ok: true; user: AuthUser; client: Anthropic }
  | { ok: false; error: string; status: number };

/**
 * Gate every Rush Engine generation endpoint: requires the server API key,
 * an authenticated user, and (optionally) checks the free-plan daily chapter
 * budget. Returns a ready Anthropic client on success.
 */
export async function authorizeRush(opts?: { checkChapterLimit?: boolean }): Promise<RushAuth> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "ANTHROPIC_API_KEY is not configured on the server.", status: 503 };
  }

  const user = await requireUser();
  if (!user) {
    return { ok: false, error: "Unauthorized", status: 401 };
  }

  if (opts?.checkChapterLimit) {
    const env = getEnv();
    const limit = env.FREE_BOOK_CHAPTERS_DAILY_LIMIT ?? 20;
    if (user.plan === "free" && limit > 0) {
      const usage = await getUsageDay(user.id, new Date());
      if ((usage?.bookChapters ?? 0) >= limit) {
        return {
          ok: false,
          status: 403,
          error: `Daily limit reached (${limit} chapters). Upgrade to Pro for unlimited generation.`,
        };
      }
    }
  }

  return { ok: true, user, client: new Anthropic({ apiKey }) };
}
