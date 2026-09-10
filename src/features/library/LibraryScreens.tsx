import { Ionicons } from '@expo/vector-icons';
import React,{ useEffect,useState } from 'react';
import { Alert,BackHandler,FlatList,SectionList,Text,View,useWindowDimensions } from 'react-native';
import { tagRepository } from '../../data/tag-repository';
import type { LibrarySeries,LibraryTag,ReadingStatsSummary,StoredChapter } from '../../domain/models';
import { BookCover } from '../../ui/components/book-cover';
import { BottomSheet } from '../../ui/components/bottom-sheet';
import { Button } from '../../ui/components/button';
import { ChapterRow } from '../../ui/components/chapter-row';
import { EmptyState } from '../../ui/components/empty-state';
import { PressableScale } from '../../ui/components/pressable-scale';
import { Screen } from '../../ui/components/screen';
import { ScreenHeader } from '../../ui/components/screen-header';
import { SectionHeader } from '../../ui/components/section-header';
import { SettingsGroup } from '../../ui/components/settings-group';
import { SettingsRow } from '../../ui/components/settings-row';
import { TagChip } from '../../ui/components/tag-chip';
import { TextField } from '../../ui/components/text-field';
import { getGridLayout } from '../../ui/layout';
import { useScreenStyles } from '../../ui/screen-styles';
import { useTheme } from '../../ui/theme';
import { IconButton,Progress,SeriesCard,SeriesProgress,compactAuthor,formatReadingDuration } from '../shared/library-ui';
import { normalizeDailyRows } from '../stats/chart-utils';

function SeriesLibrary({ series, importing, refreshLibraries, openSeries, continueSeries, openSources }: { series: LibrarySeries[]; importing: boolean; refreshLibraries: () => void; openSeries: (value: LibrarySeries) => void; continueSeries: (value: LibrarySeries) => void; openSources: () => void }) {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const { tokens } = useTheme();
  const { width } = useWindowDimensions();
  const grid = getGridLayout(width);
  const visible = series.filter(item => [item.title, item.author, item.tags.map(tag => tag.name).join(' '), item.chapterSearchText].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
  const featured = series.find(item => item.currentChapterId !== null);
  useEffect(() => { if (!searching) return; const sub = BackHandler.addEventListener('hardwareBackPress', () => { setSearching(false); setQuery(''); return true; }); return () => sub.remove(); }, [searching]);
  return <FlatList key={grid.columns} data={visible} numColumns={grid.columns} keyExtractor={item => String(item.id)} showsVerticalScrollIndicator={false}
    contentContainerStyle={{ padding: 16, paddingHorizontal: grid.pageInset }} columnWrapperStyle={{ gap: grid.gutter }}
    ListHeaderComponent={<View>
      <ScreenHeader title="我的书架" trailing={<IconButton name={searching ? 'close' : 'search'} label={searching ? '关闭搜索' : '搜索作品'} onPress={() => { setSearching(!searching); setQuery(''); }} />} />
      {searching && <TextField label="搜索作品" value={query} onChangeText={setQuery} autoFocus placeholder="作品名、作者或标签" />}
      {!searching && featured && <PressableScale accessibilityRole="button" accessibilityLabel={'继续阅读 ' + featured.title} onPress={() => continueSeries(featured)} style={{ flexDirection: 'row', alignItems: 'center', padding: 16, gap: 16, borderRadius: tokens.radius.lg, backgroundColor: tokens.colors.selectedContainer }}>
        <BookCover uri={featured.coverUri} style={{ width: 86 }} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[tokens.typography.caption, { color: tokens.colors.onSelectedContainer, marginBottom: 4 }]}>继续阅读</Text>
          <Text numberOfLines={2} style={[tokens.typography.sectionTitle, { color: tokens.colors.onSelectedContainer }]}>{featured.title}</Text>
          {!!featured.author && <Text numberOfLines={1} style={[tokens.typography.caption, { color: tokens.colors.onSelectedContainer }]}>{compactAuthor(featured.author)}</Text>}
          <SeriesProgress series={featured} inverse compact />
        </View>
      </PressableScale>}
      <SectionHeader title={searching ? '搜索结果 · ' + visible.length : '全部作品 · ' + series.length} trailing={!searching && <View style={{ flexDirection: 'row' }}>
        <IconButton name={importing ? 'sync' : 'refresh'} label="刷新漫画源" onPress={importing ? undefined : refreshLibraries} />
        <IconButton name="folder-open-outline" label="打开漫画源设置" onPress={openSources} />
      </View>} />
    </View>}
    ListEmptyComponent={series.length === 0 ? <EmptyState title="尚未设置漫画库" description="选择漫画源，每个一级子文件夹会作为一本作品，其中的文件按章节整理。" actionLabel="添加漫画源" onAction={openSources} /> : <EmptyState icon="search-outline" title="没有匹配的作品" description="试试其他作品名、作者或标签。" />}
    renderItem={({ item, index }) => <View style={{ width: grid.cardWidth }}><SeriesCard series={item} index={index} onPress={() => openSeries(item)} /></View>}
  />;
}

