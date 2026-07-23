import type { Config } from "tailwindcss";

// Brand tokens reused from the St. Mary's Bank marketing site so the help desk,
// the PMO app, and a future intranet shell share one design language.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          700: "#123f70",
          800: "#0d3159",
          900: "#0a2540",
        },
        gold: {
          100: "#f7ecd2",
          400: "#dbb246",
          500: "#c99a2e",
        },
        ivory: "#f8f6f1",
        success: "#1e7a4c",
        warning: "#b8860b",
        danger: "#b23b3b",
        info: "#123f70",
      },
      fontFamily: {
        body: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
        serif: ["Georgia", "Times New Roman", "Times", "serif"],
      },
      borderRadius: {
        DEFAULT: "10px",
      },
    },
  },
  plugins: [],
};

export default config;
