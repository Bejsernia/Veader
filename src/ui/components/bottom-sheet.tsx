import React, { useEffect } from 'react';
import { BackHandler, DimensionValue, Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useTheme } from '../theme';
import { motionSpring } from '../motion';
import { setNavigationBarAppearance } from '../../platform/system-bars';

type Props = { visible: boolean; onClose: () => void; children: React.ReactNode; style?: StyleProp<ViewStyle>; maxHeight?: DimensionValue };

export function BottomSheet({ visible, onClose, children, style, maxHeight = '88%' }: Props) {
  const { isDark, tokens } = useTheme();
  const translateY = useSharedValue(900);
  const scrim = useSharedValue(0);
  useEffect(() => { if (visible) { translateY.value = withSpring(0, motionSpring); scrim.value = withTiming(1, { duration: tokens.motion.normal }); } else { translateY.value = withTiming(900, { duration: tokens.motion.fast }); scrim.value = withTiming(0, { duration: tokens.motion.fast }); } }, [scrim, tokens.motion.fast, tokens.motion.normal, translateY, visible]);
  useEffect(() => {
    if (!visible) return;
    setNavigationBarAppearance(tokens.colors.surface, !isDark);
    return () => setNavigationBarAppearance(tokens.colors.background, !isDark);
  }, [isDark, tokens.colors.background, tokens.colors.surface, visible]);
  useEffect(() => {
    if (!visible) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { onClose(); return true; });
    return () => subscription.remove();
  }, [onClose, visible]);
  const pan = Gesture.Pan().onUpdate(event => { translateY.value = Math.max(0, event.translationY); }).onEnd(event => { if (event.translationY > 120 || event.velocityY > 700) { translateY.value = withTiming(900, { duration: tokens.motion.fast }, finished => { if (finished) runOnJS(onClose)(); }); } else { translateY.value = withSpring(0, motionSpring); } });
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrim.value }));
  if (!visible) return null;
  return <View style={[StyleSheet.absoluteFill, { zIndex: 1000, elevation: 1000 }]} pointerEvents="box-none"><View style={{ flex: 1, justifyContent: 'flex-end' }}><Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: tokens.colors.scrim }, scrimStyle]} /><Pressable accessibilityRole="button" accessibilityLabel="关闭" onPress={onClose} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} /><Animated.View style={[{ width: '100%', alignSelf: 'stretch', minHeight: 0, maxHeight, backgroundColor: tokens.colors.surface, borderTopLeftRadius: tokens.radius.xl, borderTopRightRadius: tokens.radius.xl, paddingTop: tokens.spacing.sm, paddingHorizontal: tokens.spacing.lg, paddingBottom: tokens.spacing.xl, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 18, elevation: 12 }, sheetStyle, style]}><GestureDetector gesture={pan}><View accessibilityLabel="拖动关闭" style={{ width: 42, height: 4, borderRadius: 2, backgroundColor: tokens.colors.mutedText, opacity: 0.6, alignSelf: 'center', marginBottom: tokens.spacing.md }} /></GestureDetector>{children}</Animated.View></View></View>;
}
