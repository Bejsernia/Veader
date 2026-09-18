import { Toggle } from '../../ui/components/toggle';
import React from 'react';
import { Text,View } from 'react-native';
import type { ReaderPreferences } from '../../preferences';
import { SegmentedControl } from '../../ui/components/segmented-control';
import { SettingsGroup } from '../../ui/components/settings-group';
import { SettingsRow } from '../../ui/components/settings-row';
import { useTheme } from '../../ui/theme';

export function ReaderSettingsFields({ value, onChange }: { value: ReaderPreferences; onChange: (patch: ReaderPreferences) => void }) {
  const { tokens } = useTheme();
  const direction = value.readingDirection ?? 'ltr';
  const toggles: { key: 'crop' | 'tapZones' | 'dark' | 'notch' | 'volume'; label: string; fallback: boolean }[] = [
    { key: 'crop', label: '自动裁切白边', fallback: false },
    { key: 'tapZones', label: '点击区域翻页', fallback: true },
    { key: 'dark', label: '黑色阅读背景', fallback: true },
    { key: 'notch', label: '刘海区域显示内容', fallback: false },
    { key: 'volume', label: '音量键翻页', fallback: true },
  ];
  return <View>
    <SegmentedControl label="阅读方向" value={direction} options={[{ value: 'ltr', label: '从左到右' }, { value: 'rtl', label: '从右到左' }, { value: 'vertical', label: '从上到下' }]} onChange={readingDirection => onChange({ readingDirection })} />
    {value.tapZones !== false && <Text style={[tokens.typography.caption, { color: tokens.colors.mutedText, marginBottom: 16 }]}>{direction === 'vertical' ? '点击上方返回上一页，下方前往下一页，中间打开菜单。' : direction === 'rtl' ? '点击左侧前往下一页，右侧返回上一页，中间打开菜单。' : '点击左侧返回上一页，右侧前往下一页，中间打开菜单。'}</Text>}
    <SegmentedControl label="翻页效果" value={value.smooth !== false ? 'smooth' : 'direct'} options={[{ value: 'direct', label: '直接翻页' }, { value: 'smooth', label: '平滑翻页' }]} onChange={v => onChange({ smooth: v === 'smooth' })} />
    <SegmentedControl label="页面布局" value={value.pageMode ?? 'single'} options={[{ value: 'single', label: '单页' }, { value: 'double', label: '双页' }]} onChange={pageMode => onChange({ pageMode })} />
    {value.pageMode === 'double' && <SegmentedControl label="双页顺序" value={value.doubleOrder ?? 'natural'} options={[{ value: 'natural', label: '奇数在前' }, { value: 'reverse', label: '偶数在前' }]} onChange={doubleOrder => onChange({ doubleOrder })} />}
    <SettingsGroup>{toggles.map(({ key, label, fallback }) => <SettingsRow key={key} title={label} control={<Toggle accessibilityLabel={label} value={value[key] ?? fallback} onValueChange={v => onChange({ [key]: v })} />} />)}</SettingsGroup>
  </View>;
}
