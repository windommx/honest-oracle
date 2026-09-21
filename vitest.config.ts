import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname) },
  },
  test: {
    // components/ is here because a guard test that the runner never picks up
    // is worse than no guard: it reads as coverage in the file tree and
    // protects nothing. Any new top-level directory holding tests has to be
    // added, which the "every test file is included" check below enforces.
    include: ["lib/**/*.test.{ts,tsx}", "app/**/*.test.{ts,tsx}", "components/**/*.test.{ts,tsx}"],
    environment: "node",
  },
});
