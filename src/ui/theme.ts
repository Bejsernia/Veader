import React,{ createContext,useContext,useEffect,useMemo,useState } from 'react';
import { AccessibilityInfo,TextStyle,useColorScheme } from 'react-native';
import { ThemeMode,loadThemeMode,saveThemeMode } from '../preferences';

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
    selectedContainer: string;
    onSelectedContainer: string;
    dangerContainer: string;
  };
  typography: Record<'pageTitle' | 'sectionTitle' | 'body' | 'label' | 'caption' | 'bookTitle', TextStyle>;
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
const radius = { sm: 6, md: 12, lg: 12, xl: 20, pill: 999 } as const;
const motion = { fast: 160, normal: 220, emphasis: 360, stagger: 48 } as const;

export const typography: ThemeTokens['typography'] = {
  pageTitle: { fontSize: 24, lineHeight: 32, fontWeight: '600' },
  sectionTitle: { fontSize: 18, lineHeight: 26, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  label: { fontSize: 15, lineHeight: 21, fontWeight: '600' },
  bookTitle: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  caption: { fontSize: 12, lineHeight: 18, fontWeight: '400' },
};
export const darkTokens: ThemeTokens = {
  colors: {
    background: '#111113',
    surface: '#1C1C20',
    elevated: '#252529',
    text: '#F1F1F3',
    mutedText: '#A6A6AF',
    primary: '#A78BFA',
    secondary: '#55D6C2',
    accent: '#FFB86B',
    divider: '#303036',
    danger: '#FF7185',
    onPrimary: '#181225',
    scrim: 'rgba(0,0,0,0.58)',
    selectedContainer: '#30264A', onSelectedContainer: '#D8C9FF', dangerContainer: '#3A2229',
  },
  spacing,
  radius,
  motion,
  typography,
};

export const lightTokens: ThemeTokens = {
  colors: {
    background: '#F7F7F8',
    surface: '#FFFFFF',
    elevated: '#EFEFF2',
    text: '#232326',
    mutedText: '#68686F',
    primary: '#7052E8',
    secondary: '#0F8F83',
    accent: '#C56B1C',
    divider: '#E4E4E8',
    danger: '#C63F58',
    onPrimary: '#FFFFFF',
    scrim: 'rgba(0,0,0,0.52)',
    selectedContainer: '#EBE4FF', onSelectedContainer: '#5935B5', dangerContainer: '#FBE7EC',
  },
  spacing,
  radius,
  motion,
  typography,
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

// Reading controls follow the canvas preference; sheets follow the app theme.
export const readerAppearance = {
  dark: { canvas: '#09090B', overlay: 'rgba(8,8,10,0.94)', text: '#FFFFFF', muted: '#A6A6AF', track: '#55515B', accent: '#A78BFA' },
  light: { canvas: '#FFFFFF', overlay: 'rgba(248,247,250,0.96)', text: '#232326', muted: '#68686F', track: '#D0CBD8', accent: '#7052E8' },
} as const;
