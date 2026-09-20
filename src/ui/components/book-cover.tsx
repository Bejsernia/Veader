import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React,{ useState } from 'react';
import { StyleProp,StyleSheet,Text,View,ViewStyle } from 'react-native';
import { useTheme } from '../theme';

export function BookCover({ uri, title, style, natural = false }: { uri?: string | null; title?: string; style?: StyleProp<ViewStyle>; natural?: boolean }) {
  const { tokens } = useTheme();
  const coverWidth = StyleSheet.flatten(style)?.width;
  const small = typeof coverWidth === 'number' && coverWidth < 64;
  const [failedUri, setFailedUri] = useState<string>();
  const [dimensions, setDimensions] = useState<{ uri: string; ratio: number }>();
  const ratio = natural && uri && failedUri !== uri && dimensions?.uri === uri ? dimensions.ratio : 2 / 3;
  return <View accessible={false} style={[{ aspectRatio: ratio, borderRadius: tokens.radius.sm, backgroundColor: tokens.colors.elevated, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }, style]}>
    {uri && failedUri !== uri ? <Image source={uri} recyclingKey={uri} contentFit="contain" cachePolicy="memory-disk" onLoad={event => { const { width, height } = event.source; if (natural && width > 0 && height > 0 && Number.isFinite(width / height)) setDimensions({ uri, ratio: width / height }); }} onError={() => setFailedUri(uri)} style={{ width: '100%', height: '100%' }} /> : <View style={{ padding: 8, alignItems: 'center', gap: 8 }}>{(!small || !title) && <Ionicons name="book-outline" size={24} color={tokens.colors.mutedText} />}{title ? <Text numberOfLines={small ? 2 : 3} style={[tokens.typography.caption, { color: tokens.colors.mutedText, textAlign: 'center' }]}>{title}</Text> : null}</View>}
  </View>;
}
