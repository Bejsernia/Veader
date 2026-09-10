import React from 'react';
import { Text, TextInput, TextInputProps, View } from 'react-native';
import { useTheme } from '../theme';

export function TextField({ label, error, style, ...props }: TextInputProps & { label: string; error?: string }) {
  const { tokens } = useTheme();
  return <View style={{ gap: 8, marginBottom: tokens.spacing.lg }}>
    <Text style={[tokens.typography.label, { color: tokens.colors.text }]}>{label}</Text>
    <TextInput accessibilityLabel={label} placeholderTextColor={tokens.colors.mutedText} selectionColor={tokens.colors.primary} {...props} style={[tokens.typography.body, { minHeight: 48, paddingHorizontal: 12, paddingVertical: 12, borderRadius: tokens.radius.sm, backgroundColor: tokens.colors.elevated, color: tokens.colors.text, borderWidth: 1, borderColor: error ? tokens.colors.danger : tokens.colors.divider }, style]} />
    {error && <Text accessibilityLiveRegion="polite" style={[tokens.typography.caption, { color: tokens.colors.danger }]}>{error}</Text>}
  </View>;
}
