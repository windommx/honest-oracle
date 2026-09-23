// ============================================================
// ข้อความภาษาไทยของชั้นความปลอดภัย + หน้า HTML 403 ของโหมด local (ตอบจาก proxy ได้โดยไม่ต้อง render React)
// ============================================================

export const MSG = {
  unauthenticated: "ต้องเข้าสู่ระบบก่อน — เปิด /login หรือส่ง Authorization: Bearer <TMP_API_TOKEN>",
  badToken: "API token ไม่ถูกต้อง",
  viewerReadOnly: "บัญชีผู้ชมเป็นแบบอ่านอย่างเดียว — การแก้ไข/รันงานต้องใช้รหัสผู้ดูแล",
  localOnly:
    "แพลตฟอร์มนี้ยังไม่ได้ตั้งรหัสผ่าน จึงเปิดให้ใช้เฉพาะบนเครื่องที่รันเซิร์ฟเวอร์ (http://localhost) — " +
    "ถ้าต้องการเปิดจากเครื่องอื่น ให้ตั้ง TMP_AUTH_PASSWORD (และ TMP_AUTH_SECRET) ในไฟล์ .env แล้วรีสตาร์ต",
  rateLimited: (label: string, sec: number) => `เรียก${label}ถี่เกินไป — ลองใหม่ในอีก ${sec} วินาที`,
  loginRateLimited: (sec: number) => `พยายามเข้าสู่ระบบบ่อยเกินไป — ลองใหม่ในอีก ${sec} วินาที`,
  badPassword: "รหัสผ่านไม่ถูกต้อง",
  localModeLogin: "ระบบอยู่ในโหมดเครื่องตัวเอง (ไม่ได้ตั้ง TMP_AUTH_PASSWORD) — ไม่ต้องเข้าสู่ระบบ",
} as const

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)
}

/** หน้า 403 ของโหมด local — HTML ล้วน (inline style ผ่าน CSP style-src 'unsafe-inline') โทน Gold Ivory */
export function localOnlyHtml(host: string | null): string {
  const h = esc(host ?? "(ไม่ทราบ)")
  return `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>เข้าถึงได้เฉพาะเครื่องนี้ — Thai Momentum Platform</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#faf7f0;color:#1b2537;font-family:system-ui,'IBM Plex Sans Thai',sans-serif;padding:24px">
<main style="max-width:640px;background:#fff;border:1px solid #efe6d3;border-radius:22px;padding:28px 28px 24px;box-shadow:0 16px 36px -24px rgba(120,90,20,.22)">
<p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:.2em;color:#80600c">THAI MOMENTUM PLATFORM · 403</p>
<h1 style="margin:0 0 12px;font-size:22px">เปิดได้เฉพาะบนเครื่องที่รันเซิร์ฟเวอร์</h1>
<p style="margin:0 0 12px;line-height:1.7">คุณเปิดผ่าน <code style="background:#fbf2da;padding:1px 6px;border-radius:6px">${h}</code> แต่แพลตฟอร์มนี้ยังไม่ได้ตั้งรหัสผ่าน
จึงรับเฉพาะคำขอจาก <b>localhost</b> เพื่อกันไม่ให้คนอื่นในเครือข่ายลบหรือแก้ข้อมูลได้</p>
<p style="margin:0 0 8px;font-weight:600">ต้องการเปิดจากเครื่องอื่น:</p>
<ol style="margin:0 0 14px;padding-left:20px;line-height:1.8">
<li>ตั้งค่าในไฟล์ <code>.env</code>: <code>TMP_AUTH_PASSWORD="รหัสยาวแบบสุ่ม"</code> และ <code>TMP_AUTH_SECRET="$(openssl rand -hex 32)"</code></li>
<li>(ทางเลือก) <code>TMP_VIEWER_PASSWORD</code> สำหรับผู้ชมแบบอ่านอย่างเดียว</li>
<li>รีสตาร์ตเซิร์ฟเวอร์ แล้วเข้าสู่ระบบที่ <code>/login</code></li>
</ol>
<p style="margin:0;font-size:13px;color:#67615a">ใช้บนเครื่องตัวเองตามปกติ: เปิด <code>http://localhost:3000</code> ได้เลยโดยไม่ต้องตั้งค่าใด ๆ</p>
</main></body></html>`
}
