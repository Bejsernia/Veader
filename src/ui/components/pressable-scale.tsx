import React, { useCallback, useState } from 'react';
import { Pressable, PressableProps, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { motionSpring } from '../motion';
import { useTheme } from '../theme';

export type HapticKind = 'none' | 'light' | 'medium' | 'selection';

type Props = Omit<PressableProps, 'style' | 'children'> & {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>);
  haptic?: HapticKind;
  scale?: number;
};

export function PressableScale({ haptic = 'light', scale = 0.97, onPressIn, onPressOut, style, disabled, children, ...props }: Props) {
  const { reducedMotion } = useTheme();
  const progress = useSharedValue(0);
  const [pressed, setPressed] = useState(false);
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: disabled ? 0.48 : 1,
    transform: [{ scale: reducedMotion ? 1 : 1 - progress.value * (1 - scale) }],
  }), [disabled, reducedMotion, scale]);

  const triggerHaptic = useCallback(() => {
    if (haptic === 'none') return;
    const task = haptic === 'medium'
      ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
      : haptic === 'selection'
        ? Haptics.selectionAsync()
        : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    void task.catch(() => undefined);
  }, [haptic]);

  const resolvedStyle = typeof style === 'function' ? style({ pressed }) : style;
  const flattenedStyle = StyleSheet.flatten(resolvedStyle) as ViewStyle | undefined;
  const contentStyle: ViewStyle = {
    flexDirection: flattenedStyle?.flexDirection ?? 'column',
    alignItems: flattenedStyle?.alignItems,
    justifyContent: flattenedStyle?.justifyContent,
    gap: flattenedStyle?.gap,
    flexWrap: flattenedStyle?.flexWrap,
  };
  return <Animated.View style={[resolvedStyle, animatedStyle]}>
    <Pressable
      {...props}
      disabled={disabled}
      onPressIn={event => { setPressed(true); progress.value = withSpring(1, motionSpring); triggerHaptic(); onPressIn?.(event); }}
      onPressOut={event => { setPressed(false); progress.value = withSpring(0, motionSpring); onPressOut?.(event); }}
      style={[resolvedStyle, StyleSheet.absoluteFill, { backgroundColor: 'transparent' }]}
    />
    <View pointerEvents="none" style={contentStyle}>{children}</View>
  </Animated.View>;
}
