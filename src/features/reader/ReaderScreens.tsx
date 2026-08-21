import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, BackHandler, DeviceEventEmitter, FlatList, Image, InteractionManager, Modal, PanResponder, PixelRatio, Pressable, ScrollView, StatusBar, Switch, Text, View, useWindowDimensions } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withDecay, withSpring, withTiming } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import NativeSlider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import type { StoredBook, StoredChapter } from '../../domain/models';
import { cropPageImage, type EpubComic, type EpubComicPage } from '../../content';
import { contentLoader, contentLocatorFromBook } from '../../content/content-loader';
import { libraryRepository } from '../../data/library-repository';
import { readerSettingsRepository } from '../../data/reader-settings-repository';
import { statsRepository } from '../../data/stats-repository';
import { PageLoader } from '../../reader/page-loader';
import { ReaderController } from '../../reader/reader-controller';
import { getAdjacentChapter, orderedChapters } from '../../reader/chapter-navigation';
import { chapterBoundaryDelta } from '../../reader/chapter-boundary';
import { chapterPrefetcher, type PrefetchEdge } from '../../reader/chapter-prefetcher';
import { BottomSheet } from '../../ui/components/bottom-sheet';
import { PressableScale } from '../../ui/components/pressable-scale';
import { useTheme } from '../../ui/theme';
import { styles, pageLayoutStyles, uiStyles } from '../../ui/legacy-styles';
import { IconButton } from '../shared/library-ui';
import { setVolumeKeyPagingEnabled } from '../../platform/volume-keys';
import { setNavigationBarAppearance } from '../../platform/system-bars';

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

function ZoomablePage({ width, height, active, tapEnabled = active, children, onZoomChange, onTap, tapAxis = 'horizontal' }: { width: number; height: number; active: boolean; tapEnabled?: boolean; children: React.ReactNode; onZoomChange?: (zoomed: boolean) => void; onTap?: (coordinate: number) => void; tapAxis?: 'horizontal' | 'vertical' }) {
  const { reducedMotion, tokens } = useTheme();
  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const startScale = useSharedValue(1);
  const startTranslateX = useSharedValue(0);
  const startTranslateY = useSharedValue(0);
  const startFocalX = useSharedValue(0);
  const startFocalY = useSharedValue(0);
  const zoomedRef = useRef(false);

  const boundX = (value: number) => { 'worklet'; return Math.max(0, (width * value - width) / 2); };
  const boundY = (value: number) => { 'worklet'; return Math.max(0, (height * value - height) / 2); };
  const clamp = (value: number, limit: number) => { 'worklet'; return Math.max(-limit, Math.min(limit, value)); };
  const notifyZoom = (value: boolean) => { zoomedRef.current = value; onZoomChange?.(value); };

  useEffect(() => {
    if (active) return;
    cancelAnimation(scale);
    cancelAnimation(translateX);
    cancelAnimation(translateY);
    const duration = reducedMotion ? 80 : tokens.motion.normal;
    scale.value = withTiming(1, { duration });
    translateX.value = withTiming(0, { duration });
    translateY.value = withTiming(0, { duration });
    notifyZoom(false);
  }, [active, onZoomChange, reducedMotion, tokens.motion.normal, scale, translateX, translateY]);

  const pinchStartDistance = useRef(0);
  const pinchActive = useRef(false);
  const panActive = useRef(false);
  const readTouches = (event: { nativeEvent: { touches?: Array<{ locationX?: number; locationY?: number; pageX?: number; pageY?: number }> } }) => event.nativeEvent.touches ?? [];
  const distanceBetween = (first: { locationX?: number; locationY?: number; pageX?: number; pageY?: number }, second: { locationX?: number; locationY?: number; pageX?: number; pageY?: number }) => {
    const firstX = first.locationX ?? first.pageX ?? 0;
    const firstY = first.locationY ?? first.pageY ?? 0;
    const secondX = second.locationX ?? second.pageX ?? 0;
    const secondY = second.locationY ?? second.pageY ?? 0;
    return Math.max(1, Math.hypot(secondX - firstX, secondY - firstY));
  };
  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_event, gestureState) => active && (gestureState.numberActiveTouches >= 2 || (zoomedRef.current && gestureState.numberActiveTouches <= 1 && (Math.abs(gestureState.dx) > 2 || Math.abs(gestureState.dy) > 2))),
    onPanResponderGrant: (event, gestureState) => {
      cancelAnimation(scale);
      cancelAnimation(translateX);
      cancelAnimation(translateY);
      startScale.value = scale.value;
      startTranslateX.value = translateX.value;
      startTranslateY.value = translateY.value;
      const touches = readTouches(event);
      pinchActive.current = gestureState.numberActiveTouches >= 2 && touches.length >= 2;
      panActive.current = !pinchActive.current && zoomedRef.current;
      if (pinchActive.current) {
        const first = touches[0]!;
        const second = touches[1]!;
        pinchStartDistance.current = distanceBetween(first, second);
        startFocalX.value = ((first.locationX ?? first.pageX ?? width / 2) + (second.locationX ?? second.pageX ?? width / 2)) / 2;
        startFocalY.value = ((first.locationY ?? first.pageY ?? height / 2) + (second.locationY ?? second.pageY ?? height / 2)) / 2;
        notifyZoom(true);
      }
    },
    onPanResponderMove: (event, gestureState) => {
      const touches = readTouches(event);
      if (touches.length >= 2) {
        if (!pinchActive.current) {
          pinchActive.current = true;
          panActive.current = false;
          startScale.value = scale.value;
          startTranslateX.value = translateX.value;
          startTranslateY.value = translateY.value;
          pinchStartDistance.current = distanceBetween(touches[0]!, touches[1]!);
          startFocalX.value = ((touches[0]!.locationX ?? touches[0]!.pageX ?? width / 2) + (touches[1]!.locationX ?? touches[1]!.pageX ?? width / 2)) / 2;
          startFocalY.value = ((touches[0]!.locationY ?? touches[0]!.pageY ?? height / 2) + (touches[1]!.locationY ?? touches[1]!.pageY ?? height / 2)) / 2;
          notifyZoom(true);
        }
        const first = touches[0]!;
        const second = touches[1]!;
        const focalX = ((first.locationX ?? first.pageX ?? width / 2) + (second.locationX ?? second.pageX ?? width / 2)) / 2;
        const focalY = ((first.locationY ?? first.pageY ?? height / 2) + (second.locationY ?? second.pageY ?? height / 2)) / 2;
        const nextScale = Math.max(1, Math.min(4, startScale.value * distanceBetween(first, second) / Math.max(1, pinchStartDistance.current)));
        const baseScale = Math.max(1, startScale.value);
        const contentX = (startFocalX.value - width / 2 - startTranslateX.value) / baseScale;
        const contentY = (startFocalY.value - height / 2 - startTranslateY.value) / baseScale;
        scale.value = nextScale;
        translateX.value = clamp(focalX - width / 2 - contentX * nextScale, boundX(nextScale));
        translateY.value = clamp(focalY - height / 2 - contentY * nextScale, boundY(nextScale));
        return;
      }
      if (zoomedRef.current && (panActive.current || gestureState.numberActiveTouches <= 1)) {
        panActive.current = true;
        translateX.value = clamp(startTranslateX.value + gestureState.dx, boundX(scale.value));
        translateY.value = clamp(startTranslateY.value + gestureState.dy, boundY(scale.value));
      }
    },
    onPanResponderRelease: (_event, gestureState) => {
      const wasPinching = pinchActive.current;
      pinchActive.current = false;
      panActive.current = false;
      if (scale.value < 1.03) {
        scale.value = withSpring(1);
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        notifyZoom(false);
        return;
      }
      const maxX = boundX(scale.value);
      const maxY = boundY(scale.value);
      const velocityX = !wasPinching && Number.isFinite(gestureState.vx) ? gestureState.vx * 1000 : 0;
      const velocityY = !wasPinching && Number.isFinite(gestureState.vy) ? gestureState.vy * 1000 : 0;
      if (maxX > 0 && Math.abs(velocityX) > 40) translateX.value = withDecay({ velocity: velocityX, deceleration: 0.994, clamp: [-maxX, maxX] });
      else translateX.value = withSpring(clamp(translateX.value, maxX));
      if (maxY > 0 && Math.abs(velocityY) > 40) translateY.value = withDecay({ velocity: velocityY, deceleration: 0.994, clamp: [-maxY, maxY] });
      else translateY.value = withSpring(clamp(translateY.value, maxY));
    },
    onPanResponderTerminate: () => {
      pinchActive.current = false;
      panActive.current = false;
      if (!zoomedRef.current) return;
      translateX.value = withSpring(clamp(translateX.value, boundX(scale.value)));
      translateY.value = withSpring(clamp(translateY.value, boundY(scale.value)));
    },
    onPanResponderTerminationRequest: () => false,
  }), [active, width, height, scale, startScale, startTranslateX, startTranslateY, translateX, translateY]);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }, { translateY: translateY.value }, { scale: scale.value }] }));
  return <Animated.View {...panResponder.panHandlers} style={[{ width, height, alignItems: 'center', justifyContent: 'center' }, animatedStyle]}>{children}</Animated.View>;
}

