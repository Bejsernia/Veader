import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Platform, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import type { AppScreen } from '../../app/navigation';
import type { ReaderPreferences } from '../../preferences';
import { readerSettingsRepository } from '../../data/reader-settings-repository';
import { formatCacheSize } from '../../cache';
import { cacheManager, CacheBreakdown, CacheKind } from '../../data/cache-manager';
import { useTheme } from '../../ui/theme';
import { Screen } from '../../ui/components/screen';
import { ScreenHeader } from '../../ui/components/screen-header';
import { SettingsGroup } from '../../ui/components/settings-group';
import { SettingsRow } from '../../ui/components/settings-row';
import { SegmentedControl } from '../../ui/components/segmented-control';
import { TextField } from '../../ui/components/text-field';
import { Button } from '../../ui/components/button';
import { Card } from '../../ui/components/card';
import { ReaderSettingsFields } from '../reader/ReaderSettingsFields';

export function Me({ navigate }: { navigate: (screen: AppScreen) => void }) {
  const { mode, setMode, tokens } = useTheme();
  const links: { icon: keyof typeof Ionicons.glyphMap; title: string; screen: AppScreen }[] = [
    { icon: 'folder-open-outline', title: '漫画源', screen: 'sources' },
    { icon: 'cube-outline', title: '缓存', screen: 'cache' },
    { icon: 'options-outline', title: '阅读设置', screen: 'readerSettings' },
    { icon: 'information-circle-outline', title: '关于 Veader', screen: 'about' },
  ];
  return <Screen safeArea={false} scroll><ScreenHeader title="我的" />
    <SettingsGroup>{links.map(link => <SettingsRow key={link.screen} title={link.title} icon={<Ionicons name={link.icon} size={22} color={tokens.colors.primary} />} onPress={() => navigate(link.screen)} />)}</SettingsGroup>
    <SegmentedControl label="界面主题" value={mode} onChange={setMode} options={[{ value: 'system', label: '跟随系统' }, { value: 'light', label: '浅色' }, { value: 'dark', label: '深色' }]} />
  </Screen>;
}

export function ReaderSettingsPage({ back }: { back: () => void }) {
  const { tokens } = useTheme();
  const [settings, setSettings] = useState<ReaderPreferences>();
  const [error, setError] = useState('');
  const writes = useRef(Promise.resolve());
  useEffect(() => { let active = true; readerSettingsRepository.loadGlobal().then(value => { if (active) setSettings(value); }).catch(reason => { if (active) setError(String(reason)); }); return () => { active = false; }; }, []);
  const update = (patch: ReaderPreferences) => {
    setSettings(current => ({ ...current, ...patch }));
    writes.current = writes.current.then(() => readerSettingsRepository.saveGlobal(patch)).then(() => setError('')).catch(reason => setError(String(reason)));
  };
  return <Screen scroll><ScreenHeader title="全局阅读设置" back={back} subtitle="这些设置作为每本书的默认值，书内的单独设置优先。" />
    {error ? <Text accessibilityLiveRegion="polite" style={{ color: tokens.colors.danger }}>{error}</Text> : null}
    {settings ? <ReaderSettingsFields value={settings} onChange={update} /> : <ActivityIndicator color={tokens.colors.primary} />}
  </Screen>;
}

