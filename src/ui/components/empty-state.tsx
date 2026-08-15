import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from './button';
import { useTheme } from '../theme';

export function EmptyState({ icon = 'library-outline', title, description, actionLabel, onAction }: { icon?: keyof typeof Ionicons.glyphMap; title: string; description?: string; actionLabel?: string; onAction?: () => void }) {
  const { tokens } = useTheme();
  return <View style={{ width: '100%', alignItems: 'center', paddingHorizontal: tokens.spacing.xl, paddingVertical: tokens.spacing.xxl, gap: tokens.spacing.md }}><View style={{ width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: `${tokens.colors.primary}22` }}><Ionicons name={icon} size={36} color={tokens.colors.primary} /></View><Text style={{ color: tokens.colors.text, fontSize: 18, lineHeight: 24, fontWeight: '800', textAlign: 'center' }}>{title}</Text>{description ? <Text selectable style={{ color: tokens.colors.mutedText, fontSize: 14, lineHeight: 21, textAlign: 'center' }}>{description}</Text> : null}{actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} style={{ alignSelf: 'stretch', marginTop: tokens.spacing.sm }} /> : null}</View>;
}
