/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./popup.html",
    "./popup.js",
    "./enrich.js"
  ],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: "#007bff", hover: "#0056b3" },
        success: { DEFAULT: "#28a745", hover: "#218838" },
        danger: "#dc3545",
      },
      fontFamily: {
        sans: ["-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
      },
    },
  },
  plugins: [],
};
