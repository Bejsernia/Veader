import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, DeviceEventEmitter, FlatList, Image, Modal, Pressable, ScrollView, StatusBar, Switch, Text, View, useWindowDimensions } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import NativeSlider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import type { StoredBook, StoredChapter } from '../../domain/models';
import { cropPageImage, type EpubComic, type EpubComicPage } from '../../content';
import { contentLoader, contentLocatorFromBook } from '../../content/content-loader';
import { libraryRepository } from '../../data/library-repository';
import { loadReaderPreferences, saveReaderPreferences } from '../../preferences';
import { PageLoader } from '../../reader/page-loader';
import { ReaderController } from '../../reader/reader-controller';
import { BottomSheet } from '../../ui/components/bottom-sheet';
import { PressableScale } from '../../ui/components/pressable-scale';
import { useTheme } from '../../ui/theme';
import { styles, pageLayoutStyles, uiStyles } from '../../ui/legacy-styles';
import { IconButton } from '../shared/library-ui';

let comicDarkTheme = true;
let comicRtlTheme = false;
function Slider(props: React.ComponentProps<typeof NativeSlider>) { return <NativeSlider {...props} inverted={comicRtlTheme} />; }

function EpubPageView({ book, page, width, height, crop = false, dark = comicDarkTheme, sessionId, pageLoader, onAspectRatio }: { book: StoredBook; page: EpubComicPage; width: number; height: number; crop?: boolean; dark?: boolean; sessionId?: string; pageLoader?: PageLoader; onAspectRatio?: (pageKey: string, ratio: number) => void }) {
  const [source, setSource] = useState<string>(() => crop ? '' : pageLoader?.getState(page.index).uri ?? ''); const [error, setError] = useState(false);
  const renderWidth = book.format === 'pdf' ? width : 0;
  useEffect(() => {
    let active = true;
    const cachedSource = crop ? '' : pageLoader?.getState(page.index).uri ?? '';
    setSource(cachedSource);
    setError(false);
    const unsubscribe = pageLoader?.subscribe(state => {
      if (!active || state.index !== page.index) return;
      if (state.status === 'ready' && state.uri && !crop) setSource(state.uri);
      if (state.status === 'error') setError(true);
    });
    const load = pageLoader ? pageLoader.load(page.index).then(result => result.uri) : Promise.reject(new Error('阅读页面加载器未就绪'));
    load.then(uri => crop ? cropPageImage(uri) : uri).then(uri => {
      if (!active) return;
      setSource(uri);
      Image.getSize(uri, (imageWidth, imageHeight) => {
        if (imageWidth > 0 && imageHeight > 0) onAspectRatio?.(page.imageUri, imageWidth / imageHeight);
      }, () => undefined);
    }).catch(() => active && setError(true));
    return () => { active = false; unsubscribe?.(); };
  }, [book, page, sessionId, crop, renderWidth, pageLoader, onAspectRatio]);
  const image = source ? <Image source={{ uri: source }} style={styles.epubImage} resizeMode="contain" onLoad={event => {
    const imageWidth = event.nativeEvent.source?.width ?? 0; const imageHeight = event.nativeEvent.source?.height ?? 0;
    if (imageWidth > 0 && imageHeight > 0) onAspectRatio?.(page.imageUri, imageWidth / imageHeight);
  }} /> : <View style={styles.readerMessage}>{error ? <><Ionicons name="warning-outline" size={32} color="#E1915F" /><Text style={styles.readerChapter}>第 {page.index + 1} 页加载失败</Text></> : <ActivityIndicator color="#8B70F7" />}</View>;
  return <View style={[styles.epubPage, { width, height, backgroundColor: dark ? '#09090B' : '#FFFFFF' }]}>{image}</View>;
}

type ReaderDisplayPage = { page: EpubComicPage };

function OptionSet({ values, value, onChange, dark }: { values: string[]; value: string; onChange: (value: string) => void; dark?: boolean }) {
  const { isDark: appIsDark } = useTheme();
  const isDark = dark ?? appIsDark;
  return <View style={[styles.segment, isDark && uiStyles.segmentDark]}>{values.map(v => <PressableScale haptic="selection" key={v} onPress={() => onChange(v)} style={[styles.segmentItem, value === v && styles.segmentActive, isDark && value === v && uiStyles.segmentActiveDark]}><Text style={[styles.segmentText, value === v && styles.segmentTextActive, isDark && value !== v && uiStyles.segmentTextDark, isDark && value === v && uiStyles.segmentTextActiveDark]}>{v}</Text></PressableScale>)}</View>;
}

