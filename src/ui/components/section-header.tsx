import React from 'react';
import { Text,View } from 'react-native';
import { useTheme } from '../theme';

export function SectionHeader({ title, trailing }: { title: string; trailing?: React.ReactNode }) {
  const { tokens } = useTheme();
  return <View style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, marginTop: tokens.spacing.xl, marginBottom: tokens.spacing.md }}><Text accessibilityRole="header" numberOfLines={2} style={{ flex: 1, minWidth: 0, color: tokens.colors.text, ...tokens.typography.sectionTitle }}>{title}</Text>{trailing ? <View style={{ flexShrink: 0 }}>{trailing}</View> : null}</View>;
}
