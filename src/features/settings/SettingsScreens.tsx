import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Platform, Pressable, ScrollView, Text, TextInput, ToastAndroid, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { AppScreen as Screen } from '../../app/navigation';
import { ThemeMode } from '../../preferences';
import { formatCacheSize } from '../../cache';
import { cacheManager } from '../../data/cache-manager';
import { useTheme } from '../../ui/theme';
import { styles, layoutStyles, pageLayoutStyles, uiStyles } from '../../ui/legacy-styles';
import { IconButton } from '../shared/library-ui';
import { getGridLayout } from '../../ui/layout';
import type { StoredSource } from '../../domain/models';

function Me({ navigate }: { navigate: (screen: Screen) => void }) {
  const groups: [keyof typeof Ionicons.glyphMap, string][][] = [[['folder-open-outline', '漫画源'], ['cube-outline', '缓存']], [['information-circle-outline', '关于 Veader']]];
  const destinations: Record<string, Screen> = { '漫画源': 'sources', '缓存': 'cache', '关于 Veader': 'about' };
  const { mode, isDark, setMode } = useTheme(); const { width: viewportWidth } = useWindowDimensions(); const pageInset = getGridLayout(viewportWidth).pageInset;
  const modeLabel = mode === 'system' ? '自动' : mode === 'dark' ? '黑夜' : '白天';
  const cycleTheme = () => {
    const nextMode: ThemeMode = mode === 'system' ? 'light' : mode === 'light' ? 'dark' : 'system';
    const label = nextMode === 'system' ? '自动' : nextMode === 'dark' ? '黑夜' : '白天';
    setMode(nextMode);
    if (Platform.OS === 'android') ToastAndroid.show(`已切换到${label}模式`, ToastAndroid.SHORT);
    else Alert.alert('界面主题', `已切换到${label}模式`);
  };
  return <View style={[styles.flex, isDark && styles.pageDark]}><ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[styles.page, isDark && styles.pageDark, { paddingHorizontal: pageInset }]}><View style={[styles.header, pageLayoutStyles.pageHeader]}><Text style={[styles.title, pageLayoutStyles.pageTitle, isDark && styles.textPrimaryDark]}>我的</Text><Pressable accessibilityRole="button" accessibilityLabel={`切换界面主题，当前${modeLabel}`} style={[styles.themeButton, pageLayoutStyles.trailingAction, isDark && styles.themeButtonDark]} onPress={cycleTheme}><Ionicons name={mode === 'dark' ? 'moon' : mode === 'system' ? 'contrast' : 'sunny'} size={20} color={isDark ? '#5B21B6' : '#7257E7'} /></Pressable></View>{groups.map((group, groupIndex) => <View style={[styles.settingsGroup, pageLayoutStyles.alignedSettingsGroup, isDark && styles.cardDark]} key={groupIndex}>{group.map(([icon, label], index) => <Pressable accessibilityRole="button" key={label} onPress={() => navigate(destinations[label]!)} style={({ pressed }) => [styles.settingRow, pageLayoutStyles.alignedSettingRow, index < group.length - 1 && styles.divider, isDark && styles.dividerDark, pressed && styles.pressed]}><View style={styles.settingIcon}><Ionicons name={icon} size={20} color="#7257E7" /></View><Text style={[styles.settingLabel, isDark && styles.textPrimaryDark]}>{label}</Text><Ionicons name="chevron-forward" size={18} color={isDark ? '#B8B1C2' : '#AAA5B0'} /></Pressable>)}</View>)}</ScrollView></View>;
}

