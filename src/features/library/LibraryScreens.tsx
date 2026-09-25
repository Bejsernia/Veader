import { MasonryFlashList } from '@shopify/flash-list';
import { DailyBars } from '../stats/daily-bars';
import { currentWeekRows } from '../stats/chart-utils';
import React,{ useEffect,useState } from 'react';
import { Alert,BackHandler,FlatList,ScrollView,SectionList,Text,View,useWindowDimensions } from 'react-native';
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
import { ContinueReading } from '../shared/continue-reading';
import { IconButton,Progress,SeriesCard,compactAuthor,formatReadingDuration } from '../shared/library-ui';

function SeriesLibrary({ series, importing, refreshLibraries, openSeries, continueSeries, openSources }: { series: LibrarySeries[]; importing: boolean; refreshLibraries: () => void; openSeries: (value: LibrarySeries) => void; continueSeries: (value: LibrarySeries) => void; openSources: () => void }) {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const { tokens } = useTheme();
  const { width, height, fontScale } = useWindowDimensions();
  const grid = getGridLayout(width, fontScale);
  const visible = series.filter(item => [item.title, item.author, item.tags.map(tag => tag.name).join(' '), item.chapterSearchText].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
  const featured = series.filter(item => item.currentChapterId !== null).reduce<LibrarySeries | undefined>((latest, item) => !latest || item.updatedAt > latest.updatedAt ? item : latest, undefined);
  useEffect(() => { if (!searching) return; const sub = BackHandler.addEventListener('hardwareBackPress', () => { setSearching(false); setQuery(''); return true; }); return () => sub.remove(); }, [searching]);
  return <MasonryFlashList key={grid.columns} estimatedListSize={{ width, height }} estimatedItemSize={grid.cardWidth * 1.5 + 80 * fontScale} extraData={`${width}:${fontScale}`} data={visible} numColumns={grid.columns} keyExtractor={item => String(item.id)} showsVerticalScrollIndicator={false}
    contentContainerStyle={{ padding: 16, paddingHorizontal: grid.pageInset }}
    ListHeaderComponent={<View>
      <ScreenHeader title="书架" trailing={<View style={{ flexDirection: 'row' }}><IconButton name={searching ? 'close' : 'search'} label={searching ? '关闭搜索' : '搜索作品'} onPress={() => { setSearching(!searching); setQuery(''); }} /><IconButton name="ellipsis-horizontal" label="书架管理" onPress={() => Alert.alert('书架管理', undefined, [{ text: '刷新漫画源', onPress: importing ? undefined : refreshLibraries }, { text: '管理漫画源', onPress: openSources }, { text: '取消', style: 'cancel' }])} /></View>} />
      {searching && <TextField label="搜索作品" value={query} onChangeText={setQuery} autoFocus placeholder="作品名、作者或标签" />}
      {!searching && featured && <ContinueReading series={featured} onPress={() => continueSeries(featured)} />}
      <SectionHeader title={searching ? '搜索结果' : '全部作品'} trailing={<Text style={[tokens.typography.caption, { color: tokens.colors.mutedText }]}>{visible.length} 部</Text>} />
    </View>}
    ListEmptyComponent={series.length === 0 ? <EmptyState title="尚未设置漫画库" description="选择漫画源，每个一级子文件夹会作为一本作品，其中的文件按章节整理。" actionLabel="添加漫画源" onAction={openSources} /> : <EmptyState icon="search-outline" title="没有匹配的作品" description="试试其他作品名、作者或标签。" />}
    renderItem={({ item, index, columnIndex }) => <View style={{ paddingLeft: grid.gutter * columnIndex / grid.columns, paddingRight: grid.gutter * (grid.columns - 1 - columnIndex) / grid.columns }}><SeriesCard naturalCover series={item} index={index} onPress={() => openSeries(item)} /></View>}
  />;
}

function SeriesDetail({ series, chapters: seriesChapters, back, openChapter, continueReading, uploadCover, onSeriesChanged }: { series: LibrarySeries; chapters: StoredChapter[]; back: () => void; openChapter: (chapter: StoredChapter) => void; continueReading: () => void; uploadCover: () => void; onSeriesChanged?: () => void }) {
  const { styles, layoutStyles } = useScreenStyles();
  const { isDark, tokens } = useTheme();
  const hasHistory = series.currentChapterId !== null;
  const [seriesActions, setSeriesActions] = useState(false);
  const [tagSheet, setTagSheet] = useState<'author' | 'general'>();
  const [tagName, setTagName] = useState('');
  const [tagSaving, setTagSaving] = useState(false);
  const tags = series.tags ?? [];
  const { fontScale } = useWindowDimensions();
  const stackedAction = fontScale > 1.3;
  const chapter = seriesChapters.find(item => item.id === series.currentChapterId);
  const location = chapter?.currentLocation?.match(/^(?:epub|mobi|pdf):(\d+)$/);
  const page = location ? Number(location[1]) + 1 : undefined;
  const position = page && chapter?.pageCount && page <= chapter.pageCount ? '第 ' + page + ' / ' + chapter.pageCount + ' 页' : '本章 ' + Math.round(series.progress * 100) + '%';
  const formats = [...new Set(seriesChapters.map(item => item.format.toUpperCase()))].join(' / ');
  const readButton = <Button label={hasHistory ? '继续阅读' : '开始阅读'} icon="book-outline" onPress={continueReading} disabled={!seriesChapters.length} style={{ paddingHorizontal: 12 }} />;

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

  const renderTag = (tag: LibraryTag) => <TagChip key={tag.id} label={tag.name} author={tag.kind === 'author'} />;

  const header = <View>
    <View style={[styles.detailTop, layoutStyles.detailTopAligned]}>
      <IconButton name="chevron-back" label="返回作品" onPress={back} />
      <IconButton name="settings-outline" label="作品设置" onPress={() => setSeriesActions(true)} />
    </View>
    <View style={[styles.hero, { gap: 16, alignItems: 'flex-start' }]}>
      <BookCover uri={series.coverUri} title={series.title} style={{ width: 108 }} />
      <View style={{ flex: 1, minWidth: 0, minHeight: 162, gap: 8 }}>
        <Text style={[tokens.typography.pageTitle, { color: tokens.colors.text }]}>{series.title}</Text>
        {!!series.author && <Text style={[tokens.typography.caption, { color: tokens.colors.mutedText }]}>{series.author}</Text>}
        <Text style={[tokens.typography.caption, { color: tokens.colors.mutedText }]}>{[formats, '共 ' + seriesChapters.length + ' 章'].filter(Boolean).join(' · ')}</Text>
        {!stackedAction && <View style={{ marginTop: 'auto', paddingTop: 4 }}>{readButton}</View>}
      </View>
    </View>
    {stackedAction && <View style={{ marginTop: 16 }}>{readButton}</View>}
    {hasHistory && <View style={{ marginTop: 20, gap: 8 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 4 }}>
        <Text style={[tokens.typography.caption, { color: tokens.colors.mutedText }]}>当前读到 · 第 {series.currentChapterNumber || 1} 章</Text>
        <Text style={[tokens.typography.caption, { color: tokens.colors.text }]}>{position}</Text>
      </View>
      <Progress value={series.progress} color={tokens.colors.primary} height={4} />
    </View>}
    {tags.some(tag => tag.kind === 'general') && <View style={[styles.tagList, { marginTop: 16 }]}>{tags.filter(tag => tag.kind === 'general').map(renderTag)}</View>}
    <SectionHeader title="目录" trailing={<Text style={{ color: tokens.colors.mutedText }}>共 {seriesChapters.length} 章</Text>} />
  </View>;

  return <Screen>
    <FlatList
      data={seriesChapters}
      keyExtractor={chapter => String(chapter.id)}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[styles.detailPage, isDark && styles.pageDark, { width: '100%', maxWidth: 900, alignSelf: 'center' }]}
      ListHeaderComponent={header}
      ListEmptyComponent={<EmptyState title="尚未找到章节" />}
      renderItem={({ item: chapter }) => <ChapterRow number={chapter.chapterNumber} title={chapter.chapterTitle} meta={chapter.format.toUpperCase()} progress={chapter.progress} current={chapter.id === series.currentChapterId} onPress={() => openChapter(chapter)} />}
    />
    <BottomSheet visible={seriesActions} onClose={() => setSeriesActions(false)} maxHeight="80%">
      <ScrollView style={{ flexShrink: 1 }}><View style={styles.sheetHeading}>
        <Text style={[styles.sheetTitle, isDark && styles.textPrimaryDark]}>作品设置</Text>
        <IconButton name="close" label="关闭作品设置" onPress={() => setSeriesActions(false)} />
      </View>
      <SettingsGroup>
        <View style={styles.tagList}>{tags.map(tag => <TagChip key={tag.id} label={tag.name} locked={!tag.sources.includes('manual')} onRemove={tag.sources.includes('manual') ? () => { void removeTag(tag); } : undefined} />)}</View>
        <SettingsRow title="上传封面" onPress={() => { setSeriesActions(false); uploadCover(); }} />
        <SettingsRow title="添加作者" onPress={() => { setSeriesActions(false); setTagSheet('author'); }} />
        <SettingsRow title="添加标签" onPress={() => { setSeriesActions(false); setTagSheet('general'); }} />
      </SettingsGroup></ScrollView>
    </BottomSheet>
    <BottomSheet visible={tagSheet !== undefined} onClose={() => setTagSheet(undefined)}>
      <ScreenHeader title={tagSheet === 'author' ? '添加作者标签' : '添加普通标签'} trailing={<IconButton name="close" label="关闭标签编辑" onPress={() => setTagSheet(undefined)} />} />
      <TextField label={tagSheet === 'author' ? '作者名称' : '标签名称'} autoFocus value={tagName} onChangeText={setTagName} />
      <Button label="保存标签" loading={tagSaving} disabled={!tagName.trim()} onPress={saveTag} />
    </BottomSheet>
  </Screen>;
}

