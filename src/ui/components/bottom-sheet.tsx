import React,{ useEffect,useRef,useState } from 'react';
import { DimensionValue,KeyboardAvoidingView,Modal,Platform,Pressable,StyleProp,StyleSheet,View,ViewStyle,useWindowDimensions } from 'react-native';
import { Gesture,GestureDetector,GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated,{ cancelAnimation,runOnJS,useAnimatedStyle,useSharedValue,withSpring,withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { motionEasing,motionSpring,sheetExitEasing } from '../motion';
import { useTheme } from '../theme';

type Props = { visible: boolean; onClose: () => void; children: React.ReactNode; style?: StyleProp<ViewStyle>; maxHeight?: DimensionValue };
/** The modal stays stationary; only its panel slides, independently of the scrim. */
export function BottomSheet({ visible, onClose, children, style, maxHeight = '88%' }: Props) {
  const { tokens, reducedMotion } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [present, setPresent] = useState(visible);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const shown = useRef(false);
  const transition = useRef(0);
  const progress = useSharedValue(0);
  const drag = useSharedValue(0);
  const sheetHeight = useSharedValue(height);
  const finishClose = (version: number) => {
    // A completed exit must not dismiss a newly reopened sheet.
    if (version !== transition.current || visibleRef.current) return;
    shown.current = false;
    setPresent(false);
  };
  useEffect(() => {
    const version = ++transition.current;
    cancelAnimation(progress);
    cancelAnimation(drag);
    if (visible) {
      setPresent(true);
      drag.value = 0;
      if (reducedMotion) progress.value = 1;
      else if (shown.current) progress.value = withTiming(1, { duration: 280, easing: motionEasing });
      // The initial entrance starts at onShow, after the native window is ready.
    } else if (reducedMotion || !shown.current) {
      progress.value = 0;
      finishClose(version);
    } else {
      progress.value = withTiming(0, { duration: 180, easing: sheetExitEasing }, finished => {
        if (finished) runOnJS(finishClose)(version);
      });
    }
  }, [visible, reducedMotion, progress, drag]);
  useEffect(() => () => { ++transition.current; cancelAnimation(progress); cancelAnimation(drag); }, [progress, drag]);
  const pan = Gesture.Pan().onUpdate(event => { drag.value = Math.min(sheetHeight.value, Math.max(0, event.translationY)); }).onEnd(event => {
    if (event.translationY > 120 || event.velocityY > 700) runOnJS(onClose)();
    else drag.value = reducedMotion ? 0 : withSpring(0, motionSpring);
  });
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - progress.value) * sheetHeight.value + progress.value * drag.value }] }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.value * Math.max(0, 1 - drag.value / Math.max(1, sheetHeight.value)) }));
  return <Modal visible={present} transparent animationType="none" onRequestClose={onClose} onShow={() => {
    shown.current = true;
    if (visibleRef.current) progress.value = reducedMotion ? 1 : withTiming(1, { duration: 280, easing: motionEasing });
  }} statusBarTranslucent>
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Animated.View testID="sheet-scrim" pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: tokens.colors.scrim }, scrimStyle]} />
      <Pressable accessibilityRole="button" accessibilityLabel="关闭面板" onPress={onClose} style={StyleSheet.absoluteFill} />
      <KeyboardAvoidingView pointerEvents="box-none" behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end', paddingTop: insets.top }}>
        <Animated.View testID="sheet-panel" onLayout={event => { if (event.nativeEvent.layout.height > 0) sheetHeight.value = event.nativeEvent.layout.height; }} accessibilityViewIsModal onAccessibilityEscape={onClose} style={[{ width: '100%', maxWidth: 640, alignSelf: 'center', minHeight: 0, maxHeight, backgroundColor: tokens.colors.surface, borderTopLeftRadius: tokens.radius.xl, borderTopRightRadius: tokens.radius.xl, paddingHorizontal: tokens.spacing.lg, paddingBottom: Math.max(insets.bottom, tokens.spacing.lg) }, sheetStyle, style]}>
          <GestureDetector gesture={pan}><View accessible={false} style={{ height: 32, width: '100%', alignItems: 'center', justifyContent: 'center' }}><View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: tokens.colors.mutedText }} /></View></GestureDetector>
          {children}
        </Animated.View>
      </KeyboardAvoidingView>
    </GestureHandlerRootView>
  </Modal>;
}
