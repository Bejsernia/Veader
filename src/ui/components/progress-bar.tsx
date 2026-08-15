import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../theme';

export function ProgressBar({ value, color, height = 5 }: { value: number; color?: string; height?: number }) {
  const { tokens } = useTheme();
  const progress = Math.max(0, Math.min(1, value));
  return <View accessible accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 1, now: progress }} style={{ height, width: '100%', borderRadius: height, overflow: 'hidden', backgroundColor: tokens.colors.divider }}><View style={{ height: '100%', width: `${progress * 100}%`, borderRadius: height, backgroundColor: color ?? tokens.colors.primary }} /></View>;
}
