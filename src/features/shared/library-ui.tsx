import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text,View } from 'react-native';
import type { LibrarySeries } from '../../domain/models';
import { BookCard } from '../../ui/components/book-card';
import { IconButton as BaseIconButton } from '../../ui/components/icon-button';
import { ProgressBar } from '../../ui/components/progress-bar';
import { useTheme } from '../../ui/theme';

export function compactAuthor(author: string) {
  const names = author.split(/[、，,|]+/).map(name => name.trim()).filter(Boolean);
  if (!names.length) return '';
  const joined = names.join('、');
  return names.length > 1 && joined.length > 12 ? names[0] + '等人' : joined;
}
export function formatReadingDuration(value: number) {
  const minutes = Math.round(value / 60000);
  return minutes >= 60 ? Math.floor(minutes / 60) + '小时 ' + minutes % 60 + '分' : minutes + '分钟';
}
export function IconButton({ name, onPress, dark = false, label, color }: { name: keyof typeof Ionicons.glyphMap; onPress?: () => void; dark?: boolean; label?: string; color?: string }) {
  return <BaseIconButton name={name} label={label ?? (name === 'chevron-back' ? '返回' : name === 'close' ? '关闭' : '更多操作')} onPress={onPress} dark={dark} color={color} />;
}
export const Progress = ProgressBar;
export const CompactProgress = ProgressBar;

export function SeriesProgress({ series, inverse = false, compact = false }: { series: LibrarySeries; inverse?: boolean; compact?: boolean }) {
  const { tokens } = useTheme();
  const chapterPosition = series.currentChapterNumber ? Math.min(1, Math.max(0, series.currentChapterNumber / Math.max(1, series.chapterCount))) : 0;
  const color = inverse ? tokens.colors.onSelectedContainer : tokens.colors.mutedText;
  return <View style={{ gap: 4, marginTop: compact ? 4 : 12 }}>
    <Text style={[tokens.typography.caption, { color }]}>章节 {series.currentChapterNumber || 0} / {series.chapterCount}</Text>
    <ProgressBar value={chapterPosition} color={tokens.colors.secondary} />
    <Text style={[tokens.typography.caption, { color }]}>本章 {Math.round(series.progress * 100)}%</Text>
    <ProgressBar value={series.progress} />
  </View>;
}
export const CompactSeriesProgress = SeriesProgress;

/** Shared book entry; callers own grid sizing and navigation. */
export function SeriesCard({ series, index, onPress }: { series: LibrarySeries; index: number; onPress: () => void }) {
  return <BookCard title={series.title} author={series.author ? compactAuthor(series.author) : undefined} coverUri={series.coverUri} index={index} onPress={onPress} footer={<SeriesProgress series={series} compact />} />;
}
