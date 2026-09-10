import React, { useState } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';

export function BookCover({ uri, style }: { uri?: string | null; style?: StyleProp<ViewStyle> }) {
  const { tokens } = useTheme();
  const [failedUri, setFailedUri] = useState<string>();
  return <View accessible={false} style={[{ aspectRatio: 1 / 1.38, borderRadius: tokens.radius.md, backgroundColor: tokens.colors.elevated, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }, style]}>
    {uri && failedUri !== uri ? <Image source={uri} recyclingKey={uri} contentFit="cover" cachePolicy="memory-disk" onError={() => setFailedUri(uri)} style={{ width: '100%', height: '100%' }} /> : <Ionicons name="book-outline" size={30} color={tokens.colors.primary} />}
  </View>;
}
