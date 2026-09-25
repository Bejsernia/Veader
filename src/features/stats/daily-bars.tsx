import React, { useState } from 'react';
import { ScrollView, Text, View, useWindowDimensions } from 'react-native';
import type { ReadingStatsRange, ReadingStatsSummary } from '../../domain/models';
import { useScreenStyles } from '../../ui/screen-styles';
import { useTheme } from '../../ui/theme';
import { normalizeDailyRows, currentWeekRows, localDayKey } from './chart-utils';
const DAILY_PLOT_HEIGHT = 128;
const DAILY_X_AXIS_HEIGHT = 24;

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

export function DailyBars({ summary, isDark, compact = false, initialWidth = 0 }: { summary: ReadingStatsSummary; isDark: boolean; compact?: boolean; initialWidth?: number }) {
  const { styles, statsChartStyles } = useScreenStyles();
  const { tokens } = useTheme();
  const [containerWidth, setContainerWidth] = useState(initialWidth);
  const { fontScale } = useWindowDimensions();
  const rows = compact ? currentWeekRows(summary.daily) : normalizeDailyRows(summary);
  const plotHeight = compact ? 80 : Math.max(DAILY_PLOT_HEIGHT, 90 * fontScale);
  const scale = axisScale(rows);
  const axisWidth = compact ? 0 : Math.max(34, 34 * fontScale);
  const plotViewportWidth = Math.max(1, containerWidth - axisWidth - 8);
  const minimumSlot = summary.range === '7d' ? (compact ? 28 : 34) * fontScale : 24;
  const plotWidth = Math.max(plotViewportWidth, rows.length * minimumSlot);
  const slotWidth = plotWidth / Math.max(1, rows.length);
  const barWidth = summary.range === '7d'
    ? Math.min(18, Math.max(10, slotWidth * 0.55))
    : summary.range === '30d'
      ? Math.min(7, Math.max(4, slotWidth * 0.65))
      : Math.min(16, Math.max(6, slotWidth * 0.55));
  const scrollable = plotWidth > plotViewportWidth;

  if (!rows.length) return <View style={styles.empty}>
    <Text style={[styles.meta, isDark && styles.textMutedDark]}>开始阅读后这里会显示每日趋势</Text>
  </View>;

  return <View onLayout={event => setContainerWidth(event.nativeEvent.layout.width)} style={{ marginTop: 16 }}>
    {!compact && <Text style={[tokens.typography.caption, { color: tokens.colors.mutedText, marginBottom: 8 }]}>单位：分钟</Text>}
    <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
    {!compact && <View style={[statsChartStyles.dailyYAxis, { width: axisWidth, height: plotHeight + DAILY_X_AXIS_HEIGHT * fontScale }]}>
      <View style={[statsChartStyles.dailyYAxisTicks, { height: plotHeight }]}>
        {scale.ticks.map(value => <Text key={value} style={[statsChartStyles.dailyAxisText, isDark && statsChartStyles.dailyAxisTextDark]}>{axisLabel(value)}</Text>)}
      </View>
    </View>}
    <ScrollView horizontal={scrollable} scrollEnabled={scrollable} showsHorizontalScrollIndicator={false} style={{ width: plotViewportWidth }} contentContainerStyle={{ width: plotWidth }}>
      <View style={[statsChartStyles.dailyPlot, { width: plotWidth, height: plotHeight + DAILY_X_AXIS_HEIGHT * fontScale }]}>
        <View style={[statsChartStyles.dailyPlotArea, { height: plotHeight }]}>
          {scale.ticks.map((_, index) => <View key={`grid-${index}`} style={[statsChartStyles.dailyGridLine, isDark && statsChartStyles.dailyGridLineDark, { top: `${index * 25}%` }]} />)}
          <View style={[statsChartStyles.dailyBarsRow, { height: plotHeight }]}>
            {rows.map(row => {
              const ratio = Math.min(1, row.durationMs / Math.max(1, scale.maxMs));
              return <View accessible accessibilityLabel={`${row.label}，${Math.round(row.durationMs / 60000)} 分钟`} key={row.key} style={[statsChartStyles.dailyBarSlot, { width: slotWidth }]}>
                <View style={[statsChartStyles.dailyBar, { width: barWidth, backgroundColor: tokens.colors.primary, opacity: compact && row.key !== localDayKey(new Date()) ? 0.35 : 1, height: row.durationMs ? Math.max(4, ratio * plotHeight) : 0 }]} />
              </View>;
            })}
          </View>
        </View>
        <View style={[statsChartStyles.dailyXAxis, { height: DAILY_X_AXIS_HEIGHT * fontScale }]}>
          {rows.map((row, index) => <Text key={row.key} numberOfLines={1} style={[statsChartStyles.dailyXAxisLabel, { width: slotWidth }, isDark && statsChartStyles.dailyAxisTextDark]}>{compact ? row.label : shouldShowDateLabel(index, rows.length, summary.range) ? displayDateLabel(row.label, summary.range) : ''}</Text>)}
        </View>
      </View>
    </ScrollView>
    </View>
  </View>;
}
