// ============================================================
// Rate limit แบบ token bucket ในหน่วยความจำ — ต่อ (กติกา × เส้นทาง × client)
// server เป็น process เดียว (standalone) → เก็บ state บน globalThis ให้ proxy กับ route ใช้ตัวเดียวกัน
// จำกัดจำนวนกุญแจ (LRU) กันหน่วยความจำโตไม่จำกัดเมื่อถูกยิงด้วย IP ปลอมจำนวนมาก
// ============================================================

export interface BucketSpec {
  /** จำนวนครั้งที่ยิงติดกันได้ (burst) */
  capacity: number
  /** เติม token กี่อันต่อวินาที */
  refillPerSec: number
}

export interface TakeResult {
  ok: boolean
  remaining: number
  /** วินาทีที่ต้องรอจนมี token พอ (0 เมื่อ ok) — ใช้ตอบ header Retry-After */
  retryAfterSec: number
}

interface Bucket {
  tokens: number
  updated: number
}

export class TokenBucketLimiter {
  private buckets = new Map<string, Bucket>()
  constructor(private readonly maxKeys = 10_000) {}

  take(key: string, spec: BucketSpec, now = Date.now(), cost = 1): TakeResult {
    const prev = this.buckets.get(key)
    let tokens = spec.capacity
    if (prev) {
      const elapsed = Math.max(0, now - prev.updated) / 1000
      tokens = Math.min(spec.capacity, prev.tokens + elapsed * spec.refillPerSec)
      this.buckets.delete(key) // ย้ายไปท้าย Map = ใช้ล่าสุด (LRU)
    }
    let ok = false
    if (tokens >= cost) {
      tokens -= cost
      ok = true
    }
    this.buckets.set(key, { tokens, updated: now })
    this.evict()
    const retryAfterSec = ok ? 0 : Math.max(1, Math.ceil((cost - tokens) / spec.refillPerSec))
    return { ok, remaining: Math.floor(tokens), retryAfterSec }
  }

  private evict() {
    while (this.buckets.size > this.maxKeys) {
      const oldest = this.buckets.keys().next().value
      if (oldest === undefined) break
      this.buckets.delete(oldest)
    }
  }

  size(): number {
    return this.buckets.size
  }

  reset(): void {
    this.buckets.clear()
  }
}

// ---------- กติกาของแพลตฟอร์ม ----------
// งานคำนวณหนัก / เรียก LLM / ดึงข้อมูลภายนอก — ตั้งให้ UI ปกติ (เปิดแท็บ สลับไปมา) ไม่ชนเพดาน
export interface RateRule {
  name: string
  /** เมธอดที่นับ ("*" = ทุกเมธอด) */
  methods: readonly string[] | "*"
  test: (pathname: string) => boolean
  spec: BucketSpec
  /** คำอธิบายภาษาไทยในข้อความ 429 */
  label: string
}

const perMin = (n: number, burst = n): BucketSpec => ({ capacity: burst, refillPerSec: n / 60 })

export const RATE_RULES: readonly RateRule[] = [
  {
    name: "llm",
    methods: ["POST"],
    test: (p) => p === "/api/lab/run" || p === "/api/lab/eval",
    spec: perMin(3, 3),
    label: "Shadow Lab (เรียก LLM)",
  },
  {
    name: "external-fetch",
    methods: ["POST"],
    test: (p) => p === "/api/feed/fetch" || p === "/api/gtaa/fetch",
    spec: perMin(2, 3),
    label: "ดึงข้อมูลจากแหล่งภายนอก",
  },
  {
    name: "jev",
    methods: ["POST"],
    test: (p) => p === "/api/jev/run",
    spec: perMin(6, 6),
    label: "รันสมอง Jev",
  },
  {
    name: "research",
    methods: ["POST"],
    test: (p) => p.startsWith("/api/research/"),
    spec: perMin(6, 6),
    label: "งานวิจัย (trial / CPCV)",
  },
  {
    name: "heavy-report",
    methods: ["GET", "HEAD"],
    test: (p) => p === "/api/engines/global" || p === "/api/flagship" || p === "/api/arb/pairs" || p.startsWith("/api/research/"),
    spec: perMin(20, 12),
    label: "รายงานที่คำนวณหนัก",
  },
]

export function matchRateRule(method: string, pathname: string): RateRule | null {
  const m = method.toUpperCase()
  for (const r of RATE_RULES) {
    if ((r.methods === "*" || r.methods.includes(m)) && r.test(pathname)) return r
  }
  return null
}

/** เข้าสู่ระบบ: 5 ครั้ง/นาที/IP + เพดานรวม 30 ครั้ง/นาที (กันการเดารหัสด้วย IP ปลอมหมุนเวียน) */
export const LOGIN_RATE: BucketSpec = perMin(5, 5)
export const LOGIN_GLOBAL_RATE: BucketSpec = perMin(30, 30)

const holder = globalThis as unknown as { __tmpRateLimiter?: TokenBucketLimiter }

export function sharedLimiter(): TokenBucketLimiter {
  return (holder.__tmpRateLimiter ??= new TokenBucketLimiter())
}
