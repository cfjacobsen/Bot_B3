import type { Config } from "tailwindcss";

export default {
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0b0f1a",
        surface: "#11182b",
        accent: "#00d1ff",
        success: "#2ecc71",
        warning: "#f1c40f",
        danger: "#e74c3c",
      },
    },
  },
  plugins: [],
} satisfies Config;
