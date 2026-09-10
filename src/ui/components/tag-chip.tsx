import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text,View } from 'react-native';
import { useTheme } from '../theme';
import { IconButton } from './icon-button';
import { PressableScale } from './pressable-scale';

export function TagChip({ label, author = false, selected = false, onPress, onRemove, locked = false }: {
  label: string; author?: boolean; selected?: boolean; onPress?: () => void; onRemove?: () => void; locked?: boolean;
}) {
  const { tokens } = useTheme();
  const content = <><Ionicons name={author ? 'person-outline' : 'pricetag-outline'} size={16} color={tokens.colors.onSelectedContainer} /><Text numberOfLines={2} style={[tokens.typography.caption, { color: tokens.colors.onSelectedContainer, flexShrink: 1 }]}>{label}</Text>{locked && <Ionicons name="lock-closed-outline" size={12} color={tokens.colors.onSelectedContainer} />}</>;
  const style = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, paddingHorizontal: 10, minHeight: onPress || onRemove ? 48 : 32, maxWidth: '100%' as const, borderRadius: tokens.radius.sm, backgroundColor: selected ? tokens.colors.selectedContainer : tokens.colors.elevated };
  if (onPress) return <PressableScale accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked: selected }} onPress={onPress} style={[style, { borderWidth: 1, borderColor: selected ? tokens.colors.primary : 'transparent' }]}>{content}</PressableScale>;
  return <View style={style}>{content}{onRemove && <IconButton name="close" label={'删除标签' + label} onPress={onRemove} />}</View>;
}
