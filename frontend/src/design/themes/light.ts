import { colorTokens, motionTokens, radiusTokens, shadowTokens, spacingTokens, typographyTokens, zIndexTokens } from "../tokens";

export const lightTheme = {
  color: {
    bgCanvas: colorTokens.neutral[50],
    bgSurface: colorTokens.neutral[0],
    textPrimary: colorTokens.neutral[900],
    textMuted: colorTokens.neutral[500],
    borderSubtle: colorTokens.neutral[100],
    primary: colorTokens.brand[600],
    primaryHover: colorTokens.brand[700],
    success: colorTokens.semantic.success,
    warning: colorTokens.semantic.warning,
    danger: colorTokens.semantic.danger
  },
  spacing: spacingTokens,
  radius: radiusTokens,
  shadow: shadowTokens,
  motion: motionTokens,
  typography: typographyTokens,
  zIndex: zIndexTokens
} as const;

export type Theme = typeof lightTheme;
