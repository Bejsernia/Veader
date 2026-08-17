import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ReadingStatsRange, ReadingStatsSummary } from '../../domain/models';
import { statsRepository } from '../../data/stats-repository';
import { PressableScale } from '../../ui/components/pressable-scale';
import { useTheme } from '../../ui/theme';
import { styles, layoutStyles, pageLayoutStyles, statsChartAdjustments, statsChartStyles, uiStyles } from '../../ui/legacy-styles';
import { IconButton } from '../shared/library-ui';
import { normalizeDailyRows } from './chart-utils';

const DAILY_PLOT_HEIGHT = 128;
const DAILY_X_AXIS_HEIGHT = 24;

function duration(value: number) {
  const minutes = Math.round(value / 60000);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}小时 ${minutes % 60}分` : `${minutes}分钟`;
}

function BarList({ rows, isDark, formatValue = duration }: { rows: Array<{ name: string; value: number; detail: string }>; isDark: boolean; formatValue?: (value: number) => string }) {
  const max = Math.max(1, ...rows.map(row => row.value));
  return <View style={{ gap: 13 }}>
    {rows.length ? rows.map(row => <View key={row.name}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
        <Text numberOfLines={1} style={[styles.rowTitle, { flex: 1 }, isDark && styles.textPrimaryDark]}>{row.name}</Text>
        <Text style={[styles.meta, isDark && styles.textMutedDark]}>{formatValue(row.value)}</Text>
      </View>
      <View style={{ height: 7, borderRadius: 4, overflow: 'hidden', backgroundColor: isDark ? '#3A3443' : '#E3E0E7', marginTop: 5 }}>
        <View style={{ height: '100%', width: `${Math.max(3, row.value / max * 100)}%`, borderRadius: 4, backgroundColor: '#7257E7' }} />
      </View>
      <Text style={[styles.meta, { fontSize: 11 }, isDark && styles.textMutedDark]}>{row.detail}</Text>
    </View>) : <Text style={[styles.meta, isDark && styles.textMutedDark]}>暂无数据</Text>}
  </View>;
}

function niceStep(value: number) {
  const safeValue = Math.max(1, value);
  const magnitude = 10 ** Math.floor(Math.log10(safeValue));
  const normalized = safeValue / magnitude;
  const unit = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return unit * magnitude;
}

function axisScale(rows: ReadingStatsSummary['daily']) {
  const maxMinutes = Math.max(1, Math.ceil(Math.max(0, ...rows.map(row => row.durationMs)) / 60000));
  const stepMinutes = niceStep(maxMinutes / 4);
  const maxAxisMinutes = stepMinutes * 4;
  return {
    maxMs: maxAxisMinutes * 60000,
    ticks: Array.from({ length: 5 }, (_, index) => (4 - index) * stepMinutes * 60000),
  };
}

function axisLabel(value: number) {
  const minutes = value / 60000;
  return Number.isInteger(minutes) ? String(minutes) : minutes.toFixed(1);
}

function shouldShowDateLabel(index: number, count: number, range: ReadingStatsRange) {
  if (count <= 7 || range === '7d') return true;
  if (range === '30d') return index === 0 || index === count - 1 || index % 5 === 0;
  const stride = Math.max(1, Math.ceil(count / 6));
  return index === 0 || index === count - 1 || index % stride === 0;
}

function displayDateLabel(label: string, range: ReadingStatsRange) {
  return range === '30d' ? label.split('/').pop() ?? label : label;
}

function DailyBars({ summary, isDark }: { summary: ReadingStatsSummary; isDark: boolean }) {
  const { width } = useWindowDimensions();
  const rows = normalizeDailyRows(summary);
  const scale = axisScale(rows);
  const plotViewportWidth = Math.max(180, width - 126);
  const allTime = summary.range === 'all';
  const plotWidth = allTime ? Math.max(plotViewportWidth, rows.length * 24) : plotViewportWidth;
  const slotWidth = plotWidth / Math.max(1, rows.length);
  const barWidth = summary.range === '7d'
    ? Math.min(18, Math.max(10, slotWidth * 0.55))
    : summary.range === '30d'
      ? Math.min(7, Math.max(4, slotWidth * 0.65))
      : Math.min(16, Math.max(6, slotWidth * 0.55));
  const scrollable = allTime && plotWidth > plotViewportWidth;

  if (!rows.length) return <View style={styles.empty}>
    <Text style={[styles.meta, isDark && styles.textMutedDark]}>开始阅读后这里会显示每日趋势</Text>
  </View>;

  return <View style={[statsChartStyles.dailyChart, statsChartAdjustments.dailyChartInset]}>
    <View style={statsChartStyles.dailyYAxis}>
      <Text style={[statsChartStyles.dailyAxisUnit, isDark && statsChartStyles.dailyAxisTextDark]}>分钟</Text>
      <View style={statsChartStyles.dailyYAxisTicks}>
        {scale.ticks.map(value => <Text key={value} style={[statsChartStyles.dailyAxisText, isDark && statsChartStyles.dailyAxisTextDark]}>{axisLabel(value)}</Text>)}
      </View>
    </View>
    <ScrollView horizontal={scrollable} scrollEnabled={scrollable} showsHorizontalScrollIndicator={false} style={{ width: plotViewportWidth }} contentContainerStyle={{ width: plotWidth }}>
      <View style={[statsChartStyles.dailyPlot, { width: plotWidth }]}>
        <View style={[statsChartStyles.dailyPlotArea, { height: DAILY_PLOT_HEIGHT }]}>
          {scale.ticks.map((_, index) => <View key={`grid-${index}`} style={[statsChartStyles.dailyGridLine, isDark && statsChartStyles.dailyGridLineDark, { top: `${index * 25}%` }]} />)}
          <View style={[statsChartStyles.dailyBarsRow, { height: DAILY_PLOT_HEIGHT }]}>
            {rows.map(row => {
              const ratio = Math.min(1, row.durationMs / Math.max(1, scale.maxMs));
              return <View key={row.key} style={[statsChartStyles.dailyBarSlot, { width: slotWidth }]}>
                <View style={[statsChartStyles.dailyBar, { width: barWidth, height: row.durationMs ? Math.max(4, ratio * DAILY_PLOT_HEIGHT) : 0 }]} />
              </View>;
            })}
          </View>
        </View>
        <View style={[statsChartStyles.dailyXAxis, { height: DAILY_X_AXIS_HEIGHT }]}>
          {rows.map((row, index) => <Text key={row.key} numberOfLines={1} style={[statsChartStyles.dailyXAxisLabel, { width: slotWidth }, isDark && statsChartStyles.dailyAxisTextDark]}>{shouldShowDateLabel(index, rows.length, summary.range) ? displayDateLabel(row.label, summary.range) : ''}</Text>)}
        </View>
      </View>
    </ScrollView>
  </View>;
}

export function ReadingStatsScreen({ back }: { back: () => void }) {
  const { isDark } = useTheme();
  const [range, setRange] = useState<ReadingStatsRange>('7d');
  const [summary, setSummary] = useState<ReadingStatsSummary>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void statsRepository.getSummary(range).then(value => { if (active) setSummary(value); }).catch(console.warn).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [range]);

  return <SafeAreaView style={[styles.safe, isDark && styles.safeDark]}>
    <ScrollView contentContainerStyle={[styles.page, isDark && styles.pageDark]}>
      <View style={[styles.header, layoutStyles.subpageHeader]}>
        <IconButton name="chevron-back" label="返回最近阅读" onPress={back} />
        <Text style={[styles.navTitle, isDark && styles.textPrimaryDark]}>阅读统计</Text>
        <View style={pageLayoutStyles.headerSpacer} />
      </View>
      <View style={[styles.segment, isDark && uiStyles.segmentDark]}>
        {(['7d', '30d', 'all'] as ReadingStatsRange[]).map(value => <PressableScale key={value} onPress={() => setRange(value)} style={[styles.segmentItem, range === value && styles.segmentActive, isDark && range === value && uiStyles.segmentActiveDark]}>
          <Text style={[styles.segmentText, range === value && styles.segmentTextActive, isDark && value !== range && uiStyles.segmentTextDark]}>{value === '7d' ? '7天' : value === '30d' ? '30天' : '全部'}</Text>
        </PressableScale>)}
      </View>
      {loading || !summary ? <View style={uiStyles.loadingState}><ActivityIndicator color="#7257E7" /><Text style={[styles.meta, isDark && styles.textMutedDark]}>正在计算阅读数据…</Text></View> : <>
        <View style={styles.statsOverviewGrid}>
          <View style={[styles.statsOverviewCard, isDark && styles.cardDark]}><Ionicons name="time-outline" size={20} color="#7257E7" /><Text style={[styles.statsOverviewValue, isDark && styles.textPrimaryDark]}>{duration(summary.totalDurationMs)}</Text><Text style={[styles.meta, isDark && styles.textMutedDark]}>阅读时长</Text></View>
          <View style={[styles.statsOverviewCard, isDark && styles.cardDark]}><Ionicons name="book-outline" size={20} color="#0F9F83" /><Text style={[styles.statsOverviewValue, isDark && styles.textPrimaryDark]}>{summary.totalPages}</Text><Text style={[styles.meta, isDark && styles.textMutedDark]}>阅读页数</Text></View>
          <View style={[styles.statsOverviewCard, isDark && styles.cardDark]}><Ionicons name="library-outline" size={20} color="#A855F7" /><Text style={[styles.statsOverviewValue, isDark && styles.textPrimaryDark]}>{summary.bookCount}</Text><Text style={[styles.meta, isDark && styles.textMutedDark]}>阅读作品</Text></View>
          <View style={[styles.statsOverviewCard, isDark && styles.cardDark]}><Ionicons name="checkmark-circle-outline" size={20} color="#C56B1C" /><Text style={[styles.statsOverviewValue, isDark && styles.textPrimaryDark]}>{summary.completedChapterCount}</Text><Text style={[styles.meta, isDark && styles.textMutedDark]}>完成章节</Text></View>
        </View>
        <View style={[styles.statsPanel, isDark && styles.cardDark]}><Text style={[styles.sectionTitle, isDark && styles.textPrimaryDark]}>每日阅读时长</Text><DailyBars summary={summary} isDark={isDark} /></View>
        <View style={[styles.statsPanel, isDark && styles.cardDark]}><Text style={[styles.sectionTitle, isDark && styles.textPrimaryDark]}>按作品</Text><BarList isDark={isDark} rows={summary.byBook.map(row => ({ name: row.title, value: row.durationMs, detail: `${row.pages} 页 · ${Math.round(row.progress * 100)}%`, }))} /></View>
        <View style={[styles.statsPanel, isDark && styles.cardDark]}><Text style={[styles.sectionTitle, isDark && styles.textPrimaryDark]}>按 tag</Text><BarList isDark={isDark} rows={summary.byTag.map(row => ({ name: row.name, value: row.durationMs, detail: `${row.pages} 页`, }))} /></View>
        <View style={[styles.statsPanel, isDark && styles.cardDark]}><Text style={[styles.sectionTitle, isDark && styles.textPrimaryDark]}>按作者</Text><BarList isDark={isDark} rows={summary.byAuthor.map(row => ({ name: row.name, value: row.durationMs, detail: `${row.pages} 页`, }))} /></View>
      </>}
    </ScrollView>
  </SafeAreaView>;
}
