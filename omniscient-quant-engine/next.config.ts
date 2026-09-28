import type { NextConfig } from "next";
import path from "node:path";

// ---------- Security headers (ทุก response รวม /api/* และ static) ----------
// CSP แบบไม่ใช้ nonce: หน้าแอปเป็น static prerender + Next ฝัง inline script (RSC payload) และ recharts/radix ใช้ inline style
// → script/style ต้องมี 'unsafe-inline' · dev ต้องมี 'unsafe-eval' (React ใช้ eval สร้าง stack ของ server error) และ ws: (HMR)
// ไม่ใส่ upgrade-insecure-requests: แอปใช้งานผ่าน http://localhost / IP ใน LAN ได้
// HSTS ส่งจาก src/proxy.ts เฉพาะเมื่อ OQE_HSTS=1 และคำขอมาทาง https จริง (หลัง reverse proxy ที่มีใบรับรองถูกต้อง)
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
  // ไม่ตั้ง = Next เดา root เป็น repo → standalone ไปโผล่ที่ .next/standalone/omniscient-quant-engine/server.js
  outputFileTracingRoot: path.join(__dirname),
  turbopack: { root: path.join(__dirname) },
  // เกตของแอปนี้คือ tsc --noEmit ที่รันก่อน build — ไม่ซ่อน type error ตอน build (ต้นฉบับตั้ง ignoreBuildErrors ไว้)
  reactStrictMode: false,
  // ไม่ใช้ next/image — ปิดตัวปรับรูป (/_next/image) ทั้ง endpoint ลดพื้นผิวโจมตี
  images: { unoptimized: true },
  // ไม่ประกาศ X-Powered-By: Next.js
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
