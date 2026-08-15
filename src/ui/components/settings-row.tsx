import React from 'react';
import { StyleProp, Text, TextStyle, View, ViewStyle } from 'react-native';
import { useTheme } from '../theme';

type Props = { icon?: React.ReactNode; title: string; description?: string; value?: string; control?: React.ReactNode; onPress?: () => void; style?: StyleProp<ViewStyle>; titleStyle?: StyleProp<TextStyle> };

export function SettingsRow({ icon, title, description, value, control, onPress, style, titleStyle }: Props) {
  const { tokens } = useTheme();
  const content = <View style={[{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, paddingVertical: tokens.spacing.sm }, style]}>
    {icon ? <View style={{ width: 40, height: 40, borderRadius: tokens.radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: tokens.colors.elevated }}>{icon}</View> : null}
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text numberOfLines={2} style={[{ color: tokens.colors.text, fontSize: 15, lineHeight: 20, fontWeight: '700' }, titleStyle]}>{title}</Text>
      {description ? <Text numberOfLines={3} style={{ color: tokens.colors.mutedText, fontSize: 13, lineHeight: 18, marginTop: 2 }}>{description}</Text> : null}
    </View>
    {value ? <Text numberOfLines={2} ellipsizeMode="tail" style={{ maxWidth: '35%', color: tokens.colors.mutedText, fontSize: 13, lineHeight: 18, textAlign: 'right' }}>{value}</Text> : null}
    {control}
  </View>;
  return onPress ? <View accessibilityRole="button">{content}</View> : content;
}
