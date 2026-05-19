/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        forge: {
          bg: "#07090c",
          panel: "#0d1117",
          line: "#1e293b",
          cyan: "#35d6ff",
          green: "#69f0ae",
          amber: "#f6c85f",
          red: "#ff6b6b",
        },
      },
    },
  },
  plugins: [],
};
