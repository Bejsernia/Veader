import React from 'react';
import { Text, View } from 'react-native';
import { useTheme } from '../theme';
import { PressableScale } from './pressable-scale';

type Props = { number: string | number; title: string; meta?: string; progress?: number; current?: boolean; onPress?: () => void };

export function ChapterRow({ number, title, meta, progress, current = false, onPress }: Props) {
  const { tokens } = useTheme();
  const accent = current ? tokens.colors.primary : tokens.colors.mutedText;
  return <PressableScale haptic="light" onPress={onPress} disabled={!onPress} style={{ minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, paddingVertical: tokens.spacing.sm, borderBottomWidth: 1, borderBottomColor: tokens.colors.divider }}>
    <View style={{ width: 40, height: 40, borderRadius: tokens.radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: current ? tokens.colors.primary : tokens.colors.elevated }}>
      <Text style={{ color: current ? tokens.colors.onPrimary : tokens.colors.text, fontSize: 12, fontWeight: '800' }}>{number}</Text>
    </View>
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text numberOfLines={2} ellipsizeMode="tail" style={{ color: current ? tokens.colors.primary : tokens.colors.text, fontSize: 15, lineHeight: 20, fontWeight: current ? '800' : '700' }}>{title}</Text>
      {meta ? <Text numberOfLines={1} style={{ color: accent, fontSize: 12, lineHeight: 18, marginTop: 2 }}>{meta}</Text> : null}
    </View>
    {progress !== undefined ? <View style={{ width: 54, gap: 4 }}><Text style={{ color: tokens.colors.mutedText, fontSize: 11, textAlign: 'right' }}>{Math.round(progress * 100)}%</Text><View style={{ height: 4, borderRadius: 2, overflow: 'hidden', backgroundColor: tokens.colors.divider }}><View style={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%`, height: '100%', backgroundColor: current ? tokens.colors.primary : tokens.colors.secondary }} /></View></View> : null}
  </PressableScale>;
}