function SeriesDetail({ series, chapters: seriesChapters, back, openChapter, continueReading, uploadCover, onSeriesChanged }: { series: LibrarySeries; chapters: StoredChapter[]; back: () => void; openChapter: (chapter: StoredChapter) => void; continueReading: () => void; uploadCover: () => void; onSeriesChanged?: () => void }) {
  const { styles, layoutStyles } = useScreenStyles();
  const chapterIndex = series.currentChapterId === null ? -1 : Math.max(0, seriesChapters.findIndex(item => item.id === series.currentChapterId));
  const chapterProgress = series.currentChapterId === null ? 0 : (chapterIndex + 1) / Math.max(1, seriesChapters.length);
  const { isDark, tokens } = useTheme();
  const hasHistory = series.currentChapterId !== null;
  const [seriesActions, setSeriesActions] = useState(false);
  const [tagSheet, setTagSheet] = useState<'author' | 'general'>();
  const [tagName, setTagName] = useState('');
  const [tagSaving, setTagSaving] = useState(false);
  const tags = series.tags ?? [];
  const authorTags = tags.filter(tag => tag.kind === 'author');

  const saveTag = async () => {
    setTagSaving(true);
    try { await tagRepository.addSeriesTag(series.id, tagName, tagSheet); setTagName(''); setTagSheet(undefined); onSeriesChanged?.(); }
    catch (error) { Alert.alert('添加失败', error instanceof Error ? error.message : String(error)); }
    finally { setTagSaving(false); }
  };

  const removeTag = async (tag: LibraryTag) => {
    if (!tag.sources.includes('manual')) return;
    try { await tagRepository.removeSeriesTag(series.id, tag.id, 'manual'); onSeriesChanged?.(); }
    catch (error) { Alert.alert('删除失败', error instanceof Error ? error.message : String(error)); }
  };

  const renderTag = (tag: LibraryTag) => <TagChip key={tag.id} label={tag.name} author={tag.kind === 'author'} locked={!tag.sources.includes('manual')} onRemove={tag.sources.includes('manual') ? () => { void removeTag(tag); } : undefined} />;

  const header = <View>
    <View style={[styles.detailTop, layoutStyles.detailTopAligned]}>
      <IconButton name="chevron-back" label="返回作品" onPress={back} />
      <IconButton name="settings-outline" label="作品设置" onPress={() => setSeriesActions(true)} />
    </View>
    <View style={styles.hero}>
      <BookCover uri={series.coverUri} style={{ width: 112 }} />
      <View style={styles.heroBody}>
        <Text style={[styles.detailTitle, isDark && styles.textPrimaryDark]}>{series.title}</Text>
        <View style={layoutStyles.detailAuthorSlot}>{series.author && <Text numberOfLines={1} style={[{ color: tokens.colors.mutedText, fontSize: 12, marginTop: -2, marginBottom: 5 }, isDark && styles.textMutedDark]}>{compactAuthor(series.author)}</Text>}</View>
        <Text style={[styles.heroProgress, isDark && styles.textMutedDark]}>章节进度 {chapterIndex + 1} / {seriesChapters.length}</Text>
        <Progress value={chapterProgress} color={tokens.colors.secondary} />
        <Text style={[styles.heroProgress, isDark && styles.textMutedDark]}>当前章节 {Math.round(series.progress * 100)}%</Text>
        <Progress value={series.progress} color={tokens.colors.primary} />
      </View>
    </View>
    <View style={styles.tagEditor}>
      <View style={styles.tagList}>{authorTags.map(renderTag)}{tags.filter(tag => tag.kind === 'general').map(renderTag)}</View>
    </View>
    <Button label={hasHistory ? '继续阅读' : '开始阅读'} icon="book-outline" onPress={continueReading} style={{ marginTop: 24 }} />
    <SectionHeader title="目录" trailing={<Text style={{ color: tokens.colors.mutedText }}>共 {seriesChapters.length} 章</Text>} />
  </View>;

  return <Screen>
    <FlatList
      data={seriesChapters}
      keyExtractor={chapter => String(chapter.id)}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[styles.detailPage, isDark && styles.pageDark]}
      ListHeaderComponent={header}
      ListEmptyComponent={<EmptyState title="尚未找到章节" />}
      renderItem={({ item: chapter }) => <ChapterRow number={chapter.chapterNumber} title={chapter.chapterTitle} meta={chapter.format.toUpperCase()} progress={chapter.progress} current={chapter.id === series.currentChapterId} onPress={() => openChapter(chapter)} />}
    />
    <BottomSheet visible={seriesActions} onClose={() => setSeriesActions(false)} maxHeight="48%">
      <View style={styles.sheetHeading}>
        <Text style={[styles.sheetTitle, isDark && styles.textPrimaryDark]}>作品设置</Text>
        <IconButton name="close" label="关闭作品设置" onPress={() => setSeriesActions(false)} />
      </View>
      <SettingsGroup>
        <SettingsRow title="上传封面" onPress={() => { setSeriesActions(false); uploadCover(); }} />
        <SettingsRow title="添加作者" onPress={() => { setSeriesActions(false); setTagSheet('author'); }} />
        <SettingsRow title="添加标签" onPress={() => { setSeriesActions(false); setTagSheet('general'); }} />
      </SettingsGroup>
    </BottomSheet>
    <BottomSheet visible={tagSheet !== undefined} onClose={() => setTagSheet(undefined)}>
      <ScreenHeader title={tagSheet === 'author' ? '添加作者标签' : '添加普通标签'} trailing={<IconButton name="close" label="关闭标签编辑" onPress={() => setTagSheet(undefined)} />} />
      <TextField label={tagSheet === 'author' ? '作者名称' : '标签名称'} autoFocus value={tagName} onChangeText={setTagName} />
      <Button label="保存标签" loading={tagSaving} disabled={!tagName.trim()} onPress={saveTag} />
    </BottomSheet>
  </Screen>;
}

