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
        // One light palette for the whole platform — see app/bookisdom/_tokens.ts.
        background: "#f8f8f8",
        foreground: "#111827",
        gold: {
          DEFAULT: "#1d4ed8", // accent TEXT / borders
          light: "#3c74d4", // accent FILL (dark text on it)
          dark: "#1e40af", // accent text hover
        },
        border: "rgba(29, 78, 216, 0.2)",
        // WCAG-checked faintest text tier (>=4.5:1 on EVERY surface in use) — see app/bookisdom/_tokens.ts
        faint: "#4b5563",
        accent: {
          DEFAULT: "#1d4ed8",
          bright: "#3c74d4",
          deep: "#3366bf",
          dark: "#1e40af",
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
