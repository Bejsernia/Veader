import React from 'react';
import { ScrollView, ScrollViewProps, StyleProp, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';

type ScreenProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  scroll?: boolean;
  scrollProps?: Omit<ScrollViewProps, 'contentContainerStyle'>;
};

export function Screen({ children, style, contentStyle, scroll = false, scrollProps }: ScreenProps) {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const content = <View style={[{ flexGrow: 1, paddingBottom: insets.bottom + tokens.spacing.lg }, contentStyle]}>{children}</View>;
  return <View style={[{ flex: 1, backgroundColor: tokens.colors.background }, style]}>{scroll ? <ScrollView {...scrollProps} contentContainerStyle={contentStyle}>{children}</ScrollView> : content}</View>;
}
