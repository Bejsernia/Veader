import type { Ionicons } from '@expo/vector-icons';

export type AppTab = 'library' | 'recent' | 'me';
export type AppScreen = 'main' | 'sources' | 'document' | 'seriesDetail' | 'about' | 'cache';

export type AppTabDefinition = {
  key: AppTab;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
};

export const appTabs: AppTabDefinition[] = [
  { key: 'library', label: '首页', icon: 'library' },
  { key: 'recent', label: '最近', icon: 'time' },
  { key: 'me', label: '我的', icon: 'person' },
];
