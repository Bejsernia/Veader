import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../ui/theme';
import { IconButton as BaseIconButton } from '../../ui/components/icon-button';
import { styles, layoutStyles } from '../../ui/legacy-styles';
import type { LibrarySeries } from '../../domain/models';

export function compactAuthor(author: string) {
  const names = author.split(/[、，,|]+/).map(name => name.trim()).filter(Boolean);
  if (!names.length) return '';
  const joined = names.join('、');
  return names.length > 1 && joined.length > 12 ? `${names[0]}等人` : joined;
}

export function IconButton({ name, onPress, dark = false, label, color }: { name: keyof typeof Ionicons.glyphMap; onPress?: () => void; dark?: boolean; label?: string; color?: string }) {
  return <BaseIconButton name={name} label={label ?? String(name)} onPress={onPress} dark={dark} color={color} />;
}

export function Progress({ value, color = '#7C5CFC' }: { value: number; color?: string }) {
  const { isDark } = useTheme();
  return <View style={[styles.progressTrack, { width: '100%', flex: 0 }, isDark && styles.progressTrackDark]}><View style={[styles.progressFill, { width: `${Math.max(0, Math.min(1, value)) * 100}%`, backgroundColor: color }]} /></View>;
}

export function CompactProgress({ value, color }: { value: number; color: string }) {
  const { isDark } = useTheme();
  return <View style={[layoutStyles.compactProgressTrack, isDark && layoutStyles.compactProgressTrackDark]}><View style={[layoutStyles.compactProgressFill, { width: `${Math.max(0, Math.min(1, value)) * 100}%`, backgroundColor: color }]} /></View>;
}

export function SeriesProgress({ series, inverse = false, compact = false }: { series: LibrarySeries; inverse?: boolean; compact?: boolean }) {
  if (compact) return <CompactSeriesProgress series={series} inverse={inverse} />;
  const chapterPosition = series.currentChapterNumber ? Math.min(1, Math.max(0, series.currentChapterNumber / Math.max(1, series.chapterCount))) : 0;
  const caption = inverse ? styles.progressCaptionInverse : undefined;
  return <View style={styles.seriesProgress}><Text numberOfLines={1} style={[styles.progressCaption, caption]}>章节 {series.currentChapterNumber || 0} / {series.chapterCount}</Text><Progress value={chapterPosition} color="#0F9F91" /><Text style={[styles.progressCaption, caption]}>本章 {Math.round(series.progress * 100)}%</Text><Progress value={series.progress} color="#A855F7" /></View>;
}

export function CompactSeriesProgress({ series, inverse }: { series: LibrarySeries; inverse?: boolean }) {
  const { isDark } = useTheme();
  const chapterPosition = series.currentChapterNumber ? Math.min(1, Math.max(0, series.currentChapterNumber / Math.max(1, series.chapterCount))) : 0;
  const caption = { color: inverse ? '#E7E0FF' : isDark ? '#D0C8DD' : '#77717D', fontSize: 10, lineHeight: 14, fontWeight: '700' as const };
  return <View style={layoutStyles.seriesProgressCompact}><Text numberOfLines={1} style={caption}>章节 {series.currentChapterNumber || 0} / {series.chapterCount}</Text><CompactProgress value={chapterPosition} color="#0F9F91" /><Text style={caption}>本章 {Math.round(series.progress * 100)}%</Text><CompactProgress value={series.progress} color="#A855F7" /></View>;
}
