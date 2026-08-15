import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, StatusBar, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AppScreen as Screen, AppTab as Tab } from './navigation';
import { appTabs } from './navigation';
import type { LibrarySeries, StoredBook, StoredChapter } from '../domain/models';
import { libraryRepository } from '../data/library-repository';
import { progressRepository } from '../data/progress-repository';
import { BottomTabBar } from '../ui/components/bottom-tab-bar';
import { useTheme } from '../ui/theme';

export type LibraryFeatureProps = {
  series: LibrarySeries[];
  importing: boolean;
  refreshLibraries: () => void | Promise<void>;
  openSeries: (series: LibrarySeries) => void | Promise<void>;
  continueSeries: (series: LibrarySeries) => void | Promise<void>;
  openSources: () => void;
};

export type RecentFeatureProps = {
  series: LibrarySeries[];
  openSeries: (series: LibrarySeries) => void | Promise<void>;
  clearHistory: (seriesId: number) => void | Promise<void>;
};

export type ReaderFeatureProps = {
  book: StoredBook;
  chapters: StoredChapter[];
  back: () => void;
  onSelectChapter: (chapter: StoredChapter) => void | Promise<void>;
  onProgress: (progress: number, location: string) => void | Promise<void>;
  onSetCover: (uri: string) => void | Promise<void>;
};

export type FeatureComponents = {
  Library: React.ComponentType<LibraryFeatureProps>;
  Recent: React.ComponentType<RecentFeatureProps>;
  Me: React.ComponentType<{ navigate: (screen: Screen) => void }>;
  SeriesDetail: React.ComponentType<{
    series: LibrarySeries;
    chapters: StoredChapter[];
    back: () => void;
    openChapter: (chapter: StoredChapter) => void | Promise<void>;
    continueReading: () => void | Promise<void>;
    uploadCover: () => void | Promise<void>;
  }>;
  DocumentReader: React.ComponentType<ReaderFeatureProps>;
  Sources: React.ComponentType<{ back: () => void; onBooksChanged: () => void }>;
  CacheSettings: React.ComponentType<{ back: () => void }>;
  SettingsPage: React.ComponentType<{ screen: Screen; back: () => void }>;
};

