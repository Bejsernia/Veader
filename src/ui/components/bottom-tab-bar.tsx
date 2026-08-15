import React from 'react';
import { Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { PressableScale } from './pressable-scale';

export type BottomTab = { key: string; label: string; icon: keyof typeof Ionicons.glyphMap; activeIcon?: keyof typeof Ionicons.glyphMap };
type Props = { tabs: BottomTab[]; value: string; onChange: (key: string) => void };

export function BottomTabBar({ tabs, value, onChange }: Props) {
  const { tokens, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const barHeight = 74 + insets.bottom;
  return <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, width: '100%', height: barHeight, alignSelf: 'stretch', overflow: 'hidden', borderTopWidth: 1, borderTopColor: tokens.colors.divider }}>
    <BlurView intensity={isDark ? 38 : 55} tint={isDark ? 'dark' : 'light'} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }} />
    <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, flexDirection: 'row', paddingTop: tokens.spacing.sm, paddingBottom: Math.max(insets.bottom, tokens.spacing.sm) }}>
      {tabs.map(tab => {
        const active = tab.key === value;
        return <View key={tab.key} style={{ flex: 1, minWidth: 0, alignSelf: 'stretch' }}><PressableScale haptic="selection" onPress={() => onChange(tab.key)} style={{ flex: 1, width: '100%', minWidth: 0, minHeight: 52, alignItems: 'center', justifyContent: 'center', gap: 4 }}><View style={{ minWidth: 52, minHeight: 30, borderRadius: tokens.radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' }}><Ionicons name={active ? tab.activeIcon ?? tab.icon : tab.icon} size={21} color={active ? tokens.colors.primary : tokens.colors.mutedText} /></View><Text numberOfLines={1} style={{ alignSelf: 'stretch', textAlign: 'center', color: active ? tokens.colors.primary : tokens.colors.mutedText, fontSize: 11, lineHeight: 15, fontWeight: active ? '800' : '600' }}>{tab.label}</Text></PressableScale></View>;
      })}
    </View>
  </View>;
}
