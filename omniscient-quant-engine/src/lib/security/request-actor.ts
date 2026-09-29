// ============================================================
// ผู้เรียกของ route handler — ใช้บันทึก ActionLog / RuleRegistration ว่า "ใคร" ทำ
// proxy ตัดสินสิทธิ์แล้วแต่ไม่ส่ง principal ต่อให้ route → อ่านซ้ำจาก Authorization header + โหมดของระบบที่นี่
// ไม่มีข้อมูลระบุตัวบุคคล (ไม่มีบัญชีรายคน) — บอกได้แค่ "ทาง" ที่เข้ามา
// ============================================================

import { checkApiToken, checkPassword, parseBasic, parseBearer } from "./auth"
import { getSecurityConfig, type SecurityConfig } from "./config"

export type Actor = "local" | "open" | "basic" | "viewer" | "token" | "unknown"

export function requestActor(req: Request, config: SecurityConfig = getSecurityConfig()): Actor {
  const authorization = req.headers.get("authorization")
  if (config.apiToken && checkApiToken(parseBearer(authorization), config.apiToken)) return "token"
  if (config.mode === "local") return config.allowRemoteNoAuth ? "open" : "local"
  const basic = parseBasic(authorization)
  if (basic) {
    if (checkPassword(basic.password, config.password)) return "basic"
    if (config.viewerPassword && checkPassword(basic.password, config.viewerPassword)) return "viewer"
  }
  return "unknown"
}
