export const colorTokens = {
  brand: {
    50: "#f5fbf8",
    100: "#d8f2e6",
    500: "#2f9e62",
    600: "#257c4d",
    700: "#1e653f"
  },
  neutral: {
    0: "#ffffff",
    50: "#f7f8fa",
    100: "#eceff3",
    300: "#c7ced8",
    500: "#6c7786",
    700: "#2f3a48",
    900: "#18202a"
  },
  semantic: {
    success: "#20915a",
    warning: "#c78600",
    danger: "#c63f3f",
    info: "#2b73d6"
  }
} as const;

export type ColorTokens = typeof colorTokens;
