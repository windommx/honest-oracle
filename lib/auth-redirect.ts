/**
 * Where to send a user after they sign in.
 *
 * The middleware redirects a signed-out visitor to /login?callbackUrl=<where they were>.
 * Before this, the login page ignored that parameter and always landed on /history, so a
 * nurse sent to log in from /competency ended up on the wrong product. Honoured only for
 * a same-origin destination — a relative path, or an absolute URL whose origin matches
 * `origin` — so the parameter can never bounce a user to another site.
 */
export function safeCallbackUrl(search: string, origin: string | null, fallback = "/history"): string {
  const raw = new URLSearchParams(search).get("callbackUrl");
  if (!raw) return fallback;
  if (raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\")) return raw;
  try {
    const url = new URL(raw);
    if (origin && url.origin === origin) return url.pathname + url.search;
  } catch {
    /* not a URL */
  }
  return fallback;
}
