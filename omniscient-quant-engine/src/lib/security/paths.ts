// ============================================================
// การจำแนก path — ใช้ร่วมกันระหว่าง proxy (matcher) และ policy
// ============================================================

/** asset ของ Next / ไฟล์ใน public/ — ไม่ผ่านการตรวจสิทธิ์ (ไม่มีข้อมูลของผู้ใช้) */
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

/** เข้าได้โดยไม่ต้องยืนยันตัวตน (โหมด auth): health check ของ monitor / Docker */
export function isPublicPath(pathname: string): boolean {
  return pathname === "/api/health"
}
