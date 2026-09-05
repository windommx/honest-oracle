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
        background: "#f3f5f9",
        foreground: "#14161c",
        gold: {
          DEFAULT: "#7a5c12", // accent TEXT / borders
          light: "#d9a63a", // accent FILL (dark text on it)
          dark: "#6b5010", // accent text hover
        },
        border: "rgba(122, 92, 18, 0.2)",
        // WCAG-checked faintest text tier (>=4.5:1 on EVERY surface in use) — see app/bookisdom/_tokens.ts
        faint: "#566174",
        accent: {
          DEFAULT: "#7a5c12",
          bright: "#d9a63a",
          deep: "#c8901f",
          dark: "#6b5010",
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