const formatMinutes = formatReadingDuration;

function StatsSummaryCard({ summary, onPress, isDark }: { summary: ReadingStatsSummary; onPress: () => void; isDark: boolean }) {
  const { tokens } = useTheme();
  const { styles } = useScreenStyles();
  const rows = normalizeDailyRows(summary);
  const max = Math.max(1, ...rows.map(item => item.durationMs));
  return <PressableScale onPress={onPress} style={[styles.statsSummaryCard, isDark && styles.cardDark]}><View style={styles.statsSummaryTop}><View><Text style={[styles.statsEyebrow, isDark && styles.textMutedDark]}>最近 7 天</Text><Text style={[styles.statsSummaryValue, isDark && styles.textPrimaryDark]}>{formatMinutes(summary.totalDurationMs)}</Text><Text style={[styles.meta, isDark && styles.textMutedDark]}>{summary.totalPages} 页 · {summary.bookCount} 部作品</Text></View><Ionicons name="stats-chart" size={24} color={isDark ? tokens.colors.primary : tokens.colors.primary} /></View><View style={styles.miniChart}>{rows.map(item => <View key={item.key} style={styles.miniChartColumn}><View style={[styles.miniChartBar, { height: `${Math.max(5, item.durationMs / max * 100)}%` }]} /><Text style={[styles.miniChartLabel, isDark && styles.textMutedDark]}>{item.label}</Text></View>)}</View><Text style={styles.statsLink}>查看详细统计 →</Text></PressableScale>;
}

function Recent({ series, openSeries, clearHistory, statsSummary, openStats }: { series: LibrarySeries[]; openSeries: (value: LibrarySeries) => void; clearHistory: (id: number) => void; statsSummary?: ReadingStatsSummary; openStats: () => void }) {
  const { tokens, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const readSeries = series.filter(item => item.currentChapterId !== null);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const week = new Date(today); week.setDate(week.getDate() - 6);
  const sections = [
    { title: '今天', data: readSeries.filter(item => item.updatedAt >= today.getTime()) },
    { title: '一周内', data: readSeries.filter(item => item.updatedAt < today.getTime() && item.updatedAt >= week.getTime()) },
    { title: '更早', data: readSeries.filter(item => item.updatedAt < week.getTime()) },
  ].filter(section => section.data.length > 0);
  return <SectionList sections={sections} keyExtractor={item => String(item.id)} stickySectionHeadersEnabled={false} contentContainerStyle={{ padding: 16, paddingHorizontal: getGridLayout(width).pageInset }}
    ListHeaderComponent={<View><ScreenHeader title="最近阅读" />{statsSummary && <StatsSummaryCard summary={statsSummary} onPress={openStats} isDark={isDark} />}</View>}
    renderSectionHeader={({ section }) => <SectionHeader title={section.title} />}
    renderItem={({ item }) => <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
      <PressableScale accessibilityRole="button" accessibilityLabel={'打开 ' + item.title} onPress={() => openSeries(item)} style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <BookCover uri={item.coverUri} style={{ width: 64 }} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={2} style={[tokens.typography.label, { color: tokens.colors.text }]}>{item.title}</Text>
          {!!item.author && <Text numberOfLines={1} style={[tokens.typography.caption, { color: tokens.colors.mutedText }]}>{compactAuthor(item.author)}</Text>}
          <Text style={[tokens.typography.caption, { color: tokens.colors.mutedText, marginTop: 8 }]}>阅读至 {item.currentChapterTitle || '章节'} · {Math.round(item.progress * 100)}%</Text>
        </View>
      </PressableScale>
      <IconButton name="trash-outline" label={'删除 ' + item.title + ' 的阅读记录'} onPress={() => clearHistory(item.id)} />
    </View>}
    ListEmptyComponent={<EmptyState icon="time-outline" title="还没有阅读记录" description="开始阅读一个章节后，它会出现在这里。" />}
  />;
}
export { Recent,SeriesDetail,SeriesLibrary };