export function CacheSettings({ back }: { back: () => void }) {
  const { tokens } = useTheme();
  const [usage, setUsage] = useState<CacheBreakdown>();
  const [pageLimit, setPageLimit] = useState('');
  const [sourceLimit, setSourceLimit] = useState('');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const mounted = useRef(true);
  const refresh = async () => { const next = await cacheManager.getBreakdown(); if (mounted.current) setUsage(next); };
  useEffect(() => {
    mounted.current = true;
    Promise.all([refresh(), cacheManager.getPageLimitMb(), cacheManager.getSourceLimitMb()]).then(([, page, source]) => {
      if (mounted.current) { setPageLimit(String(page)); setSourceLimit(String(source)); setReady(true); }
    }).catch(reason => { if (mounted.current) setError(String(reason)); });
    const sub = AppState.addEventListener('change', state => { if (state === 'active') void refresh().catch(reason => setError(String(reason))); });
    return () => { mounted.current = false; sub.remove(); };
  }, []);
  const valid = (s: string, min: number, max: number) => /^\d+$/.test(s) && Number(s) >= min && Number(s) <= max;
  const pageError = ready && !valid(pageLimit, 16, 4096) ? '请输入 16–4096 MB 的整数' : undefined;
  const sourceError = ready && !valid(sourceLimit, 128, 8192) ? '请输入 128–8192 MB 的整数' : undefined;
  const run = async (work: () => Promise<unknown>, success: string) => {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try { await work(); await refresh(); setMessage(success); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); await refresh().catch(() => undefined); }
    finally { setBusy(false); }
  };
  const save = () => run(async () => {
    await cacheManager.setPageLimitMb(Number(pageLimit));
    await cacheManager.setSourceLimitMb(Number(sourceLimit));
  }, '缓存上限已保存');
  const clear = (kind: CacheKind) => run(() => cacheManager.clear(kind), '清理完成；正在使用的文件会保留。');
  return <Screen scroll><ScreenHeader title="缓存" back={back} />
    <SettingsGroup>
      <SettingsRow title="总占用" value={usage ? formatCacheSize(usage.total) : '计算中…'} />
      <SettingsRow title="页面缓存" value={usage ? formatCacheSize(usage.page) : '—'} />
      <SettingsRow title="远程源文件" value={usage ? formatCacheSize(usage.source) : '—'} />
      <SettingsRow title="临时封面与其他" value={usage ? formatCacheSize(usage.cover + usage.other + usage.session) : '—'} />
    </SettingsGroup>
    <TextField label="页面缓存上限（MB）" value={pageLimit} onChangeText={setPageLimit} keyboardType="number-pad" editable={ready && !busy} error={pageError} />
    <TextField label="远程源文件上限（MB）" value={sourceLimit} onChangeText={setSourceLimit} keyboardType="number-pad" editable={ready && !busy} error={sourceError} />
    <Text style={[tokens.typography.caption, { color: tokens.colors.mutedText, marginBottom: 16 }]}>保存后按上限清理缓存。正在阅读的文件暂时保留，关闭后再回收。</Text>
    <View style={{ gap: 12 }}>
      <Button label="保存缓存上限" onPress={save} disabled={!ready || !!pageError || !!sourceError || busy} />
      <Button label="清理页面缓存" icon="trash-outline" variant="danger" onPress={() => clear('page')} disabled={busy} />
      <Button label="清理远程源文件" icon="cloud-download-outline" variant="danger" onPress={() => clear('source')} disabled={busy} />
    </View>
    {busy && <ActivityIndicator color={tokens.colors.primary} style={{ marginTop: 16 }} />}
    {!!(error || message) && <Text accessibilityLiveRegion="polite" style={[tokens.typography.body, { color: error ? tokens.colors.danger : tokens.colors.mutedText, marginTop: 16 }]}>{error || message}</Text>}
  </Screen>;
}

export function SettingsPage({ back }: { screen: AppScreen; back: () => void }) {
  const { tokens } = useTheme();
  return <Screen scroll><ScreenHeader title="关于 Veader" back={back} /><Card>
    <Ionicons name="book-outline" size={40} color={tokens.colors.primary} />
    <Text style={[tokens.typography.pageTitle, { color: tokens.colors.text, marginTop: 16 }]}>Veader</Text>
    <Text style={[tokens.typography.caption, { color: tokens.colors.mutedText, marginVertical: 12 }]}>版本 {Constants.expoConfig?.version ?? '—'} · {Platform.OS === 'ios' ? 'iOS' : 'Android'}</Text>
    <Text style={[tokens.typography.body, { color: tokens.colors.text }]}>本地优先的漫画与电子书阅读器。支持 EPUB、MOBI、PDF 导入及本机阅读记录。</Text>
  </Card></Screen>;
}