function CacheSettings({ back }: { back: () => void }) {
  const { isDark } = useTheme();
  const [size, setSize] = useState(0); const [sourceSize, setSourceSize] = useState(0); const [limit, setLimit] = useState('512'); const [limitReady, setLimitReady] = useState(false); const [loading, setLoading] = useState(false);
  const mounted = useRef(true); const refreshInFlight = useRef<Promise<void>>();
  const refresh = (force = false): Promise<void> => { if (refreshInFlight.current) return force ? refreshInFlight.current.then(() => refresh(false)) : refreshInFlight.current; const task = cacheManager.getBreakdown().then(({ page, source }) => { if (mounted.current) { setSize(page); setSourceSize(source); } }).catch(console.warn).finally(() => { refreshInFlight.current = undefined; }); refreshInFlight.current = task; return task; };
  useEffect(() => { void refresh(); const subscription = AppState.addEventListener('change', state => { if (state === 'active') void refresh(true); }); cacheManager.getPageLimitMb().then(value => { if (mounted.current) { setLimit(String(value)); setLimitReady(true); } }).catch(console.warn); return () => { mounted.current = false; subscription.remove(); }; }, []);
  useEffect(() => { if (!limitReady) return; const value = Number.parseInt(limit, 10); if (!Number.isFinite(value)) return; const timer = setTimeout(() => { setLoading(true); cacheManager.setPageLimitMb(value).then(saved => setLimit(String(saved))).then(() => refresh(true)).catch(console.warn).finally(() => setLoading(false)); }, 500); return () => clearTimeout(timer); }, [limit, limitReady]);
  const clear = async () => { setLoading(true); try { if (refreshInFlight.current) await refreshInFlight.current; await cacheManager.clear('page'); await refresh(true); } finally { setLoading(false); } };
  const clearSources = async () => { setLoading(true); try { if (refreshInFlight.current) await refreshInFlight.current; await cacheManager.clear('source'); await refresh(true); } finally { setLoading(false); } };
  return <SafeAreaView style={[styles.safe, isDark && styles.safeDark]}><ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[styles.page, isDark && styles.pageDark]}><View style={[styles.header, layoutStyles.subpageHeader]}><IconButton name="chevron-back" onPress={back} /><Text style={[styles.navTitle, isDark && styles.textPrimaryDark]}>缓存</Text><View style={{ width: 42 }} /></View><View style={[styles.cacheCard, isDark && styles.cardDark]}><Ionicons name="cube-outline" size={34} color="#7257E7" /><Text style={[styles.cacheValue, isDark && styles.textPrimaryDark]}>{formatCacheSize(size + sourceSize)}</Text><Text style={[styles.meta, isDark && styles.textMutedDark]}>页面缓存 {formatCacheSize(size)} · 远程源文件 {formatCacheSize(sourceSize)}</Text></View><View style={[styles.settingsGroup, isDark && styles.cardDark]}><View style={[styles.cacheRow, layoutStyles.cacheRowCentered]}><Text style={[styles.settingLabel, layoutStyles.cacheLabel, isDark && styles.textPrimaryDark]}>页面缓存上限</Text><View style={styles.cacheLimitInput}><TextInput value={limit} onChangeText={setLimit} keyboardType="number-pad" selectionColor={isDark ? '#B9A5FF' : '#7257E7'} placeholderTextColor={isDark ? '#B8B1C2' : '#99939E'} style={[styles.cacheInput, layoutStyles.cacheInputCentered, isDark && uiStyles.cacheInputDark]} /><Text style={[styles.meta, isDark && styles.textMutedDark]}>MB</Text></View></View></View><Pressable style={[styles.dangerButton, isDark && uiStyles.dangerButtonDark, loading && { opacity: .55 }]} disabled={loading} onPress={clear}><Ionicons name="trash-outline" size={19} color={isDark ? '#F5A9B7' : '#C84459'} /><Text style={[styles.dangerText, isDark && uiStyles.dangerTextDark]}>清理页面缓存</Text></Pressable><Pressable style={[styles.dangerButton, isDark && uiStyles.dangerButtonDark, loading && { opacity: .55, marginTop: 10 }]} disabled={loading} onPress={clearSources}><Ionicons name="cloud-download-outline" size={19} color={isDark ? '#F5A9B7' : '#C84459'} /><Text style={[styles.dangerText, isDark && uiStyles.dangerTextDark]}>清理远程源文件</Text></Pressable></ScrollView></SafeAreaView>;
}

function SettingsPage({ screen, back }: { screen: Screen; back: () => void }) {
  const titles: Partial<Record<Screen, string>> = { about: '关于 Veader' };
  const { isDark } = useTheme();
  return <SafeAreaView style={[styles.safe, isDark && styles.safeDark]}><ScrollView contentContainerStyle={[styles.page, isDark && styles.pageDark]}><View style={[styles.header, layoutStyles.subpageHeader]}><IconButton name="chevron-back" onPress={back} /><Text style={[styles.navTitle, isDark && styles.textPrimaryDark]}>{titles[screen]}</Text><View style={{ width: 42 }} /></View>
    <View style={[styles.aboutCard, isDark && styles.cardDark]}><View style={styles.aboutLogo}><Ionicons name="book" size={38} color="#fff" /></View><Text style={[styles.detailTitle, isDark && styles.textPrimaryDark]}>Veader</Text><Text style={[styles.meta, isDark && styles.textMutedDark]}>版本 0.1.0 · Android 测试版</Text><Text style={[styles.modalHelp, isDark && styles.textMutedDark]}>本地优先的漫画与电子书阅读器。支持 EPUB、MOBI、PDF 导入及本机阅读记录。</Text></View>
  </ScrollView></SafeAreaView>;
}

export { Me, CacheSettings, SettingsPage };
