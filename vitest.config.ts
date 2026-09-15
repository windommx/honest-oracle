import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname) },
  },
  test: {
    include: ["*.test.{ts,tsx}", "lib/**/*.test.{ts,tsx}", "app/**/*.test.{ts,tsx}"],
    // "*.test.ts" (root only, non-recursive) covers middleware.test.ts — middleware.ts must
    // live at the repo root per Next.js convention, and its test caught a real deploy-
    // blocking regression (see middleware.ts) that nothing had run in CI before.
    environment: "node",
  },
});
