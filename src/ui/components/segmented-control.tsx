import React from 'react';
import { Text, View } from 'react-native';
import { useTheme } from '../theme';
import { PressableScale } from './pressable-scale';

export function SegmentedControl<T extends string>({ label, options, value, onChange }: {
  label: string; options: readonly { value: T; label: string }[]; value: T; onChange: (value: T) => void;
}) {
  const { tokens } = useTheme();
  return <View style={{ gap: tokens.spacing.sm, marginBottom: tokens.spacing.lg }}>
    <Text style={[tokens.typography.label, { color: tokens.colors.text }]}>{label}</Text>
    <View style={{ flexDirection: 'row', padding: 4, borderRadius: tokens.radius.md, backgroundColor: tokens.colors.elevated }}>
      {options.map(option => <PressableScale key={option.value} accessibilityRole="radio" accessibilityLabel={label + '：' + option.label} accessibilityState={{ checked: value === option.value }} haptic="selection" onPress={() => onChange(option.value)} style={{ flex: 1, minHeight: 48, padding: 8, alignItems: 'center', justifyContent: 'center', borderRadius: tokens.radius.sm, backgroundColor: value === option.value ? tokens.colors.selectedContainer : 'transparent' }}>
        <Text style={[tokens.typography.label, { textAlign: 'center', color: value === option.value ? tokens.colors.onSelectedContainer : tokens.colors.mutedText }]}>{option.label}</Text>
      </PressableScale>)}
    </View>
  </View>;
}
