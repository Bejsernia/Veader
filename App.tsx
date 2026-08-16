import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppShell } from './src/app/AppShell';
import { SeriesLibrary as LibraryScreen, SeriesDetail as SeriesDetailScreen, Recent as RecentScreen } from './src/features/library/LibraryScreens';
import { Me as MeScreen, CacheSettings as CacheScreen, SettingsPage as AboutScreen } from './src/features/settings/SettingsScreens';
import { Sources as SourcesScreen } from './src/features/sources/SourcesScreen';
import { DocumentReader as ReaderScreen } from './src/features/reader/ReaderScreens';
import { CategoriesScreen } from './src/features/categories/CategoriesScreen';
import { ReadingStatsScreen } from './src/features/stats/ReadingStatsScreen';
import { ReaderSettingsPage } from './src/features/settings/SettingsScreens';
import { ThemeProvider } from './src/ui/theme';

export default function App() {
  return <SafeAreaProvider>
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <AppShell features={{
          Library: LibraryScreen,
          Categories: CategoriesScreen,
          Recent: RecentScreen,
          Me: MeScreen,
          SeriesDetail: SeriesDetailScreen,
          DocumentReader: ReaderScreen,
          Sources: SourcesScreen,
          CacheSettings: CacheScreen,
          SettingsPage: AboutScreen,
          ReadingStats: ReadingStatsScreen,
          ReaderSettings: ReaderSettingsPage,
        }} />
      </ThemeProvider>
    </GestureHandlerRootView>
  </SafeAreaProvider>;
}
