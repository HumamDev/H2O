/**
 * Shared design tokens — single source of truth for colors, spacing, typography.
 * TODO: align with apps/studio-mobile/src/theme/index.ts
 * TODO: shared UI tokens used by both mobile and any future web/desktop surface
 */

export const Colors = {
  primary: '#208AEF',
  primaryDark: '#1570C8',
  background: '#ffffff',
  surface: '#f5f5f5',
  text: '#111111',
  textMuted: '#666666',
  border: '#e0e0e0',
  error: '#D93025',
  success: '#34A853',
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const Radius = {
  sm: 6,
  md: 12,
  lg: 20,
  full: 9999,
} as const;
