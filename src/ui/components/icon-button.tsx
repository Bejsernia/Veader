import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleProp,ViewStyle } from 'react-native';
import { useTheme } from '../theme';
import { HapticKind,PressableScale } from './pressable-scale';

export function IconButton({ name, label, onPress, style, color, dark = false, haptic = 'light', disabled }: {
  name: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  color?: string;
  dark?: boolean;
  haptic?: HapticKind;
  disabled?: boolean;
}) {
  const { isDark, tokens } = useTheme();
  return <PressableScale
    accessibilityRole="button"
    accessibilityLabel={label}
    hitSlop={6}
    disabled={disabled}
    accessibilityState={{ disabled: Boolean(disabled) }}
    haptic={haptic}
    android_ripple={{ color: `${tokens.colors.primary}30`, borderless: true }}
    style={[{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 22 }, style]}
    onPress={onPress}
  >
    <Ionicons name={name} size={22} color={color ?? (dark || isDark ? tokens.colors.text : tokens.colors.text)} />
  </PressableScale>;
}
