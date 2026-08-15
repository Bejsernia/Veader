import React from 'react';
import { ActivityIndicator, StyleProp, Text, TextStyle, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PressableScale, HapticKind } from './pressable-scale';
import { useTheme } from '../theme';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({ label, onPress, variant = 'primary', icon, loading = false, disabled = false, style, labelStyle, haptic }: {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  haptic?: HapticKind;
}) {
  const { tokens } = useTheme();
  const isDisabled = disabled || loading;
  const backgroundColor = variant === 'primary' ? tokens.colors.primary : variant === 'danger' ? `${tokens.colors.danger}20` : variant === 'secondary' ? tokens.colors.elevated : 'transparent';
  const foreground = variant === 'primary' ? tokens.colors.onPrimary : variant === 'danger' ? tokens.colors.danger : tokens.colors.primary;
  return <PressableScale
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityState={{ disabled: isDisabled, busy: loading }}
    disabled={isDisabled}
    haptic={haptic ?? (variant === 'danger' ? 'medium' : variant === 'primary' ? 'medium' : 'light')}
    onPress={onPress}
    android_ripple={{ color: `${foreground}35` }}
    style={[{
      minHeight: 48,
      minWidth: 48,
      paddingHorizontal: tokens.spacing.lg,
      paddingVertical: tokens.spacing.md,
      borderRadius: tokens.radius.md,
      backgroundColor,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: tokens.spacing.sm,
    }, style]}
  >
    {loading ? <ActivityIndicator color={foreground} /> : icon ? <Ionicons name={icon} size={19} color={foreground} /> : null}
    <View style={{ minWidth: 0, flexShrink: 1 }}><Text numberOfLines={2} style={[{ color: foreground, fontSize: 15, lineHeight: 20, fontWeight: '800', textAlign: 'center' }, labelStyle]}>{label}</Text></View>
  </PressableScale>;
}
