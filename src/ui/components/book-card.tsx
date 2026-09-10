import React from 'react';
import { Text, View } from 'react-native';
import { BookCover } from './book-cover';
import { ProgressBar } from './progress-bar';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useTheme } from '../theme';
import { PressableScale } from './pressable-scale';

type Props = { title: string; author?: string; coverUri?: string | null; progress?: number; footer?: React.ReactNode; index?: number; onPress?: () => void };

export function BookCard({ title, author, coverUri, progress, footer, index = 0, onPress }: Props) {
  const { tokens, reducedMotion } = useTheme();
  return <Animated.View entering={reducedMotion ? undefined : FadeInUp.delay(Math.min(index, 5) * tokens.motion.stagger).duration(tokens.motion.normal)} style={{ flex: 1, minWidth: 0, marginBottom: tokens.spacing.xl }}>
    <PressableScale onPress={onPress} disabled={!onPress} style={{ minWidth: 0 }}>
      <BookCover uri={coverUri} style={{ width: '100%' }} />
      <Text numberOfLines={3} ellipsizeMode="tail" style={{ color: tokens.colors.text, fontSize: 15, lineHeight: 20, fontWeight: '700', marginTop: tokens.spacing.sm }}>{title}</Text>
      {author ? <Text numberOfLines={1} ellipsizeMode="tail" style={{ color: tokens.colors.mutedText, fontSize: 12, lineHeight: 18, marginTop: 2 }}>{author}</Text> : null}
      {progress !== undefined && <ProgressBar value={progress} color={tokens.colors.secondary} />}
      {footer ? <View style={{ marginTop: tokens.spacing.sm }}>{footer}</View> : null}
    </PressableScale>
  </Animated.View>;
}
