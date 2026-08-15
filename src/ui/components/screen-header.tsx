import React from 'react';
import { StyleProp, Text, TextStyle, View, ViewStyle } from 'react-native';
import { useTheme } from '../theme';

type Props = { title: string; subtitle?: string; leading?: React.ReactNode; trailing?: React.ReactNode; style?: StyleProp<ViewStyle>; titleStyle?: StyleProp<TextStyle> };

export function ScreenHeader({ title, subtitle, leading, trailing, style, titleStyle }: Props) {
  const { tokens } = useTheme();
  return <View style={[{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm, paddingHorizontal: tokens.spacing.lg }, style]}>
    {leading}
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text numberOfLines={2} style={[{ color: tokens.colors.text, fontSize: 22, lineHeight: 28, fontWeight: '800' }, titleStyle]}>{title}</Text>
      {subtitle ? <Text numberOfLines={2} style={{ color: tokens.colors.mutedText, fontSize: 13, lineHeight: 19, marginTop: 2 }}>{subtitle}</Text> : null}
    </View>
    {trailing}
  </View>;
}
