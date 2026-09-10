import React from 'react';
import { DimensionValue, KeyboardAvoidingView, Modal, Platform, Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useTheme } from '../theme';
import { motionSpring } from '../motion';

type Props = { visible: boolean; onClose: () => void; children: React.ReactNode; style?: StyleProp<ViewStyle>; maxHeight?: DimensionValue };
/** One modal boundary for menus, reader controls and keyboard-driven forms. */
export function BottomSheet({ visible, onClose, children, style, maxHeight = '88%' }: Props) {
  const { tokens, reducedMotion } = useTheme();
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(0);
  const pan = Gesture.Pan().onUpdate(event => { translateY.value = Math.max(0, event.translationY); }).onEnd(event => {
    if (event.translationY > 120 || event.velocityY > 700) { translateY.value = 0; runOnJS(onClose)(); }
    else translateY.value = reducedMotion ? 0 : withSpring(0, motionSpring);
  });
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  return <Modal visible={visible} transparent animationType={reducedMotion ? 'none' : 'slide'} onRequestClose={onClose} onShow={() => { translateY.value = 0; }} statusBarTranslucent>
    <GestureHandlerRootView style={{ flex: 1 }}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end', paddingTop: insets.top, backgroundColor: tokens.colors.scrim }}>
      <Pressable accessibilityRole="button" accessibilityLabel="关闭面板" onPress={onClose} style={StyleSheet.absoluteFill} />
      <Animated.View accessibilityViewIsModal onAccessibilityEscape={onClose} style={[{ width: '100%', maxWidth: 760, alignSelf: 'center', minHeight: 0, maxHeight, backgroundColor: tokens.colors.surface, borderTopLeftRadius: tokens.radius.xl, borderTopRightRadius: tokens.radius.xl, paddingHorizontal: tokens.spacing.lg, paddingBottom: Math.max(insets.bottom, tokens.spacing.lg) }, sheetStyle, style]}>
        <GestureDetector gesture={pan}><View accessible={false} style={{ height: 32, width: '100%', alignItems: 'center', justifyContent: 'center' }}><View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: tokens.colors.mutedText }} /></View></GestureDetector>
        {children}
      </Animated.View>
    </KeyboardAvoidingView></GestureHandlerRootView>
  </Modal>;
}
