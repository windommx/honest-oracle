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
        background: "#08080e",
        foreground: "#ffffff",
        gold: {
          DEFAULT: "#c9a84c",
          light: "#d4b96a",
          dark: "#a8893d",
        },
        border: "rgba(201, 168, 76, 0.2)",
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
