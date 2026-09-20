import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import type { LibrarySeries } from '../../domain/models';
import { BookCover } from '../../ui/components/book-cover';
import { PressableScale } from '../../ui/components/pressable-scale';
import { useTheme } from '../../ui/theme';
import { readingPosition } from './library-ui';

export function ContinueReading({ series, onPress }: { series: LibrarySeries; onPress: () => void }) {
  const { tokens } = useTheme();
  return <PressableScale accessibilityRole="button" accessibilityLabel={'继续阅读 ' + series.title} onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', padding: 12, gap: 12, borderRadius: tokens.radius.md, backgroundColor: tokens.colors.surface }}>
    <BookCover uri={series.coverUri} title={series.title} style={{ width: 56 }} />
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={[tokens.typography.caption, { color: tokens.colors.primary, marginBottom: 4 }]}>继续阅读</Text>
      <Text numberOfLines={2} style={[tokens.typography.bookTitle, { color: tokens.colors.text }]}>{series.title}</Text>
      <Text style={[tokens.typography.caption, { color: tokens.colors.mutedText, marginTop: 4 }]}>{readingPosition(series)}</Text>
    </View>
    <Ionicons name="chevron-forward" size={20} color={tokens.colors.mutedText} />
  </PressableScale>;
}
