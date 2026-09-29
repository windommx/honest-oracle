import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

// กติกา lint = ค่าเริ่มต้นของ Next (core-web-vitals + typescript) ทั้งหมด — ปรับเฉพาะที่มีเหตุผลด้านล่าง
const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      // ตัวแปร/อาร์กิวเมนต์ที่ตั้งใจไม่ใช้ให้ขึ้นต้นด้วย _ (เช่น ตัด field ออกจาก object ด้วย rest)
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none", ignoreRestSiblings: true }],
      // catch {} ที่ตั้งใจกลืน error (มีคอมเมนต์อธิบายทุกจุด) — block ว่างแบบอื่นยังผิด
      "no-empty": ["error", { allowEmptyCatch: true }],
      // log ฝั่ง server ผ่าน console (src/lib/log.ts) เป็นการออกแบบ ไม่ใช่เศษ debug
      "no-console": "off",
    },
  },
  {
    ignores: ["node_modules/**", ".next/**", ".e2e/**", "out/**", "build/**", "next-env.d.ts", "examples/**", "skills"],
  },
];

export default eslintConfig;
