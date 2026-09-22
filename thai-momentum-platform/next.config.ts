import type { NextConfig } from "next";
import path from "node:path";

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
};

export default nextConfig;
