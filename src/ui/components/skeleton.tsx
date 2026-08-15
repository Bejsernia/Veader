import React, { useEffect } from 'react';
import { View, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useTheme } from '../theme';

export function Skeleton({ style }: { style?: ViewStyle }) {
  const { tokens, reducedMotion } = useTheme();
  const value = useSharedValue(0.45);
  useEffect(() => { if (reducedMotion) { value.value = 0.55; return; } value.value = withRepeat(withTiming(0.9, { duration: 850 }), -1, true); }, [reducedMotion, value]);
  const animatedStyle = useAnimatedStyle(() => ({ opacity: value.value }));
  return <Animated.View style={[{ backgroundColor: tokens.colors.divider, borderRadius: tokens.radius.sm }, style, animatedStyle]} />;
}
