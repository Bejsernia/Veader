import React from 'react';
import { ScrollView,ScrollViewProps,StatusBar,StyleProp,View,ViewStyle,useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getGridLayout } from '../layout';
import { useTheme } from '../theme';

/** Standalone pages own safe areas; tab content passes safeArea=false. */
export function Screen({ children, scroll = false, safeArea = true, style, contentStyle, scrollProps }: {
  children: React.ReactNode; scroll?: boolean; safeArea?: boolean;
  style?: StyleProp<ViewStyle>; contentStyle?: StyleProp<ViewStyle>;
  scrollProps?: Omit<ScrollViewProps, 'contentContainerStyle'>;
}) {
  const { tokens, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const Container = safeArea ? SafeAreaView : View;
  return <Container style={[{ flex: 1, backgroundColor: tokens.colors.background }, style]}>
    {safeArea && <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={tokens.colors.background} />}
    {scroll ? <ScrollView keyboardShouldPersistTaps="handled" {...scrollProps} contentContainerStyle={[{
      padding: tokens.spacing.lg, paddingHorizontal: getGridLayout(width).pageInset,
      paddingBottom: tokens.spacing.xxl, width: '100%', maxWidth: 960, alignSelf: 'center',
    }, contentStyle]}>{children}</ScrollView> : children}
  </Container>;
}
