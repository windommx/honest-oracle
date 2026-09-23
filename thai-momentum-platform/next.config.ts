import type { NextConfig } from "next";
import path from "node:path";

// ---------- Security headers (ทุก response รวม /api/* และ static) ----------
// CSP แบบไม่ใช้ nonce: หน้าแอปเป็น static prerender + Next ฝัง inline script (RSC payload) และ recharts/radix ใช้ inline style
// → script/style ต้องมี 'unsafe-inline' · dev ต้องมี 'unsafe-eval' (React ใช้ eval สร้าง stack ของ server error) และ ws: (HMR)
// ไม่ใส่ upgrade-insecure-requests: แอปใช้งานผ่าน http://localhost / IP ใน LAN ได้ (ใส่แล้วทุก asset ถูกบังคับเป็น https → หน้าพัง)
// HSTS ส่งจาก src/proxy.ts เฉพาะเมื่อ TMP_HSTS=1 และคำขอมาทาง https จริง (หลัง reverse proxy ที่มีใบรับรองถูกต้อง)
const isDev = process.env.NODE_ENV !== "production";

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  // แอปนี้อยู่ในโฟลเดอร์ย่อยของ repo ที่มี lockfile ของแอปอื่น — ล็อก root ไว้ที่โฟลเดอร์นี้
  // เพื่อให้ Turbopack/standalone ใช้โฟลเดอร์แอปเป็นราก (.next/standalone/server.js เหมือนต้นฉบับ)
  outputFileTracingRoot: path.join(__dirname),
  turbopack: { root: path.join(__dirname) },
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // ไม่ใช้ next/image — ปิดตัวปรับรูป (/_next/image) ทั้ง endpoint ลดพื้นผิวโจมตี (เคยมี CVE RCE ผ่าน AVIF)
  images: { unoptimized: true },
  // ไม่ประกาศ X-Powered-By: Next.js (ลดการระบุเวอร์ชันเพื่อหาช่องโหว่)
  poweredByHeader: false,
  // next dev ของ Next 16.3 เขียน AGENTS.md / CLAUDE.md เองเมื่อตรวจพบ AI coding agent — ปิดไว้ ไม่ให้ไฟล์ที่ไม่ได้ตั้งใจโผล่ใน repo
  agentRules: false,
  experimental: {
    // มี src/proxy.ts แล้ว Next จะ buffer body ของทุกคำขอไว้ให้ proxy — ค่าเริ่มต้น 10MB และส่วนที่เกิน "ถูกตัดทิ้งเงียบ ๆ"
    // (route เห็น JSON ขาดกลางทาง → 400) · ตั้งเท่าเพดานของ route ที่รับไฟล์ใหญ่สุด: /api/feed/ingest 128MB
    // (/api/ingest CSV ≤ 64M ตัวอักษร) — proxy ไม่อ่าน body เอง ค่านี้แค่กันไม่ให้ body ถูกตัด
    proxyClientMaxBodySize: "128mb",
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
