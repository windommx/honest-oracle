// ============================================================
// การจัดประเภทเส้นทาง — static asset / public / API
// (matcher ของ src/proxy.ts ตัด asset ส่วนใหญ่ออกตั้งแต่ต้น — ที่นี่ตรวจซ้ำเผื่อ matcher หลุด)
// ============================================================

/** asset ของ Next + ไฟล์ใน public/ + ไอคอน metadata — ไม่ต้องมี session */
export function isStaticAssetPath(pathname: string): boolean {
  return (
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname === "/icon.svg" ||
    pathname === "/logo.svg" ||
    pathname === "/robots.txt"
  )
}

export function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/")
}

/** เข้าได้โดยไม่ต้องเข้าสู่ระบบ (โหมด auth): หน้าเข้าสู่ระบบ ข้อกำหนด API auth และ health check */
export function isPublicPath(pathname: string): boolean {
  return pathname === "/login" || pathname === "/terms" || pathname.startsWith("/api/auth/") || pathname === "/api/health"
}

/** ปลายทางหลังเข้าสู่ระบบ — เฉพาะ path ภายในเว็บนี้ (กัน open redirect เช่น //evil.com, /\evil.com) */
export function safeNextPath(next: unknown): string {
  if (typeof next !== "string") return "/"
  const s = next.trim()
  if (!s.startsWith("/") || s.startsWith("//") || s.includes("\\") || /[\u0000-\u001f]/.test(s)) return "/"
  if (s.length > 512) return "/"
  if (s === "/login" || s.startsWith("/login?") || s.startsWith("/login/")) return "/"
  return s
}
