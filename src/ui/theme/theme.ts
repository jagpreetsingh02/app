import { useColorScheme } from 'react-native';

/** Design tokens. Every screen pulls colours, spacing and type from here. */

export interface Palette {
  background: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  accent: string;
  onAccent: string;
  accentSoft: string;
  danger: string;
  dangerSoft: string;
  warning: string;
  warningSoft: string;
  success: string;
  successSoft: string;
  overlay: string;
}

const light: Palette = {
  background: '#F6F6F3',
  surface: '#FFFFFF',
  surfaceAlt: '#EEEEEA',
  border: '#E1E1DC',
  text: '#16171B',
  textMuted: '#686A73',
  accent: '#2F5BEA',
  onAccent: '#FFFFFF',
  accentSoft: '#E6ECFD',
  danger: '#C93636',
  dangerSoft: '#FCEAEA',
  warning: '#996010',
  warningSoft: '#FCF1DE',
  success: '#207B4B',
  successSoft: '#E3F4EA',
  overlay: 'rgba(10, 11, 14, 0.45)',
};

const dark: Palette = {
  background: '#0E0F11',
  surface: '#17181B',
  surfaceAlt: '#212227',
  border: '#2B2C32',
  text: '#F0F0F2',
  textMuted: '#9A9CA6',
  accent: '#7392FF',
  onAccent: '#0E0F11',
  accentSoft: '#1D2442',
  danger: '#FF7070',
  dangerSoft: '#3A1B1D',
  warning: '#F0B354',
  warningSoft: '#372A14',
  success: '#4CC38A',
  successSoft: '#15301F',
  overlay: 'rgba(0, 0, 0, 0.6)',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

export const type = {
  title: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  heading: { fontSize: 20, lineHeight: 26, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400' },
  bodyStrong: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
  label: { fontSize: 14, lineHeight: 18, fontWeight: '500' },
  caption: { fontSize: 13, lineHeight: 17, fontWeight: '400' },
} as const;

/** Minimum touch target (Android guideline is 48dp). */
export const TOUCH_TARGET = 48;

export interface Theme {
  dark: boolean;
  colors: Palette;
}

export function useTheme(): Theme {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  return { dark: isDark, colors: isDark ? dark : light };
}
