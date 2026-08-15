import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { useTheme } from '../theme';

export function Card({ children, style, elevated = false }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; elevated?: boolean }) {
  const { tokens } = useTheme();
  return <View style={[{
    backgroundColor: elevated ? tokens.colors.elevated : tokens.colors.surface,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.lg,
    borderWidth: 1,
    borderColor: tokens.colors.divider,
  }, style]}>{children}</View>;
}
