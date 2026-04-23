import { lightTheme } from "./light";

export const darkTheme = {
  ...lightTheme,
  color: {
    ...lightTheme.color,
    bgCanvas: "#0f1319",
    bgSurface: "#1a212b",
    textPrimary: "#f7f9fc",
    textMuted: "#9aa7ba",
    borderSubtle: "#2c3644"
  }
} as const;
