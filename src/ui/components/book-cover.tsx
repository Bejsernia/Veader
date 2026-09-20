import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React,{ useState } from 'react';
import { StyleProp,Text,View,ViewStyle } from 'react-native';
import { useTheme } from '../theme';

export function BookCover({ uri, title, style }: { uri?: string | null; title?: string; style?: StyleProp<ViewStyle> }) {
  const { tokens } = useTheme();
  const [failedUri, setFailedUri] = useState<string>();
  return <View accessible={false} style={[{ aspectRatio: 2 / 3, borderRadius: tokens.radius.sm, backgroundColor: tokens.colors.elevated, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }, style]}>
    {uri && failedUri !== uri ? <Image source={uri} recyclingKey={uri} contentFit="contain" cachePolicy="memory-disk" onError={() => setFailedUri(uri)} style={{ width: '100%', height: '100%' }} /> : <View style={{ padding: 8, alignItems: 'center', gap: 8 }}><Ionicons name="book-outline" size={24} color={tokens.colors.mutedText} />{title ? <Text numberOfLines={3} style={[tokens.typography.caption, { color: tokens.colors.mutedText, textAlign: 'center' }]}>{title}</Text> : null}</View>}
  </View>;
}
