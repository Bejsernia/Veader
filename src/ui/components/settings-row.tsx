import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable,StyleProp,Text,TextStyle,View,ViewStyle } from 'react-native';
import { useTheme } from '../theme';

type Props = { icon?: React.ReactNode; title: string; description?: string; value?: string; control?: React.ReactNode; onPress?: () => void; style?: StyleProp<ViewStyle>; titleStyle?: StyleProp<TextStyle> };

export function SettingsRow({ icon, title, description, value, control, onPress, style, titleStyle }: Props) {
  const { tokens } = useTheme();
  const content = <View style={[{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, paddingVertical: tokens.spacing.sm }, style]}>
    {icon ? <View style={{ width: 28, height: 28, borderRadius: tokens.radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' }}>{icon}</View> : null}
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text numberOfLines={2} style={[{ color: tokens.colors.text, fontSize: 15, lineHeight: 20, fontWeight: '400' }, titleStyle]}>{title}</Text>
      {description ? <Text numberOfLines={3} style={{ color: tokens.colors.mutedText, fontSize: 13, lineHeight: 18, marginTop: 2 }}>{description}</Text> : null}
    </View>
    {value ? <Text numberOfLines={2} ellipsizeMode="tail" style={{ maxWidth: '35%', color: tokens.colors.mutedText, fontSize: 13, lineHeight: 18, textAlign: 'right' }}>{value}</Text> : null}
    {control ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={tokens.colors.mutedText} /> : null)}
  </View>;
  return onPress ? <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityValue={value ? { text: value } : undefined} onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>{content}</Pressable> : content;
}
