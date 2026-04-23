/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx,js,jsx}", "./public/index.html"],
  theme: {
    extend: {
      colors: {
        brand: "var(--color-primary)",
        "bg-canvas": "var(--color-bg-canvas)",
        "bg-surface": "var(--color-bg-surface)",
        "text-primary": "var(--color-text-primary)",
        "text-muted": "var(--color-text-muted)",
        "border-subtle": "var(--color-border-subtle)"
      },
      fontFamily: {
        base: ["var(--font-family-base)"],
        display: ["var(--font-family-display)"]
      },
      borderRadius: {
        lg: "var(--radius-lg)"
      }
    }
  },
  plugins: []
};
