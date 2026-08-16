import type { Ionicons } from '@expo/vector-icons';

export type AppTab = 'library' | 'categories' | 'recent' | 'me';
export type AppScreen = 'main' | 'sources' | 'document' | 'seriesDetail' | 'about' | 'cache' | 'readingStats' | 'readerSettings';

export type AppTabDefinition = {
  key: AppTab;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
};

export const appTabs: AppTabDefinition[] = [
  { key: 'library', label: '首页', icon: 'library' },
  { key: 'categories', label: '分类', icon: 'albums-outline' },
  { key: 'recent', label: '最近', icon: 'time' },
  { key: 'me', label: '我的', icon: 'person' },
];
