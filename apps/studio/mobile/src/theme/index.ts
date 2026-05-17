// Theme — design tokens, color palettes, typography scale.
// TODO: align with shared UI tokens from packages/studio-ui
import { Platform } from 'react-native';

export const colors = {
  primary: '#208AEF',
  background: '#ffffff',
  surface: '#f5f5f5',
  text: '#111111',
  textMuted: '#666666',
  border: '#e0e0e0',
} as const;

export const projectColorOptions = [
  { key: 'blue', label: 'Blue', color: '#3B82F6' },
  { key: 'red', label: 'Red', color: '#FF4C4C' },
  { key: 'green', label: 'Green', color: '#22C55E' },
  { key: 'gold', label: 'Gold', color: '#FFD54F' },
  { key: 'sky', label: 'Sky', color: '#7DD3FC' },
  { key: 'pink', label: 'Pink', color: '#F472B6' },
  { key: 'purple', label: 'Purple', color: '#A855F7' },
  { key: 'orange', label: 'Orange', color: '#FF914D' },
] as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const typography = {
  title: { fontSize: 24, fontWeight: '700' as const },
  body: { fontSize: 15 },
  caption: { fontSize: 12, color: '#666' },
} as const;

const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) ?? 'monospace';

export const chatTypography = {
  h1: { fontSize: 22, fontWeight: '700' as const, lineHeight: 29 },
  h2: { fontSize: 19, fontWeight: '700' as const, lineHeight: 26 },
  h3: { fontSize: 17, fontWeight: '700' as const, lineHeight: 24 },
  body: { fontSize: 16.5, lineHeight: 25.5 },
  code: { fontSize: 13.5, fontFamily: MONO, lineHeight: 21 },
};

export const chatSpacing = {
  paragraphGap: 12,
  headingTopMargin: 18,
  headingBottomMargin: 8,
  listItemGap: 8,
  listIndent: 2,
  listMarkerWidth: 24,
  listMarkerGap: 8,
  codeBlockPadding: 14,
  codeBlockRadius: 12,
  inlineCodePaddingHorizontal: 4,
  inlineCodePaddingVertical: 1,
  inlineCodeRadius: 5,
} as const;
