import React from 'react';
import { Text,View } from 'react-native';
import { useTheme } from '../theme';

export function SectionHeader({ title, trailing, compact = false }: { title: string; trailing?: React.ReactNode; compact?: boolean }) {
  const { tokens } = useTheme();
  return <View style={{ minHeight: compact ? 20 : 26, flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, marginTop: compact ? tokens.spacing.lg : tokens.spacing.xl, marginBottom: compact ? tokens.spacing.sm : tokens.spacing.md }}><Text accessibilityRole="header" numberOfLines={2} style={{ flex: 1, minWidth: 0, color: compact ? tokens.colors.mutedText : tokens.colors.text, ...(compact ? tokens.typography.label : tokens.typography.sectionTitle) }}>{title}</Text>{trailing ? <View style={{ flexShrink: 0 }}>{trailing}</View> : null}</View>;
}
