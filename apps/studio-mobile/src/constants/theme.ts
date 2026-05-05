/**
 * Mobile theme palettes. Three schemes:
 *   - cockpit (default) — warm-charcoal premium, ember accent, cobalt secondary
 *   - dark              — neutral pure dark
 *   - light             — neutral light
 *
 * Every scheme exposes the same token shape so consumers can read
 * `th.accent`, `th.hairline`, etc. without scheme-conditional code.
 */

import '@/global.css';

import { Platform } from 'react-native';

// ── Cockpit Pro palette (single source of truth) ─────────────────────────────
// Mirrored by `components/cockpit/tokens.ts` for the fixed-look entry surface.
const COCKPIT = {
  bg: '#1B1B19',
  bgRaised: '#262624',
  bgHover: '#2D2D2A',
  hair: 'rgba(255,255,255,0.09)',
  hairStrong: 'rgba(255,255,255,0.14)',
  ink: '#ECEAE3',
  inkMuted: '#C9C6BD',
  inkDim: '#8F8C82',
  inkFaint: '#5F5C54',
  cobalt: '#5B7BC9',
  cyan: '#8AAAD6',
  cyanSoft: 'rgba(138,170,214,0.12)',
  ember: '#D97757',
  emberSoft: 'rgba(217,119,87,0.14)',
} as const;

export const CockpitPalette = COCKPIT;

export const Colors = {
  light: {
    text: '#000000',
    background: '#ffffff',
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    textSecondary: '#60646C',
    accent: COCKPIT.ember,
    accentSoft: 'rgba(217,119,87,0.14)',
    secondary: COCKPIT.cobalt,
    hairline: 'rgba(0,0,0,0.10)',
    danger: '#E15554',
    dangerSoft: 'rgba(225,85,84,0.10)',
    success: '#0F7B2C',
    successSoft: 'rgba(15,123,44,0.10)',
  },
  dark: {
    text: '#ffffff',
    background: '#000000',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
    accent: COCKPIT.ember,
    accentSoft: 'rgba(217,119,87,0.18)',
    secondary: COCKPIT.cyan,
    hairline: 'rgba(255,255,255,0.10)',
    danger: '#E15554',
    dangerSoft: 'rgba(225,85,84,0.16)',
    success: '#9AD8A4',
    successSoft: 'rgba(154,216,164,0.14)',
  },
  cockpit: {
    text: COCKPIT.ink,
    background: COCKPIT.bg,
    backgroundElement: COCKPIT.bgRaised,
    backgroundSelected: COCKPIT.bgHover,
    textSecondary: COCKPIT.inkDim,
    accent: COCKPIT.ember,
    accentSoft: COCKPIT.emberSoft,
    secondary: COCKPIT.cyan,
    hairline: COCKPIT.hair,
    danger: '#E15554',
    dangerSoft: 'rgba(225,85,84,0.14)',
    success: '#9AD8A4',
    successSoft: 'rgba(154,216,164,0.14)',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark & keyof typeof Colors.cockpit;
export type ColorScheme = keyof typeof Colors;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
