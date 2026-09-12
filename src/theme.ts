/**
 * Camen design system — tokens only, no logic.
 * Dark, masculine, minimal: one accent, monospaced numerals, generous spacing.
 */
import type { TextStyle } from 'react-native';

export const colors = {
  ink: '#0B0C0E', // background / camera letterbox
  panel: '#16181B', // chips, rails
  panelSoft: 'rgba(22, 24, 27, 0.82)',
  bone: '#E8E6E1', // primary text, shutter ring
  muted: '#8A8F98', // secondary text, inactive strokes
  brass: '#C9A96A', // the single accent
  danger: '#C25A4E', // save failures only
  hairline: 'rgba(232, 230, 225, 0.30)',
} as const;

export const spacing = {
  xs: 4,
  s: 8,
  m: 12,
  l: 16,
  xl: 24,
} as const;

export const radius = {
  chip: 20,
  ring: 28,
} as const;

/** Monospaced numerals for countdowns and zoom readouts. */
export const monoFont: TextStyle = {
  fontVariant: ['tabular-nums'],
};

export const label = {
  fontSize: 10,
  letterSpacing: 1.2,
  textTransform: 'uppercase' as const,
  color: colors.muted,
};
