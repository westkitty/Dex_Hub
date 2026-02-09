/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0f172a",
        accent: {
          primary: "#38bdf8",
          secondary: "#f97316",
        },
      },
    },
  },
  plugins: [],
}
