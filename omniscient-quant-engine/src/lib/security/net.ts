// ============================================================
// Host / IP / forwarded headers — ตัดสินว่าคำขอมาจาก "เครื่องนี้" (loopback) หรือไม่
//
// ข้อจำกัดที่ต้องรู้: proxy ของ Next ไม่เห็น socket address โดยตรง — Next ใส่ x-forwarded-for = remoteAddress
// ให้เฉพาะเมื่อ client ไม่ได้ส่งมาเอง → เงื่อนไขนี้กัน DNS rebinding / เปิดจาก IP ของเครื่องในวง LAN / reverse proxy
//   แต่ผู้โจมตีใน LAN ที่ปลอม Host + XFF เองได้ → dev/start จึง bind 127.0.0.1 เป็นค่าเริ่มต้น และควรตั้ง
//   OQE_AUTH_PASSWORD เสมอเมื่อเปิดพอร์ตให้เครื่องอื่นเห็น (ดู .env.example)
// ============================================================

export interface HeaderGetter {
  get(name: string): string | null
}

/** แยก host header → { hostname (ตัวเล็ก ไม่มีวงเล็บ), port | null } · รูปแบบเสีย = null */
export function splitHostPort(raw: string | null | undefined): { hostname: string; port: string | null } | null {
  const s = (raw ?? "").trim().toLowerCase()
  if (!s || s.length > 255 || /[\s/\\@?#]/.test(s)) return null
  if (s.startsWith("[")) {
    const end = s.indexOf("]")
    if (end < 0) return null
    const hostname = s.slice(1, end)
    const rest = s.slice(end + 1)
    if (rest && !/^:\d{1,5}$/.test(rest)) return null
    return { hostname, port: rest ? rest.slice(1) : null }
  }
  const colons = (s.match(/:/g) ?? []).length
  if (colons > 1) return { hostname: s, port: null } // IPv6 ไม่มีวงเล็บ (ไม่มี port)
  const [hostname, port] = s.split(":")
  if (!hostname) return null
  if (port !== undefined && !/^\d{1,5}$/.test(port)) return null
  return { hostname: hostname.replace(/\.$/, ""), port: port ?? null }
}

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/

/** IP ของ loopback: 127.0.0.0/8, ::1, ::ffff:127.x.x.x (IPv4-mapped) — "0.0.0.0" ไม่นับ */
export function isLoopbackIp(ip: string | null | undefined): boolean {
  let s = (ip ?? "").trim().toLowerCase()
  if (!s) return false
  if (s.startsWith("[") && s.includes("]")) s = s.slice(1, s.indexOf("]"))
  if (s.startsWith("::ffff:")) s = s.slice(7)
  if (s === "::1" || s === "0:0:0:0:0:0:0:1") return true
  const m = IPV4.exec(s)
  if (!m) return false
  const octets = m.slice(1).map(Number)
  return octets.every((o) => o <= 255) && octets[0] === 127
}

/** ชื่อโฮสต์ที่ชี้เครื่องนี้แน่นอน (ตามที่ browser ส่งมาใน Host) */
export function isLoopbackHostname(hostname: string | null | undefined): boolean {
  const h = (hostname ?? "").toLowerCase()
  return h === "localhost" || isLoopbackIp(h)
}

/** ค่าหนึ่งตัวใน XFF → IP (ตัด port / วงเล็บ IPv6 / เครื่องหมายคำพูด) */
function normalizeIpToken(token: string): string | null {
  const s = token.trim().replace(/^"|"$/g, "")
  if (!s || s.toLowerCase() === "unknown") return null
  if (s.startsWith("[")) {
    const end = s.indexOf("]")
    return end > 0 ? s.slice(1, end) : null
  }
  const v4port = /^(\d{1,3}(?:\.\d{1,3}){3}):\d{1,5}$/.exec(s)
  if (v4port) return v4port[1]
  return s
}

export function parseForwardedFor(v: string | null | undefined): string[] {
  if (!v) return []
  return v
    .split(",")
    .map(normalizeIpToken)
    .filter((x): x is string => !!x)
}

/** RFC 7239 Forwarded: for=192.0.2.60;proto=http, for="[2001:db8::1]:4711" → รายการ IP */
export function parseForwardedHeader(v: string | null | undefined): string[] {
  if (!v) return []
  const out: string[] = []
  for (const element of v.split(",")) {
    for (const pair of element.split(";")) {
      const [k, ...rest] = pair.split("=")
      if (k?.trim().toLowerCase() !== "for") continue
      const ip = normalizeIpToken(rest.join("="))
      if (ip) out.push(ip)
    }
  }
  return out
}

/** ทุก IP ที่ header อ้างว่าเป็นต้นทาง (XFF + X-Real-IP + Forwarded) */
export function claimedClientIps(headers: HeaderGetter): string[] {
  return [
    ...parseForwardedFor(headers.get("x-forwarded-for")),
    ...parseForwardedFor(headers.get("x-real-ip")),
    ...parseForwardedHeader(headers.get("forwarded")),
  ]
}

/**
 * คำขอมาจากเครื่องนี้หรือไม่ (ใช้ในโหมด local):
 *  - Host ต้องเป็น localhost / 127.x / [::1]  (กัน DNS rebinding และการเปิดผ่าน IP ของเครื่องใน LAN)
 *  - X-Forwarded-Host (ถ้ามี) ต้องเป็น loopback ด้วย
 *  - IP ต้นทางทุกตัวใน XFF / X-Real-IP / Forwarded ต้องเป็น loopback
 */
export function isLoopbackRequest(headers: HeaderGetter): boolean {
  const host = splitHostPort(headers.get("host"))
  if (!host || !isLoopbackHostname(host.hostname)) return false
  const xfh = headers.get("x-forwarded-host")
  if (xfh) {
    for (const part of xfh.split(",")) {
      const h = splitHostPort(part)
      if (!h || !isLoopbackHostname(h.hostname)) return false
    }
  }
  return claimedClientIps(headers).every(isLoopbackIp)
}

/** กุญแจระบุ client สำหรับ rate limit — IP ขวาสุดของ XFF (ตัวที่ Next/reverse proxy ตัวใกล้สุดเติม) */
export function clientKey(headers: HeaderGetter): string {
  const xff = parseForwardedFor(headers.get("x-forwarded-for"))
  if (xff.length > 0) return xff[xff.length - 1]
  const real = parseForwardedFor(headers.get("x-real-ip"))
  return real[0] ?? "unknown"
}

/** คำขอมาทาง https หรือไม่ (ตรง ๆ หรือผ่าน reverse proxy ที่ตั้ง X-Forwarded-Proto) */
export function isHttpsRequest(headers: HeaderGetter, url?: string): boolean {
  const xfp = (headers.get("x-forwarded-proto") ?? "").split(",")[0].trim().toLowerCase()
  if (xfp) return xfp === "https"
  if (url) {
    try {
      return new URL(url).protocol === "https:"
    } catch {
      return false
    }
  }
  return false
}