const formatMinutes = formatReadingDuration;

function StatsSummaryCard({ summary, onPress, width }: { summary: ReadingStatsSummary; onPress: () => void; width: number }) {
  const { tokens, isDark } = useTheme();
  const total = currentWeekRows(summary.daily).reduce((sum, row) => sum + row.durationMs, 0);
  return <View style={{ backgroundColor: tokens.colors.surface, borderRadius: 12, padding: 16 }}>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
      <View><Text style={[tokens.typography.caption, { color: tokens.colors.mutedText }]}>本周阅读</Text><Text style={[tokens.typography.sectionTitle, { color: tokens.colors.text, marginTop: 4 }]}>{formatMinutes(total)}</Text></View>
      <Button label="阅读统计 ›" variant="ghost" onPress={onPress} style={{ paddingHorizontal: 8 }} />
    </View>
    <DailyBars summary={summary} isDark={isDark} compact initialWidth={width - 2 * getGridLayout(width).pageInset - 32} />
  </View>;
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
    ListHeaderComponent={<View><ScreenHeader title="最近阅读" />{statsSummary && <StatsSummaryCard summary={statsSummary} onPress={openStats} width={width} />}</View>}
    renderSectionHeader={({ section }) => <SectionHeader title={section.title} />}
    renderItem={({ item }) => <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
      <PressableScale accessibilityRole="button" accessibilityLabel={'打开 ' + item.title} onPress={() => openSeries(item)} style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <BookCover uri={item.coverUri} title={item.title} style={{ width: 48 }} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={2} style={[tokens.typography.label, { color: tokens.colors.text }]}>{item.title}</Text>
          {!!item.author && <Text numberOfLines={1} style={[tokens.typography.caption, { color: tokens.colors.mutedText }]}>{compactAuthor(item.author)}</Text>}
          <Text style={[tokens.typography.caption, { color: tokens.colors.mutedText, marginTop: 8 }]}>阅读至 {item.currentChapterTitle || '章节'} · {Math.round(item.progress * 100)}%</Text>
        </View>
      </PressableScale>
      <IconButton name="ellipsis-horizontal" label={'管理 ' + item.title + ' 的阅读记录'} onPress={() => Alert.alert(item.title, '阅读记录', [{ text: '删除阅读记录', style: 'destructive', onPress: () => clearHistory(item.id) }, { text: '取消', style: 'cancel' }])} />
    </View>}
    ListEmptyComponent={<EmptyState icon="time-outline" title="还没有阅读记录" description="开始阅读一个章节后，它会出现在这里。" />}
  />;
}
export { Recent,SeriesDetail,SeriesLibrary };
