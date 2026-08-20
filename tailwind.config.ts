import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0b0e17",
        foreground: "#f8fafc",
        gold: {
          DEFAULT: "#c9a84c",
          light: "#e6c86a",
          dark: "#a8893d",
        },
        border: "rgba(201, 168, 76, 0.2)",
        // WCAG-checked faintest text tier (>=4.5:1 on EVERY surface in use) — see app/rush/_tokens.ts
        faint: "#8290a6",
        accent: {
          DEFAULT: "#ab5bf7",
          bright: "#c084fc",
          deep: "#7c3aed",
          dark: "#6d28d9",
        },
      },
      fontFamily: {
        sans: ["Kanit", "Inter", "sans-serif"],
        thai: ["Kanit", "sans-serif"],
        english: ["Inter", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
