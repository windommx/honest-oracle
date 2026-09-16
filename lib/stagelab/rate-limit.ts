// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  Request rate limiting, and what it is honestly worth.                   ║
// ║                                                                          ║
// ║  Heavy compute is already metered in the database, per user per day, and ║
// ║  that meter is authoritative. This is a different, smaller job: stopping ║
// ║  a client from hammering the CHEAP endpoints — a render loop calling     ║
// ║  /overview a thousand times a second, a double-submit creating the same  ║
// ║  watchlist row twice.                                                    ║
// ║                                                                          ║
// ║  IT IS PER PROCESS. On serverless, each warm instance keeps its own      ║
// ║  counters, so N instances allow roughly N × the limit. That is stated    ║
// ║  here rather than glossed, because a limiter presented as a guarantee it ║
// ║  cannot make is worse than none: it invites someone to rely on it.       ║
// ║                                                                          ║
// ║  What it does reliably catch is the realistic failure — one misbehaving  ║
// ║  client talking to one instance — and it costs no database round trip to ║
// ║  do it. A distributed limit belongs in Redis or at the edge; when that   ║
// ║  exists, this becomes the second line rather than the only one.          ║
// ╚══════════════════════════════════════════════════════════════════════════╝

interface Window {
  /** Request timestamps inside the current window, oldest first. */
  hits: number[]
  /** When this bucket can be dropped — used by the sweeper below. */
  expiresAt: number
}

const buckets = new Map<string, Window>()

/**
 * Hard ceiling on tracked buckets.
 *
 * Without it the map is a memory leak keyed by whatever an attacker can vary.
 * When the cap is hit the oldest-expiring entries go first, which at worst
 * grants a few extra requests to whoever was evicted — the correct failure
 * direction for a limiter that must never take the service down itself.
 */
const MAX_BUCKETS = 10_000

export interface RateLimitResult {
  ok: boolean
  /** Requests still allowed in this window. */
  remaining: number
  /** Milliseconds until the window frees a slot. Zero when `ok`. */
  retryAfterMs: number
}

export interface RateLimitOptions {
  limit: number
  windowMs: number
}

export function rateLimit(key: string, { limit, windowMs }: RateLimitOptions): RateLimitResult {
  const now = Date.now()
  const cutoff = now - windowMs

  let bucket = buckets.get(key)
  if (!bucket) {
    if (buckets.size >= MAX_BUCKETS) sweep(now)
    bucket = { hits: [], expiresAt: now + windowMs }
    buckets.set(key, bucket)
  }

  // Drop timestamps that have aged out. The array is ordered, so this is a
  // prefix removal rather than a filter over the whole thing.
  let drop = 0
  while (drop < bucket.hits.length && bucket.hits[drop] <= cutoff) drop++
  if (drop > 0) bucket.hits.splice(0, drop)

  if (bucket.hits.length >= limit) {
    const oldest = bucket.hits[0]
    return { ok: false, remaining: 0, retryAfterMs: Math.max(1, oldest + windowMs - now) }
  }

  bucket.hits.push(now)
  bucket.expiresAt = now + windowMs
  return { ok: true, remaining: limit - bucket.hits.length, retryAfterMs: 0 }
}

/** Drop expired buckets; if that frees nothing, drop the soonest to expire. */
function sweep(now: number): void {
  for (const [key, bucket] of Array.from(buckets.entries())) {
    if (bucket.expiresAt <= now) buckets.delete(key)
  }
  if (buckets.size < MAX_BUCKETS) return

  const byExpiry = Array.from(buckets.entries()).sort((a, b) => a[1].expiresAt - b[1].expiresAt)
  for (let i = 0; i < Math.ceil(MAX_BUCKETS / 10) && i < byExpiry.length; i++) {
    buckets.delete(byExpiry[i][0])
  }
}

/** Test seam — the module-level map would otherwise leak between cases. */
export function _resetRateLimits(): void {
  buckets.clear()
}

/**
 * The two budgets StageLab uses.
 *
 * Reads are generous because the dashboard legitimately fires several on
 * mount. Writes are tight because no human produces thirty saves a minute, and
 * the thing that does is a bug worth stopping early.
 */
export const READ_BUDGET: RateLimitOptions = { limit: 240, windowMs: 60_000 }
export const WRITE_BUDGET: RateLimitOptions = { limit: 60, windowMs: 60_000 }
