// ============================================================
// ข้อความภาษาไทยของชั้นความปลอดภัย + หน้า HTML 403/401 ที่ตอบจาก proxy ได้โดยไม่ต้อง render React
// ============================================================

export const MSG = {
  unauthenticated: "ต้องยืนยันตัวตนก่อน — ส่ง HTTP Basic auth ด้วยรหัสผ่าน OQE_AUTH_PASSWORD หรือ Authorization: Bearer <OQE_API_TOKEN>",
  badPassword: "รหัสผ่านไม่ถูกต้อง",
  badToken: "API token ไม่ถูกต้อง",
  localOnly:
    "แพลตฟอร์มนี้ยังไม่ได้ตั้งรหัสผ่าน จึงเปิดให้ใช้เฉพาะบนเครื่องที่รันเซิร์ฟเวอร์ (http://localhost) — " +
    "ถ้าต้องการเปิดจากเครื่องอื่น ให้ตั้ง OQE_AUTH_PASSWORD ในไฟล์ .env แล้วรีสตาร์ต",
  rateLimited: (label: string, sec: number) => `เรียก${label}ถี่เกินไป — ลองใหม่ในอีก ${sec} วินาที`,
  authRateLimited: (sec: number) => `พยายามยืนยันตัวตนบ่อยเกินไป — ลองใหม่ในอีก ${sec} วินาที`,
} as const

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)
}

function page(title: string, heading: string, body: string): string {
  return `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(title)} — Omniscient Quant Engine</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#09090b;color:#e4e4e7;font-family:system-ui,sans-serif;padding:24px">
<main style="max-width:640px;background:#18181b;border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:28px 28px 24px">
<p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:.2em;color:#fbbf24">OMNISCIENT QUANT ENGINE · ${esc(title)}</p>
<h1 style="margin:0 0 12px;font-size:22px;color:#fafafa">${esc(heading)}</h1>
${body}
</main></body></html>`
}

/** หน้า 403 ของโหมด local — HTML ล้วน (inline style ผ่าน CSP style-src 'unsafe-inline') */
export function localOnlyHtml(host: string | null): string {
  const h = esc(host ?? "(ไม่ทราบ)")
  return page(
    "403",
    "เปิดได้เฉพาะบนเครื่องที่รันเซิร์ฟเวอร์",
    `<p style="margin:0 0 12px;line-height:1.7">คุณเปิดผ่าน <code style="background:#27272a;padding:1px 6px;border-radius:6px">${h}</code> แต่แพลตฟอร์มนี้ยังไม่ได้ตั้งรหัสผ่าน
จึงรับเฉพาะคำขอจาก <b>localhost</b> เพื่อกันไม่ให้คนอื่นในเครือข่ายแก้ journal รีเซ็ตข้อมูล หรือใช้โควตา LLM ได้</p>
<p style="margin:0 0 8px;font-weight:600">ต้องการเปิดจากเครื่องอื่น:</p>
<ol style="margin:0 0 14px;padding-left:20px;line-height:1.8">
<li>ตั้งค่าในไฟล์ <code>.env</code>: <code>OQE_AUTH_PASSWORD="รหัสยาวแบบสุ่ม"</code> (และ <code>OQE_API_TOKEN</code> สำหรับสคริปต์)</li>
<li>รีสตาร์ตเซิร์ฟเวอร์ให้ฟัง 0.0.0.0 (<code>bun run start:lan</code>) — browser จะถามรหัสผ่านเอง</li>
<li>ใช้งานผ่านอินเทอร์เน็ตให้มี TLS reverse proxy ด้านหน้าเสมอ</li>
</ol>
<p style="margin:0;font-size:13px;color:#a1a1aa">ใช้บนเครื่องตัวเองตามปกติ: เปิด <code>http://localhost:3000</code> ได้เลยโดยไม่ต้องตั้งค่าใด ๆ</p>`,
  )
}

/** หน้า 401 ของโหมด auth (browser ที่ยกเลิก dialog รหัสผ่านจะเห็นหน้านี้) */
export function unauthorizedHtml(): string {
  return page(
    "401",
    "ต้องใส่รหัสผ่าน",
    `<p style="margin:0 0 12px;line-height:1.7">แพลตฟอร์มนี้อยู่ในโหมด auth — โหลดหน้าใหม่แล้วใส่รหัสผ่าน (<code>OQE_AUTH_PASSWORD</code>) ในช่องที่ browser ถาม
ชื่อผู้ใช้ใส่อะไรก็ได้ · สคริปต์ใช้ <code>Authorization: Bearer &lt;OQE_API_TOKEN&gt;</code> ที่ <code>/api/*</code></p>`,
  )
}
