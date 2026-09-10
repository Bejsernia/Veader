import React from 'react';
import { Text,View } from 'react-native';
import { useTheme } from '../theme';
import { PressableScale } from './pressable-scale';
import { ProgressBar } from './progress-bar';

type Props = { number: string | number; title: string; meta?: string; progress?: number; current?: boolean; onPress?: () => void };

export function ChapterRow({ number, title, meta, progress, current = false, onPress }: Props) {
  const { tokens } = useTheme();
  const accent = current ? tokens.colors.primary : tokens.colors.mutedText;
  return <PressableScale accessibilityRole="button" accessibilityLabel={'打开第 ' + number + ' 章：' + title} accessibilityState={{ selected: current }} haptic="light" onPress={onPress} disabled={!onPress} style={{ minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, paddingVertical: tokens.spacing.sm, borderBottomWidth: 1, borderBottomColor: tokens.colors.divider }}>
    <View style={{ width: 40, height: 40, borderRadius: tokens.radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: current ? tokens.colors.primary : tokens.colors.elevated }}>
      <Text style={{ color: current ? tokens.colors.onPrimary : tokens.colors.text, fontSize: 12, fontWeight: '800' }}>{number}</Text>
    </View>
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text numberOfLines={2} ellipsizeMode="tail" style={{ color: current ? tokens.colors.primary : tokens.colors.text, ...tokens.typography.label, fontWeight: current ? '700' : '600' }}>{title}</Text>
      {meta ? <Text numberOfLines={1} style={{ color: accent, fontSize: 12, lineHeight: 18, marginTop: 2 }}>{meta}</Text> : null}
    </View>
    {progress !== undefined ? <View style={{ width: 54, gap: 4 }}><Text style={{ color: tokens.colors.mutedText, fontSize: 11, textAlign: 'right' }}>{Math.round(progress * 100)}%</Text><ProgressBar value={progress} color={current ? tokens.colors.primary : tokens.colors.secondary} height={4} /></View> : null}
  </PressableScale>;
}
