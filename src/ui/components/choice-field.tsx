import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { BottomSheet } from './bottom-sheet';
import { ScreenHeader } from './screen-header';
import { IconButton } from './icon-button';
import { SettingsRow } from './settings-row';

/** Native-sized choice row; callers retain preference ownership. */
export function ChoiceField<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: readonly { value: T; label: string }[]; onChange: (value: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const { tokens } = useTheme();
  return <>
    <SettingsRow title={label} value={options.find(option => option.value === value)?.label} onPress={() => setOpen(true)} />
    <BottomSheet visible={open} onClose={() => setOpen(false)}>
      <ScreenHeader title={label} trailing={<IconButton name="close" label={'关闭' + label} onPress={() => setOpen(false)} />} />
      <ScrollView style={{ flexShrink: 1 }}>
        {options.map(option => <Pressable key={option.value} accessibilityRole="radio" accessibilityLabel={label + '：' + option.label} accessibilityState={{ checked: option.value === value }} onPress={() => { onChange(option.value); setOpen(false); }}>
          <View style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 12 }}>
            <Text style={[tokens.typography.body, { flex: 1, color: option.value === value ? tokens.colors.primary : tokens.colors.text }]}>{option.label}</Text>
            {option.value === value && <Ionicons name="checkmark" size={22} color={tokens.colors.primary} />}
          </View>
        </Pressable>)}
      </ScrollView>
    </BottomSheet>
  </>;
}
