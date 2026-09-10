import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../theme';

export function SettingsGroup({ children }: { children: React.ReactNode }) {
  const { tokens } = useTheme();
  const rows = React.Children.toArray(children).filter(Boolean);
  return <View style={{ backgroundColor: tokens.colors.surface, borderRadius: tokens.radius.md, paddingHorizontal: tokens.spacing.lg, marginBottom: tokens.spacing.lg }}>
    {rows.map((child, index) => <React.Fragment key={React.isValidElement(child) ? child.key ?? index : index}>{index > 0 && <View style={{ height: 1, backgroundColor: tokens.colors.divider }} />}{child}</React.Fragment>)}
  </View>;
}
