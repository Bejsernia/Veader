import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, useColorScheme } from 'react-native';
import { loadThemeMode, saveThemeMode, ThemeMode } from '../preferences';

export type ThemeTokens = {
  colors: {
    background: string;
    surface: string;
    elevated: string;
    text: string;
    mutedText: string;
    primary: string;
    secondary: string;
    accent: string;
    divider: string;
    danger: string;
    onPrimary: string;
    scrim: string;
  };
  spacing: Record<'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl', number>;
  radius: Record<'sm' | 'md' | 'lg' | 'xl' | 'pill', number>;
  motion: {
    fast: number;
    normal: number;
    emphasis: number;
    stagger: number;
  };
};

const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
const radius = { sm: 10, md: 14, lg: 18, xl: 26, pill: 999 } as const;
const motion = { fast: 160, normal: 220, emphasis: 360, stagger: 48 } as const;

export const darkTokens: ThemeTokens = {
  colors: {
    background: '#0F0E14',
    surface: '#17151F',
    elevated: '#211C2E',
    text: '#F8F5FF',
    mutedText: '#B7AEC5',
    primary: '#A78BFA',
    secondary: '#55D6C2',
    accent: '#FFB86B',
    divider: '#332B42',
    danger: '#FF7185',
    onPrimary: '#181225',
    scrim: 'rgba(0,0,0,0.58)',
  },
  spacing,
  radius,
  motion,
};

export const lightTokens: ThemeTokens = {
  colors: {
    background: '#F5F3F8',
    surface: '#FFFFFF',
    elevated: '#F0EBFF',
    text: '#211D29',
    mutedText: '#716A7C',
    primary: '#7052E8',
    secondary: '#0F8F83',
    accent: '#C56B1C',
    divider: '#E3DFEA',
    danger: '#C63F58',
    onPrimary: '#FFFFFF',
    scrim: 'rgba(0,0,0,0.52)',
  },
  spacing,
  radius,
  motion,
};

export type ThemeContextValue = {
  mode: ThemeMode;
  isDark: boolean;
  tokens: ThemeTokens;
  reducedMotion: boolean;
  setMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('dark');
  const [ready, setReady] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const isDark = mode === 'dark' || (mode === 'system' && systemScheme === 'dark');

  useEffect(() => {
    loadThemeMode().then(value => { setModeState(value); setReady(true); }).catch(() => setReady(true));
  }, []);

  useEffect(() => {
    if (ready) void saveThemeMode(mode).catch(console.warn);
  }, [mode, ready]);

  useEffect(() => {
    let mounted = true;
    const update = (value: boolean) => { if (mounted) setReducedMotion(value); };
    const initial = AccessibilityInfo.isReduceMotionEnabled?.();
    initial?.then(update).catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener?.('reduceMotionChanged', update);
    return () => { mounted = false; subscription?.remove?.(); };
  }, []);

  const value = useMemo<ThemeContextValue>(() => ({
    mode,
    isDark,
    tokens: isDark ? darkTokens : lightTokens,
    reducedMotion,
    setMode: setModeState,
  }), [isDark, mode, reducedMotion]);

  return React.createElement(ThemeContext.Provider, { value }, children);
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside ThemeProvider');
  return value;
}