function ComicEpubReader({ book, back: navigateBack, onProgress, onSetCover, chapters = [], onSelectChapter, initialPosition }: { book: StoredBook; back: () => void; onProgress?: (progress: number, location: string) => void | Promise<void>; onSetCover?: (uri: string) => void; chapters?: StoredChapter[]; onSelectChapter?: (chapter: StoredChapter, position?: 'start' | 'end') => void | Promise<void>; initialPosition?: 'start' | 'end' }) {
  const { tokens, isDark: appIsDark } = useTheme();
  const [comic, setComic] = useState<EpubComic>(); const [error, setError] = useState(''); const [menu, setMenu] = useState(false); const [chapterDirectory, setChapterDirectory] = useState(false); const [settings, setSettings] = useState(false);
  const [readingDirection, setReadingDirection] = useState<'ltr' | 'rtl' | 'vertical'>('ltr'); const [tapZones, setTapZones] = useState(true); const [smooth, setSmooth] = useState(true); const [dark, setDark] = useState(true); const [crop, setCrop] = useState(false); const [notch, setNotch] = useState(false); const [volume, setVolume] = useState(true); const [pageMode, setPageMode] = useState<'single' | 'double'>('single'); const [doubleOrder, setDoubleOrder] = useState<'natural' | 'reverse'>('natural');
  const [currentPage, setCurrentPage] = useState(0); const [sliderPage, setSliderPage] = useState<number>(); const currentPageRef = useRef(0); const committedPageRef = useRef(0); const { width, height } = useWindowDimensions(); const insets = useSafeAreaInsets(); const [preferencesReady, setPreferencesReady] = useState(false); const [bookOverrides, setBookOverrides] = useState<Partial<import('../../preferences').ReaderPreferences>>({}); const preferenceSnapshot = useRef<import('../../preferences').ReaderPreferences>({}); const preferredDirection = useRef<'ltr' | 'rtl' | 'vertical'>(); const sessionId = useRef('reader-' + Date.now().toString()).current; const readingSessionRef = useRef<{ id: number; lastPage: number }>(); const listRef = useRef<FlatList<ReaderDisplayPage[]>>(null); const pageLoaderRef = useRef<PageLoader>(); const [pageLoader, setPageLoader] = useState<PageLoader>(); const readerControllerRef = useRef<ReaderController>(); const touchStart = useRef({ x: 0, y: 0, time: 0 }); const touchLatest = useRef({ x: 0, y: 0 }); const lastProgress = useRef({ progress: book.progress, location: book.currentLocation || 'epub:0' });
  const zoomedRef = useRef(false);
  const [zoomed, setZoomed] = useState(false);
  const multiTouch = useRef(false);
  const lastHandledTap = useRef({ coordinate: Number.NaN, time: 0 });
  const chapterTransitionRef = useRef<{ targetId: number; delta: -1 | 1 }>();
  useEffect(() => { StatusBar.setHidden(true, 'none'); return () => { StatusBar.setHidden(false, 'none'); }; }, []);
  useEffect(() => {
    if (!comic) return;
    const sheetOpen = chapterDirectory || settings;
    const background = sheetOpen ? tokens.colors.surface : dark ? '#09090B' : '#FFFFFF';
    setNavigationBarAppearance(background, sheetOpen ? !appIsDark : !dark);
    return () => setNavigationBarAppearance(tokens.colors.background, !appIsDark);
  }, [appIsDark, chapterDirectory, comic, dark, settings, tokens.colors.background, tokens.colors.surface]);
  useEffect(() => {
    let foreground = AppState.currentState === 'active';
    const heartbeat = setInterval(() => {
      const session = readingSessionRef.current;
      if (session && foreground) void statsRepository.pauseSession(session.id).catch(() => undefined);
    }, 15000);
    const subscription = AppState.addEventListener('change', state => {
      const session = readingSessionRef.current;
      const nextForeground = state === 'active';
      if (session && foreground !== nextForeground) void (nextForeground ? statsRepository.resumeSession(session.id) : statsRepository.pauseSession(session.id)).catch(() => undefined);
      foreground = nextForeground;
    });
    return () => { clearInterval(heartbeat); subscription.remove(); };
  }, []);
  useEffect(() => {
    let active = true;
    Promise.all([readerSettingsRepository.loadGlobal(), readerSettingsRepository.loadBookOverrides(book.id)]).then(([globalPreferences, overrides]) => {
      if (!active) return;
      const preferences = { ...globalPreferences, ...overrides };
      preferenceSnapshot.current = preferences;
      setBookOverrides(overrides);
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
  useEffect(() => {
    if (!preferencesReady) return;
    const next = { readingDirection, tapZones, smooth, dark, crop, notch, volume, pageMode, doubleOrder };
    const previous = preferenceSnapshot.current;
    (Object.keys(next) as Array<keyof typeof next>).forEach(key => {
      if (JSON.stringify(previous[key]) === JSON.stringify(next[key])) return;
      preferenceSnapshot.current = { ...preferenceSnapshot.current, [key]: next[key] };
      setBookOverrides(current => ({ ...current, [key]: next[key] }));
      void readerSettingsRepository.saveBookOverride(book.id, key, next[key]).catch(console.warn);
    });
  }, [preferencesReady, readingDirection, tapZones, smooth, dark, crop, notch, volume, pageMode, doubleOrder, book.id]);
  useEffect(() => {
    if (!preferencesReady) return;
    setVolumeKeyPagingEnabled(volume);
    return () => setVolumeKeyPagingEnabled(false);
  }, [preferencesReady, volume]);
  const resetBookPreferences = async () => {
    await readerSettingsRepository.resetBookOverrides(book.id);
    const globalPreferences = await readerSettingsRepository.loadGlobal();
    preferenceSnapshot.current = globalPreferences;
    setBookOverrides({});
    if (globalPreferences.readingDirection) { preferredDirection.current = globalPreferences.readingDirection; setReadingDirection(globalPreferences.readingDirection); }
    if (globalPreferences.tapZones !== undefined) setTapZones(globalPreferences.tapZones);
    if (globalPreferences.smooth !== undefined) setSmooth(globalPreferences.smooth);
    if (globalPreferences.dark !== undefined) setDark(globalPreferences.dark);
    if (globalPreferences.crop !== undefined) setCrop(globalPreferences.crop);
    if (globalPreferences.notch !== undefined) setNotch(globalPreferences.notch);
    setVolume(globalPreferences.volume ?? true);
    if (globalPreferences.pageMode) setPageMode(globalPreferences.pageMode === 'double' ? 'double' : 'single');
    if (globalPreferences.doubleOrder) setDoubleOrder(globalPreferences.doubleOrder);
  };
  useEffect(() => {
    let active = true;
    setComic(undefined); setError(''); setCurrentPage(0);
    lastProgress.current = { progress: book.progress, location: book.currentLocation || book.format + ':0' };
    const openContentChapter = (target: StoredBook, chapterSessionId: string) => contentLoader.open(contentLocatorFromBook(target), { sessionId: chapterSessionId, targetWidth: width * 2 });
    const controller = new ReaderController({
      targetWidth: width * 2,
      prefetchDistance: 6,
      concurrency: 2,
      openChapter: openContentChapter,
      takePreloadedChapter: target => chapterPrefetcher.take(target),
    });
    readerControllerRef.current = controller;
    controller.open(book, 0).then(state => {
      if (!active) { void controller.close().catch(console.warn); return; }
      const value = state.contentSession.comic;
      const restoredLocation = book.currentLocation?.match(new RegExp('^' + book.format + ':(\\d+)$'));
      const restoredPage = initialPosition === 'start'
        ? 0
        : initialPosition === 'end'
          ? value.pages.length - 1
          : Math.max(0, Math.min(value.pages.length - 1, restoredLocation ? Number(restoredLocation[1]) : Math.round(book.progress * (value.pages.length - 1))));
      pageLoaderRef.current = state.pageLoader; setPageLoader(state.pageLoader);
      setComic({ ...value, author: value.author || book.author || '未知作者' }); setReadingDirection(preferredDirection.current ?? value.direction); currentPageRef.current = restoredPage; committedPageRef.current = restoredPage; setCurrentPage(restoredPage); void libraryRepository.recordContentInfo(book.id, value.pages.length).catch(console.warn);
      void persistProgress(restoredPage / Math.max(1, value.pages.length - 1), book.format + ':' + restoredPage);
      const seriesId = 'seriesId' in book ? Number((book as StoredChapter).seriesId) : 0;
      if (seriesId > 0) void statsRepository.startSession({ bookId: book.id, seriesId }).then(id => {
        if (!active) return statsRepository.finishSession(id);
        readingSessionRef.current = { id, lastPage: restoredPage };
        return statsRepository.recordPageViewed({ sessionId: id, bookId: book.id, pageIndex: restoredPage });
      }).catch(() => undefined);
      void controller.goTo(restoredPage).catch(() => undefined);
    }).catch(reason => { void libraryRepository.recordContentInfo(book.id, 0, 'error').catch(console.warn); if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => {
      active = false;
      const readingSession = readingSessionRef.current;
      readingSessionRef.current = undefined;
      if (readingSession) void statsRepository.finishSession(readingSession.id).catch(() => undefined);
      if (readerControllerRef.current === controller) { readerControllerRef.current = undefined; pageLoaderRef.current = undefined; setPageLoader(undefined); }
      void controller.close().catch(console.warn);
    };
  }, [book, initialPosition, width, preferencesReady]);
  useEffect(() => {
    // During a native smooth scroll currentPage is only a visual preview. Do
    // not start decoding or prefetching from that preview; wait for the
    // settled page so JS work cannot compete with the scroll animation.
    if (!comic || currentPage !== committedPageRef.current) return;
    const loader = pageLoaderRef.current;
    void loader?.load(currentPage).catch(() => undefined);
    const task = InteractionManager.runAfterInteractions(() => {
      if (pageLoaderRef.current === loader && committedPageRef.current === currentPage) loader?.prefetchAround(currentPage);
    });
    return () => task.cancel();
  }, [comic, currentPage]);
  useEffect(() => {
    if (!comic || !chapters.length || currentPage !== committedPageRef.current) return;
    // Start warming the neighboring chapter while there is still enough time
    // for SAF/ZIP work to finish before the user reaches the edge.
    const threshold = Math.min(20, Math.max(8, Math.ceil(comic.pages.length * 0.12)));
    const candidates: Array<{ chapter: StoredChapter | undefined; edge: PrefetchEdge }> = [];
    if (currentPage <= threshold) candidates.push({ chapter: getAdjacentChapter(chapters, book.id, -1), edge: 'end' });
    if (currentPage >= comic.pages.length - 1 - threshold) candidates.push({ chapter: getAdjacentChapter(chapters, book.id, 1), edge: 'start' });
    let active = true;
    const task = InteractionManager.runAfterInteractions(() => {
      void Promise.all(candidates.map(async ({ chapter, edge }) => {
        if (!chapter || !active) return;
        const local = await libraryRepository.ensureChapterLocal(chapter);
        if (!active) return;
        await chapterPrefetcher.prefetch(local, edge, width * 2, (target, sessionId) => contentLoader.open(contentLocatorFromBook(target), { sessionId, targetWidth: width * 2 }));
      })).catch(() => undefined);
    });
    return () => { active = false; task.cancel(); };
  }, [book.id, chapters, comic, currentPage, width]);
  useEffect(() => {
    if (!comic) return;
    // This sync is for a new chapter/layout only. Including currentPage here
    // interrupts FlatList's native smooth-scroll animation after every tap.
    const timer = setTimeout(() => listRef.current?.scrollToIndex({ index: toGroup(currentPageRef.current), animated: false }), 0);
    return () => clearTimeout(timer);
  }, [comic, pageMode, doubleOrder, readingDirection, width, height]);
  const persistProgress = (progress: number, location: string) => { lastProgress.current = { progress, location }; const result = onProgress ? onProgress(progress, location) : undefined; return Promise.resolve(result).catch(console.warn); };
  const leaving = useRef(false);
  const leaveReader = async () => { if (leaving.current) return; leaving.current = true; navigateBack(); await persistProgress(lastProgress.current.progress, lastProgress.current.location); };
  const back = leaveReader;
  const leaveReaderRef = useRef<() => Promise<void>>();
  leaveReaderRef.current = leaveReader;
  useEffect(() => { const subscription = BackHandler.addEventListener('hardwareBackPress', () => { void leaveReaderRef.current?.(); return true; }); return () => subscription.remove(); }, []);
  const pageChanged = (page: number) => { if (!comic) return; const safe = Math.max(0, Math.min(comic.pages.length - 1, page)); currentPageRef.current = safe; committedPageRef.current = safe; setSliderPage(undefined); setCurrentPage(safe); const readingSession = readingSessionRef.current; if (readingSession && readingSession.lastPage !== safe) { readingSession.lastPage = safe; void statsRepository.recordPageViewed({ sessionId: readingSession.id, bookId: book.id, pageIndex: safe }).catch(() => undefined); } void persistProgress(safe / Math.max(1, comic.pages.length - 1), `${book.format}:${safe}`); };
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
  const changeChapter = (delta: -1 | 1) => {
    const ordered = orderedChapters(chapters);
    const byId = ordered.findIndex(chapter => chapter.id === book.id);
    const storedChapterNumber = 'chapterNumber' in book ? book.chapterNumber : undefined;
    const currentIndex = byId >= 0 ? byId : ordered.findIndex(chapter => chapter.originalName === book.originalName || (storedChapterNumber !== undefined && chapter.chapterNumber === storedChapterNumber));
    const target = currentIndex >= 0 ? ordered[currentIndex + delta] : getAdjacentChapter(chapters, book.id, delta);
    // A single edge gesture can be observed by FlatList, the touch handlers,
    // and the outer PanResponder. Keep one transition lock for the lifetime
    // of the current chapter so a late callback cannot immediately navigate
    // back to the other adjacent chapter.
    if (!target || !onSelectChapter || chapterTransitionRef.current) return;
    chapterTransitionRef.current = { targetId: target.id, delta };
    try {
      void Promise.resolve(onSelectChapter(target, delta === 1 ? 'start' : 'end')).catch(reason => {
        if (chapterTransitionRef.current?.targetId === target.id) chapterTransitionRef.current = undefined;
        console.warn(reason);
      });
    } catch (reason) {
      chapterTransitionRef.current = undefined;
      console.warn(reason);
    }
  };
  const goTo = (actual: number, animated = smooth) => {
    if (!comic) return;
    if (actual >= comic.pages.length) return changeChapter(1);
    if (actual < 0) return changeChapter(-1);
    const safe = Math.max(0, Math.min(comic.pages.length - 1, actual));
    const targetGroup = toGroup(safe);
    const currentGroup = toGroup(currentPageRef.current);
    // Queue the target at high priority before the native animation reveals it.
    // The load is intentionally not awaited: FlatList should start moving
    // immediately, while PageLoader prevents duplicate render work.
    void pageLoaderRef.current?.load(safe).catch(() => undefined);
    if (!animated || targetGroup === currentGroup) {
      pageChanged(safe);
      return;
    }
    listRef.current?.scrollToIndex({ index: targetGroup, animated: true });
    if (animated) {
      currentPageRef.current = safe;
      // Let the native scroll finish before scheduling the surrounding pages.
      // The target itself is already queued at priority 0 above.
      const loader = pageLoaderRef.current;
      InteractionManager.runAfterInteractions(() => {
        if (pageLoaderRef.current === loader && committedPageRef.current === safe) loader?.prefetchAround(safe);
      });
    }
  };
  const handleTap = (coordinate: number) => { const now = Date.now(); if (Number.isFinite(coordinate) && now - lastHandledTap.current.time < 80 && Math.abs(coordinate - lastHandledTap.current.coordinate) < 12) return; if (Number.isFinite(coordinate)) lastHandledTap.current = { coordinate, time: now }; if (zoomedRef.current || !comic) return; if (menu) return setMenu(false); const axisLength = readingDirection === 'vertical' ? height : width; if (!Number.isFinite(coordinate)) return setMenu(!menu); const normalizedCoordinate = coordinate > axisLength * 1.5 ? coordinate / PixelRatio.get() : coordinate; if (!tapZones) return setMenu(!menu); if (normalizedCoordinate >= axisLength / 3 && normalizedCoordinate <= axisLength * 2 / 3) return setMenu(!menu); const next = readingDirection === 'vertical' ? normalizedCoordinate > axisLength * 2 / 3 : readingDirection === 'rtl' ? normalizedCoordinate < axisLength / 3 : normalizedCoordinate > axisLength * 2 / 3; const actualPage = currentPageRef.current; if (next && actualPage >= comic.pages.length - 1) return changeChapter(1); if (!next && actualPage <= 0) return changeChapter(-1); goTo(actualPage + (next ? 1 : -1)); };
  const handleTouchRelease = () => {
    const start = touchStart.current;
    const latest = touchLatest.current;
    const wasMultiTouch = multiTouch.current;
    touchStart.current = { x: 0, y: 0, time: 0 };
    touchLatest.current = { x: 0, y: 0 };
    multiTouch.current = false;
    if (wasMultiTouch || !start.time || zoomedRef.current || !comic) return;
    const movement = readingDirection === 'vertical' ? latest.y - start.y : latest.x - start.x;
    // FlatList owns ordinary page drags. Only handle a swipe at a chapter
    // boundary because there is no neighboring item for FlatList to reveal.
    if (Math.abs(movement) >= 24) handleBoundarySwipe(movement);
    else handleTap(readingDirection === 'vertical' ? start.y : start.x);
  };
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
  const handleBoundarySwipe = (movement: number) => {
    if (!comic || zoomedRef.current) return;
    const delta = chapterBoundaryDelta(movement, readingDirection, currentPageRef.current, comic.pages.length);
    if (delta !== 0) changeChapter(delta);
  };
  const boundaryPanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponderCapture: (_event, gestureState) => {
      if (!comic || zoomedRef.current) return false;
      const movement = readingDirection === 'vertical' ? gestureState.dy : gestureState.dx;
      if (Math.abs(movement) < 24) return false;
      return chapterBoundaryDelta(movement, readingDirection, currentPageRef.current, comic.pages.length) !== 0;
    },
    onMoveShouldSetPanResponder: (_event, gestureState) => {
      if (!comic || zoomedRef.current) return false;
      const movement = readingDirection === 'vertical' ? gestureState.dy : gestureState.dx;
      if (Math.abs(movement) < 24) return false;
      return chapterBoundaryDelta(movement, readingDirection, currentPageRef.current, comic.pages.length) !== 0;
    },
    onPanResponderRelease: (_event, gestureState) => {
      handleBoundarySwipe(readingDirection === 'vertical' ? gestureState.dy : gestureState.dx);
    },
    onPanResponderTerminate: () => undefined,
  }), [comic, handleBoundarySwipe, readingDirection]);
  const renderPageGroup = ({ item, index: groupIndex }: { item: ReaderDisplayPage[]; index: number }) => {
    const isVertical = readingDirection === 'vertical';
    const activeGroup = toGroup(currentPageRef.current);
    const ratios = item.map(display => pageRatios[display.page.imageUri] ?? 0.68);
    const totalRatio = isVertical ? ratios.reduce((sum, ratio) => sum + 1 / Math.max(0.1, ratio), 0) : ratios.reduce((sum, ratio) => sum + ratio, 0);
    const scale = isVertical ? Math.min(width, height / Math.max(0.1, totalRatio)) : Math.min(height, width / Math.max(0.1, totalRatio));
    const sizes = ratios.map(ratio => isVertical ? { width: scale, height: scale / Math.max(0.1, ratio) } : { width: scale * ratio, height: scale });
    const contentWidth = isVertical ? scale : sizes.reduce((sum, size) => sum + size.width, 0);
    const contentHeight = isVertical ? sizes.reduce((sum, size) => sum + size.height, 0) : scale;
    return <View style={{ width, height, alignItems: 'center', justifyContent: 'center', padding: 0, margin: 0 }}><View style={{ width: contentWidth, height: contentHeight, flexDirection: isVertical ? 'column' : 'row', alignItems: 'center', justifyContent: 'center', padding: 0, margin: 0 }}>{item.map((display, pageIndex) => { const size = sizes[pageIndex]!; return <View key={display.page.imageUri} style={{ width: size.width, height: size.height, margin: 0, padding: 0, overflow: 'hidden' }}><ZoomablePage width={size.width} height={size.height} active={groupIndex === activeGroup} tapEnabled={false} tapAxis={isVertical ? 'vertical' : 'horizontal'} onZoomChange={value => { if (groupIndex === activeGroup) { zoomedRef.current = value; setZoomed(value); } }} onTap={handleTap}><EpubPageView book={book} page={display.page} width={size.width} height={size.height} crop={crop} dark={dark} sessionId={sessionId} pageLoader={pageLoader} onAspectRatio={reportPageAspectRatio} /></ZoomablePage></View>; })}</View></View>;
  };
  if (error) return <SafeAreaView style={styles.documentReader}><View style={styles.documentTop}><IconButton name="chevron-back" onPress={back} dark /><Text style={styles.readerBook}>{book.title}</Text></View><View style={styles.readerMessage}><Ionicons name="warning-outline" size={38} color="#E1915F" /><Text style={styles.errorText}>{error}</Text></View></SafeAreaView>;
  if (!comic) return <SafeAreaView style={styles.documentReader}><View style={styles.readerMessage}><ActivityIndicator color="#8B70F7" size="large" /><Text style={styles.readerChapter}>正在建立 {book.format.toUpperCase()} 页表…</Text></View></SafeAreaView>;
    return <View style={[styles.comicReader, { backgroundColor: dark ? '#09090B' : '#FFFFFF' }]}>
      <StatusBar hidden barStyle={menuDark ? 'light-content' : 'dark-content'} />
      <View style={{ flex: 1 }} {...boundaryPanResponder.panHandlers}>
      <FlatList
        ref={listRef}
        data={displayGroups}
        extraData={`${dark}:${menuDark}:${crop}:${pageMode}:${readingDirection}:${Object.keys(pageRatios).length}:${zoomed}`}
        scrollEnabled={!zoomed}
        horizontal={readingDirection !== 'vertical'}
        pagingEnabled
        initialScrollIndex={toGroup(currentPage)}
        getItemLayout={(_, index) => ({ length: readingDirection === 'vertical' ? height : width, offset: (readingDirection === 'vertical' ? height : width) * index, index })}
        windowSize={5}
        initialNumToRender={3}
        maxToRenderPerBatch={4}
        updateCellsBatchingPeriod={16}
        removeClippedSubviews={false}
        keyExtractor={group => group.map(item => item.page.imageUri).join('|')}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        renderItem={renderPageGroup}
        onScroll={menu ? event => {
          const axis = readingDirection === 'vertical' ? height : width;
          const offset = readingDirection === 'vertical' ? event.nativeEvent.contentOffset.y : event.nativeEvent.contentOffset.x;
          const groupIndex = Math.max(0, Math.min(displayGroups.length - 1, Math.round(offset / Math.max(1, axis))));
          const firstDisplayIndex = groupIndex * (pageMode === 'single' ? 1 : 2);
          // Update the menu while the native pager is moving, but do not
          // persist progress or start decoding from this transient preview.
          // The settled page is committed in onMomentumScrollEnd.
          const previewPage = displayPages[firstDisplayIndex] ? toActual(firstDisplayIndex) : undefined;
          if (previewPage !== undefined && previewPage !== currentPageRef.current) {
            currentPageRef.current = previewPage;
            // Only render a preview while the menu is visible. A closed-menu
            // swipe stays on the native pager path and avoids JS interruptions.
            if (menu) setCurrentPage(previewPage);
          }
        } : undefined}
        scrollEventThrottle={32}
        onTouchStart={event => {
          const touches = (event.nativeEvent as unknown as { touches?: unknown[] }).touches;
          if (touches && touches.length > 1) multiTouch.current = true;
          else if (!multiTouch.current) {
            const x = event.nativeEvent.pageX ?? event.nativeEvent.locationX;
            const y = event.nativeEvent.pageY ?? event.nativeEvent.locationY;
            touchStart.current = { x, y, time: Date.now() };
            touchLatest.current = { x, y };
          }
        }}
        onTouchMove={event => {
          const touches = (event.nativeEvent as unknown as { touches?: unknown[] }).touches;
          if (touches && touches.length > 1) multiTouch.current = true;
          else if (!multiTouch.current) {
            const x = event.nativeEvent.pageX ?? event.nativeEvent.locationX;
            const y = event.nativeEvent.pageY ?? event.nativeEvent.locationY;
            touchLatest.current = { x, y };
          }
        }}
        onTouchEnd={handleTouchRelease}
        onMomentumScrollEnd={event => {
          if (zoomedRef.current) return;
          const offset = readingDirection === 'vertical' ? event.nativeEvent.contentOffset.y : event.nativeEvent.contentOffset.x;
          const groupIndex = Math.round(offset / (readingDirection === 'vertical' ? height : width));
          const firstDisplayIndex = groupIndex * (pageMode === 'single' ? 1 : 2);
          if (displayPages[firstDisplayIndex]) pageChanged(toActual(firstDisplayIndex));
        }}
      />
      {menu && <>
        <View style={[styles.readerTop, styles.readerMenuSurface, styles.readerOverlay, { paddingTop: notch ? Math.min(insets.top, 12) : 0, height: notch ? 76 : 66, backgroundColor: menuBackground }]}>
          <IconButton name="chevron-back" onPress={back} color={menuPrimary} />
          <View style={styles.readerTopTitle}><Text numberOfLines={1} style={[styles.readerBook, { color: menuPrimary }]}>{comic.title}</Text><Text style={[styles.readerChapter, { color: menuMuted }]}>{comic.author} · {readingDirection === 'rtl' ? '从右到左' : readingDirection === 'vertical' ? '从上到下' : '从左到右'}</Text></View>
        </View>
        <View style={[styles.epubBottom, styles.readerMenuSurface, styles.readerOverlay, { backgroundColor: menuBackground }]}>
          <Text numberOfLines={1} style={[styles.chapterLabel, { color: menuMuted }]}>{comic.title} · 整卷</Text>
          <Slider style={styles.readerSlider} minimumValue={0} maximumValue={comic.pages.length - 1} step={1} value={sliderPage ?? currentPage} minimumTrackTintColor="#8B70F7" maximumTrackTintColor={menuTrack} thumbTintColor={menuPrimary} onValueChange={value => setSliderPage(Math.round(value))} onSlidingComplete={value => { const target = Math.round(value); setSliderPage(target); goTo(target); }} />
          <View style={styles.quickActions}><PressableScale haptic="selection" style={styles.quickAction} accessibilityRole="button" accessibilityLabel="章节目录" onPress={() => chapters.length ? setChapterDirectory(true) : navigateBack()}><Ionicons name="list-outline" size={21} color={menuPrimary} /></PressableScale><Text numberOfLines={1} style={[styles.epubCounter, { flex: 1, minWidth: 120, color: menuPrimary, fontSize: 14, lineHeight: 20, fontWeight: '800', textAlign: 'center', paddingHorizontal: 8 }]}>{`第 ${currentPage + 1} / ${comic.pages.length} 页`}</Text><PressableScale haptic="selection" style={styles.quickAction} accessibilityRole="button" accessibilityLabel="详细设置" onPress={() => setSettings(true)}><Ionicons name="options-outline" size={21} color={menuPrimary} /></PressableScale></View>
        </View>
      </>}
    <ChapterDirectorySheet visible={chapterDirectory} book={book} chapters={chapters} onClose={() => setChapterDirectory(false)} onSelectChapter={onSelectChapter} />
    {settings && Object.keys(bookOverrides).length > 0 && <PressableScale haptic="light" accessibilityRole="button" accessibilityLabel="恢复全局默认" onPress={() => { void resetBookPreferences(); }} style={[styles.readerResetFloating, { top: Math.max(insets.top + 70, height * 0.1 + 68) }, settingsDark && uiStyles.readerResetButtonDark]}><Text style={[styles.readerResetText, settingsDark && uiStyles.readerResetTextDark]}>恢复全局默认</Text></PressableScale>}
    <BottomSheet visible={settings} onClose={() => setSettings(false)} maxHeight="90%"><View style={[pageLayoutStyles.readerSettingsContent, settingsDark && styles.sheetDark]}><ScrollView contentInsetAdjustmentBehavior="automatic" style={{ minHeight: 0, marginHorizontal: -tokens.spacing.lg }} contentContainerStyle={[pageLayoutStyles.readerSettingsScrollContent, { paddingHorizontal: tokens.spacing.lg }]} scrollIndicatorInsets={{ right: 0 }}><View style={styles.sheetHeading}><Text style={[styles.sheetTitle, settingsDark && styles.textPrimaryDark]}>详细阅读设置</Text><PressableScale haptic="light" accessibilityRole="button" accessibilityLabel="完成" onPress={() => setSettings(false)} style={{ minWidth: 44, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' }}><Text style={[styles.done, settingsDark && uiStyles.doneDark]}>完成</Text></PressableScale></View>{onSetCover && <PressableScale haptic="light" style={[styles.coverAction, settingsDark && uiStyles.coverActionDark]} onPress={() => { pageLoaderRef.current?.load(currentPage).then(result => { onSetCover(result.uri); setSettings(false); }).catch(console.warn); }}><Ionicons name="image-outline" size={20} color={settingsDark ? '#C8B9FF' : '#7257E7'} /><Text style={[styles.coverActionText, settingsDark && uiStyles.coverActionTextDark]}>将当前第 {currentPage + 1} 页设为作品封面</Text></PressableScale>}<Text style={[styles.settingSection, settingsDark && uiStyles.settingSectionDark]}>阅读方向</Text><OptionSet dark={settingsDark} values={['从左到右', '从右到左', '从上到下']} value={readingDirection === 'rtl' ? '从右到左' : readingDirection === 'vertical' ? '从上到下' : '从左到右'} onChange={changeDirection} /><Text style={[styles.modalHelp, settingsDark && styles.textMutedDark]}>屏幕点击区域功能示意</Text><View style={[styles.tapPreview, { marginTop: 8 }]}><View style={[styles.tapPreviewSide, settingsDark && uiStyles.tapPreviewSideDark]}><Text style={[styles.tapPreviewText, settingsDark && uiStyles.tapPreviewTextDark]}>{readingDirection === 'rtl' ? '下一页' : '上一页'}</Text></View><View style={[styles.tapPreviewCenter, settingsDark && uiStyles.tapPreviewCenterDark]}><Text style={[styles.tapPreviewText, settingsDark && uiStyles.tapPreviewTextDark]}>菜单</Text></View><View style={[styles.tapPreviewSide, settingsDark && uiStyles.tapPreviewSideDark]}><Text style={[styles.tapPreviewText, settingsDark && uiStyles.tapPreviewTextDark]}>{readingDirection === 'rtl' ? '上一页' : '下一页'}</Text></View></View><Text style={[styles.settingSection, settingsDark && uiStyles.settingSectionDark]}>翻页效果</Text><OptionSet dark={settingsDark} values={['直接翻页', '平滑翻页']} value={smooth ? '平滑翻页' : '直接翻页'} onChange={value => setSmooth(value === '平滑翻页')} /><Text style={[styles.settingSection, settingsDark && uiStyles.settingSectionDark]}>页面布局</Text><OptionSet dark={settingsDark} values={['单页', '双页']} value={pageMode === 'double' ? '双页' : '单页'} onChange={value => setPageMode(value === '双页' ? 'double' : 'single')} />{pageMode !== 'single' && <><Text style={[styles.settingSection, settingsDark && uiStyles.settingSectionDark]}>双页顺序</Text><OptionSet dark={settingsDark} values={['奇数在前', '偶数在前']} value={doubleOrder === 'reverse' ? '偶数在前' : '奇数在前'} onChange={value => setDoubleOrder(value === '偶数在前' ? 'reverse' : 'natural')} /></>}<View style={[styles.toggleRow, settingsDark && uiStyles.toggleRowDark]}><Text style={[styles.toggleText, settingsDark && uiStyles.toggleTextDark]}>自动裁切白边</Text><Switch value={crop} onValueChange={setCrop} trackColor={{ true: '#765BE8' }} /></View><View style={[styles.toggleRow, settingsDark && uiStyles.toggleRowDark]}><Text style={[styles.toggleText, settingsDark && uiStyles.toggleTextDark]}>点击区域翻页</Text><Switch value={tapZones} onValueChange={setTapZones} trackColor={{ true: '#765BE8' }} /></View><View style={[styles.toggleRow, settingsDark && uiStyles.toggleRowDark]}><Text style={[styles.toggleText, settingsDark && uiStyles.toggleTextDark]}>黑色阅读背景</Text><Switch value={dark} onValueChange={setDark} trackColor={{ true: '#765BE8' }} /></View><View style={[styles.toggleRow, settingsDark && uiStyles.toggleRowDark]}><Text style={[styles.toggleText, settingsDark && uiStyles.toggleTextDark]}>刘海区域显示内容</Text><Switch value={notch} onValueChange={setNotch} trackColor={{ true: '#765BE8' }} /></View><View style={[styles.toggleRow, settingsDark && uiStyles.toggleRowDark]}><Text style={[styles.toggleText, settingsDark && uiStyles.toggleTextDark]}>音量键翻页</Text><Switch accessibilityLabel="音量键翻页" value={volume} onValueChange={setVolume} trackColor={{ true: '#765BE8' }} /></View></ScrollView></View></BottomSheet>
      </View>
  </View>;
}


function DocumentReader({ book, back, onProgress, onSetCover, chapters, onSelectChapter, initialPosition }: { book: StoredBook; back: () => void; onProgress?: (progress: number, location: string) => void | Promise<void>; onSetCover?: (uri: string) => void; chapters?: StoredChapter[]; onSelectChapter?: (chapter: StoredChapter, position?: 'start' | 'end') => void | Promise<void>; initialPosition?: 'start' | 'end' }) {
  if (book.format === 'epub' || book.format === 'mobi' || book.format === 'pdf') return <ComicEpubReader book={book} back={back} onProgress={onProgress} onSetCover={onSetCover} chapters={chapters} onSelectChapter={onSelectChapter} initialPosition={initialPosition} />;
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
