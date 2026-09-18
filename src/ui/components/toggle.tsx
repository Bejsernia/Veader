import React from 'react';
import { Platform, Switch, SwitchProps } from 'react-native';
import { useTheme } from '../theme';

export function Toggle(props: SwitchProps & { accessibilityLabel: string }) {
  const { tokens } = useTheme();
  return <Switch
    {...props}
    trackColor={{ false: tokens.colors.divider, true: tokens.colors.selectedContainer }}
    thumbColor={Platform.OS === 'android' ? (props.value ? tokens.colors.primary : tokens.colors.mutedText) : undefined}
  />;
}
