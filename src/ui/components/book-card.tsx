import React from 'react';
import { Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useTheme } from '../theme';
import { PressableScale } from './pressable-scale';

type Props = { title: string; author?: string; coverUri?: string | null; progress?: number; footer?: React.ReactNode; index?: number; onPress?: () => void };

export function BookCard({ title, author, coverUri, progress, footer, index = 0, onPress }: Props) {
  const { tokens, reducedMotion } = useTheme();
  return <Animated.View entering={reducedMotion ? undefined : FadeInUp.delay(index * tokens.motion.stagger).duration(tokens.motion.normal)} style={{ flex: 1, minWidth: 0, marginBottom: tokens.spacing.xl }}>
    <PressableScale onPress={onPress} disabled={!onPress} style={{ minWidth: 0 }}>
      {coverUri ? <Image source={coverUri} contentFit="cover" cachePolicy="memory-disk" style={{ width: '100%', aspectRatio: 1 / 1.38, borderRadius: tokens.radius.lg, backgroundColor: tokens.colors.elevated }} /> : <View style={{ width: '100%', aspectRatio: 1 / 1.38, borderRadius: tokens.radius.lg, alignItems: 'center', justifyContent: 'center', gap: tokens.spacing.sm, backgroundColor: tokens.colors.elevated }}><Ionicons name="book-outline" size={34} color={tokens.colors.primary} /><Text style={{ color: tokens.colors.mutedText, fontSize: 12, fontWeight: '800' }}>漫画</Text></View>}
      <Text numberOfLines={3} ellipsizeMode="tail" style={{ color: tokens.colors.text, fontSize: 15, lineHeight: 20, fontWeight: '700', marginTop: tokens.spacing.sm }}>{title}</Text>
      {author ? <Text numberOfLines={1} ellipsizeMode="tail" style={{ color: tokens.colors.mutedText, fontSize: 12, lineHeight: 18, marginTop: 2 }}>{author}</Text> : null}
      {progress !== undefined ? <View style={{ height: 4, borderRadius: 2, overflow: 'hidden', backgroundColor: tokens.colors.divider, marginTop: tokens.spacing.sm }}><View style={{ height: '100%', width: `${Math.max(0, Math.min(1, progress)) * 100}%`, backgroundColor: tokens.colors.secondary }} /></View> : null}
      {footer ? <View style={{ marginTop: tokens.spacing.sm }}>{footer}</View> : null}
    </PressableScale>
  </Animated.View>;
}
