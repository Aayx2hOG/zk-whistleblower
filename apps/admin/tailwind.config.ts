import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}", "../../packages/ui/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#060610",
        "background-dark": "#060610",
        brand: {
          "50": "#f0fdf4",
          "500": "#22c55e",
          "600": "#16a34a",
          "700": "#15803d",
          "900": "#14532d",
        },
      },
      fontFamily: {
        display: ["var(--font-inter)", "Inter", "sans-serif"],
        mono: ["var(--font-jetbrains)", "JetBrains Mono", "monospace"],
      },
      borderRadius: {
        DEFAULT: "0px",
        lg: "0px",
        xl: "0px",
        full: "9999px",
      },
    },
  },
  plugins: [],
};

export default config;