export function AppShell({ features }: { features: FeatureComponents }) {
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('library');
  const [screen, setScreen] = useState<Screen>('main');
  const [selectedStored, setSelectedStored] = useState<StoredBook>();
  const [importing, setImporting] = useState(false);
  const [libraryReady, setLibraryReady] = useState(false);
  const [series, setSeries] = useState<LibrarySeries[]>([]);
  const [selectedSeries, setSelectedSeries] = useState<LibrarySeries>();
  const [seriesChapters, setSeriesChapters] = useState<StoredChapter[]>([]);

  const refreshBooks = async () => {
    setSeries(await libraryRepository.listSeries());
  };

  useEffect(() => {
    let active = true;
    const bootstrap = async () => {
      try {
        await libraryRepository.initialize();
        const fastSeries = await libraryRepository.listSeries();
        if (active) {
          setSeries(fastSeries);
          setLibraryReady(true);
        }
        const hydratedSeries = await libraryRepository.listSeries();
        if (active) setSeries(hydratedSeries);
      } catch (reason) {
        console.warn(reason);
        if (active) setLibraryReady(true);
      }
    };
    void bootstrap();
    return () => { active = false; };
  }, []);

  const goBack = () => {
    const currentScreen = screen;
    setScreen(currentScreen === 'document' ? 'seriesDetail' : 'main');
    if (currentScreen === 'document') {
      void libraryRepository.listSeries().then(updated => {
        setSeries(updated);
        if (selectedSeries) {
          const next = updated.find(item => item.id === selectedSeries.id);
          if (next) {
            setSelectedSeries(next);
            void libraryRepository.listChapters(next.id).then(setSeriesChapters);
          }
        }
      }).catch(console.warn);
    }
  };

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (screen === 'main') return false;
      goBack();
      return true;
    });
    return () => subscription.remove();
  }, [screen, selectedSeries]);

  const refreshLibraries = async () => {
    setImporting(true);
    try {
      await libraryRepository.refreshAll();
      await refreshBooks();
    } finally {
      setImporting(false);
    }
  };

  const openSeries = async (value: LibrarySeries) => {
    setSelectedSeries(value);
    setSeriesChapters(await libraryRepository.listChapters(value.id));
    setScreen('seriesDetail');
  };

  const openChapter = async (chapter: StoredChapter, owner: LibrarySeries | undefined = selectedSeries) => {
    setImporting(true);
    try {
      const localChapter = await libraryRepository.ensureChapterLocal(chapter);
      setSelectedStored({ ...localChapter, author: owner?.author || localChapter.author || '' });
      setScreen('document');
    } catch (reason) {
      Alert.alert('无法打开章节', reason instanceof Error ? reason.message : String(reason));
    } finally {
      setImporting(false);
    }
  };

  const continueSeries = async (value: LibrarySeries) => {
    const chapters = await libraryRepository.listChapters(value.id);
    const target = chapters.find(chapter => chapter.id === value.currentChapterId) || chapters[0];
    if (target) {
      setSelectedSeries(value);
      setSeriesChapters(chapters);
      await openChapter(target, value);
    }
  };

  const { Library, Recent, Me, SeriesDetail, DocumentReader, Sources, CacheSettings, SettingsPage } = features;
  if (screen === 'document' && selectedStored) {
    return <DocumentReader
      key={selectedStored.id}
      book={selectedStored}
      chapters={seriesChapters}
      onSelectChapter={chapter => openChapter(chapter, selectedSeries)}
      back={goBack}
      onProgress={(progress, location) => {
        if (!('seriesId' in selectedStored)) return;
        return progressRepository.saveProgress({ chapter: selectedStored as StoredChapter, progress, location });
      }}
      onSetCover={uri => {
        if (selectedSeries) void libraryRepository.setSeriesCover(selectedSeries.id, uri).then(refreshBooks).catch(console.warn);
      }}
    />;
  }
  if (screen === 'seriesDetail' && selectedSeries) {
    return <SeriesDetail
      series={selectedSeries}
      chapters={seriesChapters}
      back={() => setScreen('main')}
      openChapter={openChapter}
      continueReading={() => continueSeries(selectedSeries)}
      uploadCover={() => libraryRepository.chooseSeriesCover(selectedSeries.id).then(async () => {
        await refreshBooks();
        const updated = (await libraryRepository.listSeries()).find(item => item.id === selectedSeries.id);
        if (updated) setSelectedSeries(updated);
      }).catch(console.warn)}
    />;
  }
  if (screen === 'sources') return <Sources back={goBack} onBooksChanged={() => { void refreshBooks(); }} />;
  if (screen === 'cache') return <CacheSettings back={goBack} />;
  if (screen === 'about') return <SettingsPage screen={screen} back={goBack} />;

  const content = !libraryReady
    ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}><ActivityIndicator size="large" color="#8B70F7" /><Text style={{ color: isDark ? '#B8B1C2' : '#88838E' }}>正在加载漫画库…</Text></View>
    : tab === 'library'
      ? <Library series={series} importing={importing} refreshLibraries={refreshLibraries} openSeries={openSeries} continueSeries={continueSeries} openSources={() => setScreen('sources')} />
      : tab === 'recent'
        ? <Recent series={series} openSeries={openSeries} clearHistory={id => progressRepository.clearHistory(id).then(refreshBooks).catch(console.warn)} />
        : <Me navigate={setScreen} />;

  return <SafeAreaView style={{ flex: 1, backgroundColor: isDark ? '#111114' : '#F8F7FA' }}>
    <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={isDark ? '#111114' : '#F8F7FA'} />
    <View style={{ flex: 1, paddingBottom: 82 + insets.bottom }}>{content}</View>
    <BottomTabBar tabs={appTabs.map(item => ({ key: item.key, label: item.label, icon: item.icon }))} value={tab} onChange={key => setTab(key as Tab)} />
  </SafeAreaView>;
}
