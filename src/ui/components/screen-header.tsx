import React from 'react';
import { StyleProp,Text,View,ViewStyle } from 'react-native';
import { useTheme } from '../theme';
import { IconButton } from './icon-button';

export function ScreenHeader({ title, subtitle, back, trailing, style }: {
  title: string; subtitle?: string; back?: () => void; trailing?: React.ReactNode; style?: StyleProp<ViewStyle>;
}) {
  const { tokens } = useTheme();
  return <View style={[{ marginBottom: tokens.spacing.lg }, style]}>
    <View style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm }}>
      {back && <IconButton name="chevron-back" label="返回" onPress={back} />}
      <Text accessibilityRole="header" numberOfLines={2} style={[back ? tokens.typography.sectionTitle : tokens.typography.pageTitle, { flex: 1, color: tokens.colors.text }]}>{title}</Text>
      {trailing}
    </View>
    {subtitle && <Text style={[tokens.typography.body, { color: tokens.colors.mutedText, marginTop: tokens.spacing.sm }]}>{subtitle}</Text>}
  </View>;
}
