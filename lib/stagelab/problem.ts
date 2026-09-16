import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  One error envelope for the whole module.                                ║
// ║                                                                          ║
// ║  Before this, failures came back three different ways: a hand-written    ║
// ║  `{ error }`, a zod message pasted into a string, and — worst — the raw  ║
// ║  `error.message` off a caught exception. That last one is how a database ║
// ║  constraint name, a column list, or a connection string ends up rendered ║
// ║  in a customer's browser.                                                ║
// ║                                                                          ║
// ║  Now: the client always gets a Thai sentence it can show, a stable       ║
// ║  machine code it can branch on, and a request id. The *cause* is logged  ║
// ║  server-side against that same id, so support can find it without the    ║
// ║  customer ever having seen it.                                           ║
// ╚══════════════════════════════════════════════════════════════════════════╝

export type ErrorCode =
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'invalid_request'
  | 'upgrade_required'
  | 'limit_reached'
  | 'quota_exhausted'
  | 'conflict'
  | 'payload_too_large'
  | 'internal'

const STATUS: Record<ErrorCode, number> = {
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  invalid_request: 400,
  // 402 for both plan gates: the client shows an upgrade path, not an error.
  upgrade_required: 402,
  limit_reached: 402,
  quota_exhausted: 429,
  conflict: 409,
  payload_too_large: 413,
  internal: 500,
}

export interface Problem {
  error: string
  code: ErrorCode
  requestId: string
  [key: string]: unknown
}

export function newRequestId(): string {
  return randomUUID().slice(0, 8)
}

/** Build an error response. `detail` is merged in for codes that carry context. */
export function fail(
  code: ErrorCode,
  message: string,
  detail?: Record<string, unknown>,
): NextResponse<Problem> {
  const requestId = newRequestId()
  return NextResponse.json(
    { error: message, code, requestId, ...detail },
    { status: STATUS[code], headers: { 'x-request-id': requestId } },
  )
}

/**
 * The catch-all. The caller's exception is logged with the id that goes back to
 * the customer; the customer is told only that something broke and which id to
 * quote. Never pass `error.message` through to `fail` — that is the leak this
 * function exists to close.
 */
export function internalError(where: string, cause: unknown): NextResponse<Problem> {
  const requestId = newRequestId()
  console.error(
    JSON.stringify({
      level: 'error',
      module: 'stagelab',
      where,
      requestId,
      message: cause instanceof Error ? cause.message : String(cause),
      stack: cause instanceof Error ? cause.stack : undefined,
    }),
  )
  return NextResponse.json(
    {
      error: `เกิดข้อผิดพลาดภายในระบบ — แจ้งรหัสอ้างอิง ${requestId} หากต้องการให้ตรวจสอบ`,
      code: 'internal' as const,
      requestId,
    },
    { status: 500, headers: { 'x-request-id': requestId } },
  )
}

/**
 * Wrap a route handler so an unexpected throw becomes a logged 500 rather than
 * Next's default HTML error page (which, in dev, includes the stack).
 */
export function guarded<T extends unknown[]>(
  where: string,
  handler: (...args: T) => Promise<NextResponse>,
): (...args: T) => Promise<NextResponse> {
  return async (...args: T) => {
    try {
      return await handler(...args)
    } catch (cause) {
      return internalError(where, cause)
    }
  }
}

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export function isWrite(req: Request): boolean {
  return WRITE_METHODS.has(req.method.toUpperCase())
}

/**
 * Reject a state-changing request that did not originate from this site.
 *
 * The session cookie is SameSite=Lax, which already stops a browser attaching
 * it to a cross-site POST — that is the real defence and it is not being
 * replaced here. This is the second line, for the cases the cookie policy
 * cannot cover on its own: embedded webviews and older engines that treat an
 * unspecified SameSite as None, and any future change to the cookie config
 * made without remembering why it was Lax.
 *
 * Deliberately permissive where the signal is absent. `Sec-Fetch-Site` is sent
 * by every current browser; a request carrying neither it nor `Origin` is not
 * a browser — curl, a server-side caller, a test — and those were never the
 * threat, because CSRF is an attack on a browser's willingness to attach a
 * cookie it holds.
 */
export function crossOriginWrite(req: Request): NextResponse | null {
  if (!isWrite(req)) return null

  const site = req.headers.get('sec-fetch-site')
  if (site) {
    // `none` is a direct navigation or a tool; `same-site` covers subdomains.
    if (site === 'same-origin' || site === 'none' || site === 'same-site') return null
    return fail('forbidden', 'คำขอนี้ถูกส่งมาจากภายนอกระบบ จึงถูกปฏิเสธ')
  }

  const origin = req.headers.get('origin')
  if (!origin) return null

  try {
    if (new URL(origin).host === new URL(req.url).host) return null
  } catch {
    // An Origin that will not parse is not one we can trust.
  }
  return fail('forbidden', 'คำขอนี้ถูกส่งมาจากภายนอกระบบ จึงถูกปฏิเสธ')
}

/**
 * Reject a body before parsing it. Next buffers the whole request, so an
 * unbounded JSON body is an unbounded allocation on a serverless function with
 * a fixed memory ceiling.
 */
export const MAX_BODY_BYTES = 256 * 1024

export function tooLargeIfDeclared(req: Request): NextResponse | null {
  const declared = Number(req.headers.get('content-length') ?? '0')
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return fail('payload_too_large', 'ข้อมูลที่ส่งมามีขนาดใหญ่เกินกำหนด', {
      maxBytes: MAX_BODY_BYTES,
    })
  }
  return null
}