function ComicEpubReader({ book, back: navigateBack, onProgress, onSetCover, chapters = [], onSelectChapter }: { book: StoredBook; back: () => void; onProgress?: (progress: number, location: string) => void | Promise<void>; onSetCover?: (uri: string) => void; chapters?: StoredChapter[]; onSelectChapter?: (chapter: StoredChapter) => void }) {
  const { tokens, isDark: appIsDark } = useTheme();
  const [comic, setComic] = useState<EpubComic>(); const [error, setError] = useState(''); const [menu, setMenu] = useState(false); const [chapterDirectory, setChapterDirectory] = useState(false); const [settings, setSettings] = useState(false);
  const [readingDirection, setReadingDirection] = useState<'ltr' | 'rtl' | 'vertical'>('ltr'); const [tapZones, setTapZones] = useState(true); const [smooth, setSmooth] = useState(true); const [dark, setDark] = useState(true); const [crop, setCrop] = useState(false); const [notch, setNotch] = useState(false); const [volume, setVolume] = useState(true); const [pageMode, setPageMode] = useState<'single' | 'double'>('single'); const [doubleOrder, setDoubleOrder] = useState<'natural' | 'reverse'>('natural');
  const [currentPage, setCurrentPage] = useState(0); const { width, height } = useWindowDimensions(); const insets = useSafeAreaInsets(); const [preferencesReady, setPreferencesReady] = useState(false); const preferredDirection = useRef<'ltr' | 'rtl' | 'vertical'>(); const sessionId = useRef('reader-' + Date.now().toString()).current; const listRef = useRef<FlatList<ReaderDisplayPage[]>>(null); const pageLoaderRef = useRef<PageLoader>(); const [pageLoader, setPageLoader] = useState<PageLoader>(); const readerControllerRef = useRef<ReaderController>(); const touchStart = useRef({ x: 0, y: 0, time: 0 }); const lastPrefetchGroup = useRef(-1); const lastProgress = useRef({ progress: book.progress, location: book.currentLocation || 'epub:0' });
  useEffect(() => { StatusBar.setHidden(true, 'none'); return () => { StatusBar.setHidden(false, 'none'); }; }, []);
  useEffect(() => {
    let active = true;
    loadReaderPreferences().then(preferences => {
      if (!active) return;
      if (preferences.readingDirection) { preferredDirection.current = preferences.readingDirection; setReadingDirection(preferences.readingDirection); }
      if (preferences.tapZones !== undefined) setTapZones(preferences.tapZones);
      if (preferences.smooth !== undefined) setSmooth(preferences.smooth);
      if (preferences.dark !== undefined) setDark(preferences.dark);
      if (preferences.crop !== undefined) setCrop(preferences.crop);
      if (preferences.notch !== undefined) setNotch(preferences.notch);
      if (preferences.volume !== undefined) setVolume(preferences.volume);
      if (preferences.pageMode) setPageMode(preferences.pageMode === 'double' ? 'double' : 'single');
      if (preferences.doubleOrder) setDoubleOrder(preferences.doubleOrder);
      setPreferencesReady(true);
    }).catch(() => active && setPreferencesReady(true));
    return () => { active = false; };
  }, []);
  useEffect(() => { if (!preferencesReady) return; void saveReaderPreferences({ readingDirection, tapZones, smooth, dark, crop, notch, volume, pageMode, doubleOrder }).catch(console.warn); }, [preferencesReady, readingDirection, tapZones, smooth, dark, crop, notch, volume, pageMode, doubleOrder]);
  useEffect(() => {
    let active = true;
    setComic(undefined); setError(''); setCurrentPage(0);
    lastProgress.current = { progress: book.progress, location: book.currentLocation || book.format + ':0' };
    const controller = new ReaderController({
      targetWidth: width * 2,
      prefetchDistance: 4,
      concurrency: 2,
      openChapter: (target, chapterSessionId) => contentLoader.open(contentLocatorFromBook(target), { sessionId: chapterSessionId, targetWidth: width * 2 }),
    });
    readerControllerRef.current = controller;
    controller.open(book, 0).then(state => {
      if (!active) { void controller.close().catch(console.warn); return; }
      const value = state.contentSession.comic;
      const restoredLocation = book.currentLocation?.match(new RegExp('^' + book.format + ':(\\d+)$'));
      const restoredPage = Math.max(0, Math.min(value.pages.length - 1, restoredLocation ? Number(restoredLocation[1]) : Math.round(book.progress * (value.pages.length - 1))));
      pageLoaderRef.current = state.pageLoader; setPageLoader(state.pageLoader);
      setComic({ ...value, author: value.author || book.author || '未知作者' }); setReadingDirection(preferredDirection.current ?? value.direction); setCurrentPage(restoredPage); void libraryRepository.recordContentInfo(book.id, value.pages.length).catch(console.warn);
      void persistProgress(restoredPage / Math.max(1, value.pages.length - 1), book.format + ':' + restoredPage);
      void controller.goTo(restoredPage).catch(() => undefined);
    }).catch(reason => { void libraryRepository.recordContentInfo(book.id, 0, 'error').catch(console.warn); if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => {
      active = false;
      if (readerControllerRef.current === controller) { readerControllerRef.current = undefined; pageLoaderRef.current = undefined; setPageLoader(undefined); }
      void controller.close().catch(console.warn);
    };
  }, [book, width]);
  useEffect(() => { pageLoaderRef.current?.load(currentPage).catch(() => undefined); pageLoaderRef.current?.prefetchAround(currentPage); }, [currentPage]);
  const prefetchedChapters = useRef(new Set<number>());
  useEffect(() => {
    if (!comic || currentPage < comic.pages.length - 2) return;
    const currentChapterIndex = chapters.findIndex(chapter => chapter.id === book.id);
    const next = currentChapterIndex >= 0 ? chapters[currentChapterIndex + 1] : undefined;
    if (!next || prefetchedChapters.current.has(next.id)) return;
    prefetchedChapters.current.add(next.id);
    let active = true;
    void (async () => {
      try {
        const local = await libraryRepository.ensureChapterLocal(next);
        if (!active) return;
        const nextSessionId = 'prefetch-' + next.id + '-' + Date.now();
        const session = await contentLoader.open(contentLocatorFromBook(local), { sessionId: nextSessionId, targetWidth: width * 2 });
        try {
          if (active && session.comic.pages.length > 0) await session.getPage(0, { targetWidth: width * 2 });
        } finally {
          await session.close();
        }
      } catch {
        prefetchedChapters.current.delete(next.id);
      }
    })();
    return () => { active = false; };
  }, [book.id, chapters, comic, currentPage, width]);
  useEffect(() => { if (!comic) return; const timer = setTimeout(() => listRef.current?.scrollToIndex({ index: toGroup(currentPage), animated: false }), 0); return () => clearTimeout(timer); }, [comic, currentPage, pageMode, doubleOrder, readingDirection, width, height]);
  const persistProgress = (progress: number, location: string) => { lastProgress.current = { progress, location }; const result = onProgress ? onProgress(progress, location) : undefined; return Promise.resolve(result).catch(console.warn); };
  const leaving = useRef(false);
  const leaveReader = async () => { if (leaving.current) return; leaving.current = true; navigateBack(); await persistProgress(lastProgress.current.progress, lastProgress.current.location); };
  const back = leaveReader;
  const leaveReaderRef = useRef<() => Promise<void>>();
  leaveReaderRef.current = leaveReader;
  useEffect(() => { const subscription = BackHandler.addEventListener('hardwareBackPress', () => { void leaveReaderRef.current?.(); return true; }); return () => subscription.remove(); }, []);
  const pageChanged = (page: number) => { if (!comic) return; const safe = Math.max(0, Math.min(comic.pages.length - 1, page)); setCurrentPage(safe); void persistProgress(safe / Math.max(1, comic.pages.length - 1), `${book.format}:${safe}`); };
  const displayPages = useMemo<ReaderDisplayPage[]>(() => {
    if (!comic) return [];
    const pages = readingDirection === 'rtl' ? [...comic.pages].reverse() : comic.pages;
    return pages.map(page => ({ page }));
  }, [comic, readingDirection, pageMode]);
  const displayGroups = useMemo(() => {
    if (pageMode === 'single') return displayPages.map(page => [page]);
    const groups: ReaderDisplayPage[][] = [];
    for (let index = 0; index < displayPages.length; index += 2) {
      const group = displayPages.slice(index, index + 2);
      if (doubleOrder === 'reverse') group.reverse();
      groups.push(group);
    }
    return groups;
  }, [displayPages, pageMode, doubleOrder]);
  const toDisplay = (actual: number) => readingDirection === 'rtl' && comic ? comic.pages.length - 1 - actual : actual;
  const toActual = (display: number) => readingDirection === 'rtl' && comic ? comic.pages.length - 1 - display : display;
  const toGroup = (actual: number) => Math.floor(toDisplay(actual) / (pageMode === 'single' ? 1 : 2));
  const goTo = (actual: number, animated = smooth) => { if (!comic) return; const safe = Math.max(0, Math.min(comic.pages.length - 1, actual)); listRef.current?.scrollToIndex({ index: toGroup(safe), animated }); pageChanged(safe); };
  const changeChapter = (delta: number) => { const index = chapters.findIndex(chapter => chapter.id === book.id); const target = chapters[index + delta]; if (target) onSelectChapter?.(target); };
  const handleTap = (coordinate: number) => { if (!comic) return; const axisLength = readingDirection === 'vertical' ? height : width; if (!tapZones) return setMenu(!menu); if (coordinate >= axisLength / 3 && coordinate <= axisLength * 2 / 3) return setMenu(!menu); const next = readingDirection === 'vertical' ? coordinate > axisLength * 2 / 3 : readingDirection === 'rtl' ? coordinate < axisLength / 3 : coordinate > axisLength * 2 / 3; if (next && currentPage >= comic.pages.length - 1) return changeChapter(1); if (!next && currentPage <= 0) return changeChapter(-1); goTo(currentPage + (next ? 1 : -1)); };
  const changeDirection = (value: string) => { const direction = value === '从右到左' ? 'rtl' : value === '从上到下' ? 'vertical' : 'ltr'; comicRtlTheme = direction === 'rtl'; setReadingDirection(direction); setTimeout(() => listRef.current?.scrollToIndex({ index: toGroup(currentPage), animated: false }), 0); };
  useEffect(() => { const subscription = DeviceEventEmitter.addListener('veaderVolumeKey', (key: string) => { if (!volume) return; goTo(currentPage + (key === 'up' ? -1 : 1)); }); return () => subscription.remove(); }, [volume, currentPage, comic, smooth]);
  comicRtlTheme = readingDirection === 'rtl'; comicDarkTheme = dark;
  // The detailed reader settings sheet follows the app-wide appearance.
  // It must not inherit the page canvas toggle, otherwise a light app with
  // a black reading canvas would still show a dark settings sheet.
  const settingsDark = appIsDark;
  // Reader controls follow the app-wide appearance. The page canvas toggle
  // only changes the manga background and must not recolor the controls.
  const menuDark = appIsDark;
  const menuPrimary = menuDark ? '#FFFFFF' : '#28262D';
  const menuMuted = menuDark ? '#A7A4AC' : '#77727F';
  const menuBackground = menuDark ? 'rgba(8,8,10,.94)' : 'rgba(248,247,250,.96)';
  const menuTrack = menuDark ? '#55515B' : '#D0CBD8';
  const [pageRatios, setPageRatios] = useState<Record<string, number>>({});
  const reportPageAspectRatio = useCallback((pageKey: string, ratio: number) => { setPageRatios(previous => previous[pageKey] === ratio ? previous : { ...previous, [pageKey]: ratio }); }, []);
  const renderPageGroup = ({ item }: { item: ReaderDisplayPage[] }) => {
    const isVertical = readingDirection === 'vertical';
    const ratios = item.map(display => pageRatios[display.page.imageUri] ?? 0.68);
    const totalRatio = isVertical ? ratios.reduce((sum, ratio) => sum + 1 / Math.max(0.1, ratio), 0) : ratios.reduce((sum, ratio) => sum + ratio, 0);
    const scale = isVertical ? Math.min(width, height / Math.max(0.1, totalRatio)) : Math.min(height, width / Math.max(0.1, totalRatio));
    const sizes = ratios.map(ratio => isVertical ? { width: scale, height: scale / Math.max(0.1, ratio) } : { width: scale * ratio, height: scale });
    const contentWidth = isVertical ? scale : sizes.reduce((sum, size) => sum + size.width, 0);
    const contentHeight = isVertical ? sizes.reduce((sum, size) => sum + size.height, 0) : scale;
    return <View style={{ width, height, alignItems: 'center', justifyContent: 'center', padding: 0, margin: 0 }}><View style={{ width: contentWidth, height: contentHeight, flexDirection: isVertical ? 'column' : 'row', alignItems: 'center', justifyContent: 'center', padding: 0, margin: 0 }}>{item.map((display, index) => { const size = sizes[index]!; return <View key={display.page.imageUri} style={{ width: size.width, height: size.height, margin: 0, padding: 0, overflow: 'hidden' }}><EpubPageView book={book} page={display.page} width={size.width} height={size.height} crop={crop} dark={dark} sessionId={sessionId} pageLoader={pageLoader} onAspectRatio={reportPageAspectRatio} /></View>; })}</View></View>;
  };
  if (error) return <SafeAreaView style={styles.documentReader}><View style={styles.documentTop}><IconButton name="chevron-back" onPress={back} dark /><Text style={styles.readerBook}>{book.title}</Text></View><View style={styles.readerMessage}><Ionicons name="warning-outline" size={38} color="#E1915F" /><Text style={styles.errorText}>{error}</Text></View></SafeAreaView>;
  if (!comic) return <SafeAreaView style={styles.documentReader}><View style={styles.readerMessage}><ActivityIndicator color="#8B70F7" size="large" /><Text style={styles.readerChapter}>正在建立 {book.format.toUpperCase()} 页表…</Text></View></SafeAreaView>;
    return <View style={[styles.comicReader, { backgroundColor: dark ? '#09090B' : '#FFFFFF' }]}><StatusBar hidden barStyle={menuDark ? 'light-content' : 'dark-content'} /><FlatList ref={listRef} data={displayGroups} extraData={`${dark}:${menuDark}:${crop}:${pageMode}:${readingDirection}:${Object.keys(pageRatios).length}`} horizontal={readingDirection !== 'vertical'} pagingEnabled initialScrollIndex={toGroup(currentPage)} getItemLayout={(_, index) => ({ length: readingDirection === 'vertical' ? height : width, offset: (readingDirection === 'vertical' ? height : width) * index, index })} windowSize={5} initialNumToRender={3} maxToRenderPerBatch={4} updateCellsBatchingPeriod={16} removeClippedSubviews={false} keyExtractor={group => group.map(item => item.page.imageUri).join('|')} showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false} renderItem={renderPageGroup} onScroll={event => { const axis = readingDirection === 'vertical' ? height : width; const offset = readingDirection === 'vertical' ? event.nativeEvent.contentOffset.y : event.nativeEvent.contentOffset.x; const groupIndex = Math.max(0, Math.min(displayGroups.length - 1, Math.round(offset / Math.max(1, axis)))); if (groupIndex === lastPrefetchGroup.current) return; lastPrefetchGroup.current = groupIndex; const firstDisplayIndex = groupIndex * (pageMode === 'single' ? 1 : 2); if (displayPages[firstDisplayIndex]) pageLoaderRef.current?.prefetchAround(toActual(firstDisplayIndex)); }} scrollEventThrottle={16} onTouchStart={event => { touchStart.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY, time: Date.now() }; }} onTouchEnd={event => { const start = touchStart.current; touchStart.current = { x: 0, y: 0, time: 0 }; const coordinate = readingDirection === 'vertical' ? event.nativeEvent.pageY : event.nativeEvent.pageX; if (Date.now() - start.time < 350 && Math.abs(event.nativeEvent.pageX - start.x) < 12 && Math.abs(event.nativeEvent.pageY - start.y) < 12) handleTap(coordinate); }} onMomentumScrollEnd={event => { const offset = readingDirection === 'vertical' ? event.nativeEvent.contentOffset.y : event.nativeEvent.contentOffset.x; const groupIndex = Math.round(offset / (readingDirection === 'vertical' ? height : width)); const firstDisplayIndex = groupIndex * (pageMode === 'single' ? 1 : 2); if (displayPages[firstDisplayIndex]) pageChanged(toActual(firstDisplayIndex)); }} />{menu && <><View style={[styles.readerTop, styles.readerMenuSurface, styles.readerOverlay, { paddingTop: notch ? Math.min(insets.top, 12) : 0, height: notch ? 76 : 66, backgroundColor: menuBackground }]}><IconButton name="chevron-back" onPress={back} color={menuPrimary} /><View style={styles.readerTopTitle}><Text numberOfLines={1} style={[styles.readerBook, { color: menuPrimary }]}>{comic.title}</Text><Text style={[styles.readerChapter, { color: menuMuted }]}>{comic.author} · {readingDirection === 'rtl' ? '从右到左' : readingDirection === 'vertical' ? '从上到下' : '从左到右'}</Text></View></View><View style={[styles.epubBottom, styles.readerMenuSurface, styles.readerOverlay, { backgroundColor: menuBackground }]}><Text numberOfLines={1} style={[styles.chapterLabel, { color: menuMuted }]}>{comic.title} · 整卷</Text><Slider style={styles.readerSlider} minimumValue={0} maximumValue={comic.pages.length - 1} step={1} value={currentPage} minimumTrackTintColor="#8B70F7" maximumTrackTintColor={menuTrack} thumbTintColor={menuPrimary} onSlidingComplete={value => goTo(value)} /><View style={styles.quickActions}><PressableScale haptic="selection" style={styles.quickAction} accessibilityRole="button" accessibilityLabel="章节目录" onPress={() => chapters.length ? setChapterDirectory(true) : navigateBack()}><Ionicons name="list-outline" size={21} color={menuPrimary} /></PressableScale><Text numberOfLines={1} style={[styles.epubCounter, { flex: 1, minWidth: 120, color: menuPrimary, fontSize: 14, lineHeight: 20, fontWeight: '800', textAlign: 'center', paddingHorizontal: 8 }]}>{`第 ${currentPage + 1} / ${comic.pages.length} 页`}</Text><PressableScale haptic="selection" style={styles.quickAction} accessibilityRole="button" accessibilityLabel="详细设置" onPress={() => setSettings(true)}><Ionicons name="options-outline" size={21} color={menuPrimary} /></PressableScale></View></View></>}
    <ChapterDirectorySheet visible={chapterDirectory} book={book} chapters={chapters} onClose={() => setChapterDirectory(false)} onSelectChapter={onSelectChapter} />
    <BottomSheet visible={settings} onClose={() => setSettings(false)} maxHeight="90%"><View style={[pageLayoutStyles.readerSettingsContent, settingsDark && styles.sheetDark]}><ScrollView contentInsetAdjustmentBehavior="automatic" style={{ minHeight: 0, marginHorizontal: -tokens.spacing.lg }} contentContainerStyle={[pageLayoutStyles.readerSettingsScrollContent, { paddingHorizontal: tokens.spacing.lg }]} scrollIndicatorInsets={{ right: 0 }}><View style={styles.sheetHeading}><Text style={[styles.sheetTitle, settingsDark && styles.textPrimaryDark]}>详细阅读设置</Text><PressableScale haptic="light" accessibilityRole="button" accessibilityLabel="完成" onPress={() => setSettings(false)} style={{ minWidth: 44, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' }}><Text style={[styles.done, settingsDark && uiStyles.doneDark]}>完成</Text></PressableScale></View>{onSetCover && <PressableScale haptic="light" style={[styles.coverAction, settingsDark && uiStyles.coverActionDark]} onPress={() => { pageLoaderRef.current?.load(currentPage).then(result => { onSetCover(result.uri); setSettings(false); }).catch(console.warn); }}><Ionicons name="image-outline" size={20} color={settingsDark ? '#C8B9FF' : '#7257E7'} /><Text style={[styles.coverActionText, settingsDark && uiStyles.coverActionTextDark]}>将当前第 {currentPage + 1} 页设为作品封面</Text></PressableScale>}<Text style={[styles.settingSection, settingsDark && uiStyles.settingSectionDark]}>阅读方向</Text><OptionSet dark={settingsDark} values={['从左到右', '从右到左', '从上到下']} value={readingDirection === 'rtl' ? '从右到左' : readingDirection === 'vertical' ? '从上到下' : '从左到右'} onChange={changeDirection} /><Text style={[styles.modalHelp, settingsDark && styles.textMutedDark]}>屏幕点击区域功能示意</Text><View style={[styles.tapPreview, { marginTop: 8 }]}><View style={[styles.tapPreviewSide, settingsDark && uiStyles.tapPreviewSideDark]}><Text style={[styles.tapPreviewText, settingsDark && uiStyles.tapPreviewTextDark]}>{readingDirection === 'rtl' ? '下一页' : '上一页'}</Text></View><View style={[styles.tapPreviewCenter, settingsDark && uiStyles.tapPreviewCenterDark]}><Text style={[styles.tapPreviewText, settingsDark && uiStyles.tapPreviewTextDark]}>菜单</Text></View><View style={[styles.tapPreviewSide, settingsDark && uiStyles.tapPreviewSideDark]}><Text style={[styles.tapPreviewText, settingsDark && uiStyles.tapPreviewTextDark]}>{readingDirection === 'rtl' ? '上一页' : '下一页'}</Text></View></View><Text style={[styles.settingSection, settingsDark && uiStyles.settingSectionDark]}>翻页效果</Text><OptionSet dark={settingsDark} values={['直接翻页', '平滑翻页']} value={smooth ? '平滑翻页' : '直接翻页'} onChange={value => setSmooth(value === '平滑翻页')} /><Text style={[styles.settingSection, settingsDark && uiStyles.settingSectionDark]}>页面布局</Text><OptionSet dark={settingsDark} values={['单页', '双页']} value={pageMode === 'double' ? '双页' : '单页'} onChange={value => setPageMode(value === '双页' ? 'double' : 'single')} />{pageMode !== 'single' && <><Text style={[styles.settingSection, settingsDark && uiStyles.settingSectionDark]}>双页顺序</Text><OptionSet dark={settingsDark} values={['奇数在前', '偶数在前']} value={doubleOrder === 'reverse' ? '偶数在前' : '奇数在前'} onChange={value => setDoubleOrder(value === '偶数在前' ? 'reverse' : 'natural')} /></>}<View style={[styles.toggleRow, settingsDark && uiStyles.toggleRowDark]}><Text style={[styles.toggleText, settingsDark && uiStyles.toggleTextDark]}>自动裁切白边</Text><Switch value={crop} onValueChange={setCrop} trackColor={{ true: '#765BE8' }} /></View><View style={[styles.toggleRow, settingsDark && uiStyles.toggleRowDark]}><Text style={[styles.toggleText, settingsDark && uiStyles.toggleTextDark]}>点击区域翻页</Text><Switch value={tapZones} onValueChange={setTapZones} trackColor={{ true: '#765BE8' }} /></View><View style={[styles.toggleRow, settingsDark && uiStyles.toggleRowDark]}><Text style={[styles.toggleText, settingsDark && uiStyles.toggleTextDark]}>黑色阅读背景</Text><Switch value={dark} onValueChange={setDark} trackColor={{ true: '#765BE8' }} /></View><View style={[styles.toggleRow, settingsDark && uiStyles.toggleRowDark]}><Text style={[styles.toggleText, settingsDark && uiStyles.toggleTextDark]}>刘海区域显示内容</Text><Switch value={notch} onValueChange={setNotch} trackColor={{ true: '#765BE8' }} /></View></ScrollView></View></BottomSheet>
  </View>;
}


function DocumentReader({ book, back, onProgress, onSetCover, chapters, onSelectChapter }: { book: StoredBook; back: () => void; onProgress?: (progress: number, location: string) => void | Promise<void>; onSetCover?: (uri: string) => void; chapters?: StoredChapter[]; onSelectChapter?: (chapter: StoredChapter) => void }) {
  if (book.format === 'epub' || book.format === 'mobi' || book.format === 'pdf') return <ComicEpubReader book={book} back={back} onProgress={onProgress} onSetCover={onSetCover} chapters={chapters} onSelectChapter={onSelectChapter} />;
  return null;
}


function ChapterDirectorySheet({ visible, book, chapters, onClose, onSelectChapter }: { visible: boolean; book: StoredBook; chapters: StoredChapter[]; onClose: () => void; onSelectChapter?: (chapter: StoredChapter) => void }) {
  const { tokens, isDark } = useTheme();
  return <BottomSheet visible={visible} onClose={onClose} maxHeight="86%"><View style={{ minHeight: 0 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm, marginBottom: tokens.spacing.sm }}><View style={{ flex: 1, minWidth: 0 }}><Text style={{ color: tokens.colors.text, fontSize: 21, lineHeight: 28, fontWeight: '800' }}>章节目录</Text><Text numberOfLines={1} style={{ color: tokens.colors.mutedText, fontSize: 12, lineHeight: 18 }}>{chapters.length} 个章节</Text></View><IconButton name="close" label="关闭章节目录" onPress={onClose} /></View><FlatList data={chapters} keyExtractor={item => String(item.id)} contentInsetAdjustmentBehavior="automatic" showsVerticalScrollIndicator style={{ minHeight: 0 }} contentContainerStyle={pageLayoutStyles.chapterDirectoryList} renderItem={({ item }) => <PressableScale haptic="light" accessibilityRole="button" accessibilityLabel={`打开第 ${item.chapterNumber} 章`} style={[styles.chapter, isDark && styles.chapterDark, item.id === book.id && styles.chapterCurrentRow, isDark && item.id === book.id && uiStyles.chapterCurrentRowDark]} onPress={() => { onClose(); onSelectChapter?.(item); }}><View style={[styles.chapterNumber, isDark && uiStyles.chapterNumberDark, item.id === book.id && styles.chapterCurrentNumber]}><Text style={[styles.chapterNumberText, isDark && uiStyles.chapterNumberTextDark, item.id === book.id && styles.chapterCurrentNumberText]}>{item.chapterNumber}</Text></View><View style={pageLayoutStyles.chapterDirectoryBody}><Text numberOfLines={1} ellipsizeMode="tail" style={[styles.rowTitle, isDark && styles.textPrimaryDark, item.id === book.id && styles.chapterCurrentTitle, isDark && item.id === book.id && uiStyles.chapterCurrentTitleDark]}>{item.chapterTitle}</Text><Text style={[styles.meta, isDark && styles.textMutedDark, item.id === book.id && styles.chapterCurrentMeta, isDark && item.id === book.id && uiStyles.chapterCurrentMetaDark]}>{item.format.toUpperCase()} · {Math.round(item.progress * 100)}%</Text></View>{item.id === book.id && <View style={styles.dot} />}</PressableScale>} /></View></BottomSheet>;
}

function ChapterDirectoryModal({ visible, book, chapters, onClose, onSelectChapter }: { visible: boolean; book: StoredBook; chapters: StoredChapter[]; onClose: () => void; onSelectChapter?: (chapter: StoredChapter) => void }) {
  const { isDark } = useTheme();
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><Pressable accessibilityRole="button" accessibilityLabel="关闭章节目录" style={styles.readerSettingsShade} onPress={onClose} /><View style={[styles.sheet, styles.readerSettingsSheet, styles.tallSheet, isDark && styles.sheetDark]}><View style={styles.sheetHandle} /><View style={styles.sheetHeading}><Text style={[styles.sheetTitle, isDark && styles.textPrimaryDark]}>章节目录</Text><Pressable accessibilityRole="button" accessibilityLabel="完成" onPress={onClose}><Text style={styles.done}>完成</Text></Pressable></View><FlatList data={chapters} keyExtractor={item => String(item.id)} contentInsetAdjustmentBehavior="automatic" renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`打开第 ${item.chapterNumber} 章`} style={[styles.chapter, isDark && styles.chapterDark, item.id === book.id && styles.chapterCurrentRow, isDark && item.id === book.id && uiStyles.chapterCurrentRowDark]} onPress={() => { onClose(); onSelectChapter?.(item); }}><View style={[styles.chapterNumber, isDark && uiStyles.chapterNumberDark, item.id === book.id && styles.chapterCurrentNumber]}><Text style={[styles.chapterNumberText, isDark && uiStyles.chapterNumberTextDark, item.id === book.id && styles.chapterCurrentNumberText]}>{item.chapterNumber}</Text></View><View style={styles.flex}><Text numberOfLines={1} style={[styles.rowTitle, isDark && styles.textPrimaryDark, item.id === book.id && styles.chapterCurrentTitle, isDark && item.id === book.id && uiStyles.chapterCurrentTitleDark]}>{item.chapterTitle}</Text><Text style={[styles.meta, isDark && styles.textMutedDark, item.id === book.id && styles.chapterCurrentMeta, isDark && item.id === book.id && uiStyles.chapterCurrentMetaDark]}>{item.format.toUpperCase()} · {Math.round(item.progress * 100)}%</Text></View></Pressable>} /></View></Modal>;
}

export { DocumentReader };
