import React,{ useEffect,useState } from 'react';
import { ActivityIndicator,ScrollView,Text,View,useWindowDimensions } from 'react-native';
import { statsRepository } from '../../data/stats-repository';
import type { ReadingStatsRange,ReadingStatsSummary } from '../../domain/models';
import { Button } from '../../ui/components/button';
import { ProgressBar } from '../../ui/components/progress-bar';
import { Screen } from '../../ui/components/screen';
import { ScreenHeader } from '../../ui/components/screen-header';
import { SegmentedControl } from '../../ui/components/segmented-control';
import { useScreenStyles } from '../../ui/screen-styles';
import { useTheme } from '../../ui/theme';
import { formatReadingDuration } from '../shared/library-ui';
import { DailyBars } from './daily-bars';



const duration = formatReadingDuration;

function BarList({ rows, isDark, formatValue = duration }: { rows: Array<{ name: string; value: number; detail: string }>; isDark: boolean; formatValue?: (value: number) => string }) {
  const { styles } = useScreenStyles();
  const max = Math.max(1, ...rows.map(row => row.value));
  return <View style={{ gap: 13 }}>
    {rows.length ? rows.map(row => <View key={row.name}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
        <Text numberOfLines={1} style={[styles.rowTitle, { flex: 1 }, isDark && styles.textPrimaryDark]}>{row.name}</Text>
        <Text style={[styles.meta, isDark && styles.textMutedDark]}>{formatValue(row.value)}</Text>
      </View>
      <ProgressBar value={row.value / max} height={7} />
      <Text style={[styles.meta, { fontSize: 11 }, isDark && styles.textMutedDark]}>{row.detail}</Text>
    </View>) : <Text style={[styles.meta, isDark && styles.textMutedDark]}>暂无数据</Text>}
  </View>;
}

export function ReadingStatsScreen({ back }: { back: () => void }) {
  const { styles, uiStyles } = useScreenStyles();
  const { isDark, tokens } = useTheme();
  const { fontScale } = useWindowDimensions();
  const [range, setRange] = useState<ReadingStatsRange>('7d');
  const [summary, setSummary] = useState<ReadingStatsSummary>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    void statsRepository.getSummary(range).then(value => { if (active) setSummary(value); }).catch(reason => { if (active) setError(String(reason)); }).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [range, attempt]);

  return <Screen scroll>
      <ScreenHeader title="阅读统计" back={back} />
      <SegmentedControl label="统计范围" value={range} onChange={setRange} options={[{ value: '7d', label: '7天' }, { value: '30d', label: '30天' }, { value: 'all', label: '全部' }]} />
      {error ? <View><Text style={{ color: tokens.colors.danger }}>{error}</Text><Button label="重新加载统计" onPress={() => setAttempt(n => n + 1)} /></View> : loading || !summary ? <View style={uiStyles.loadingState}><ActivityIndicator color={tokens.colors.primary} /><Text style={[styles.meta, isDark && styles.textMutedDark]}>正在计算阅读数据…</Text></View> : <>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginVertical: 16 }}>
          {[['时长', summary.totalDurationMs < 3600000 ? String(Math.round(summary.totalDurationMs / 60000)) : (summary.totalDurationMs / 3600000).toFixed(1), summary.totalDurationMs < 3600000 ? '分钟' : '小时'], ['页数', String(summary.totalPages)], ['作品', String(summary.bookCount)], ['完成章节', String(summary.completedChapterCount)]].map(([label, value, unit]) => <View key={label} style={{ width: fontScale > 1.3 ? '50%' : '25%', paddingVertical: 8, paddingRight: 8 }}><Text style={[tokens.typography.sectionTitle, { color: tokens.colors.text }]}>{value}{unit && <Text style={{ fontSize: 12, fontWeight: '400', color: tokens.colors.mutedText }}> {unit}</Text>}</Text><Text style={[tokens.typography.caption, { color: tokens.colors.mutedText, marginTop: 4 }]}>{label}</Text></View>)}
        </View>
        <View style={[styles.statsPanel, isDark && styles.cardDark]}><Text style={[styles.sectionTitle, isDark && styles.textPrimaryDark]}>每日阅读时长</Text><DailyBars summary={summary} isDark={isDark} /></View>
        <View style={[styles.statsPanel, isDark && styles.cardDark]}><Text style={[styles.sectionTitle, isDark && styles.textPrimaryDark]}>按作品</Text><BarList isDark={isDark} rows={summary.byBook.map(row => ({ name: row.title, value: row.durationMs, detail: `${row.pages} 页 · ${Math.round(row.progress * 100)}%`, }))} /></View>
        <View style={[styles.statsPanel, isDark && styles.cardDark]}><Text style={[styles.sectionTitle, isDark && styles.textPrimaryDark]}>按标签</Text><BarList isDark={isDark} rows={summary.byTag.map(row => ({ name: row.name, value: row.durationMs, detail: `${row.pages} 页`, }))} /></View>
        <View style={[styles.statsPanel, isDark && styles.cardDark]}><Text style={[styles.sectionTitle, isDark && styles.textPrimaryDark]}>按作者</Text><BarList isDark={isDark} rows={summary.byAuthor.map(row => ({ name: row.name, value: row.durationMs, detail: `${row.pages} 页`, }))} /></View>
      </>}
  </Screen>;
}
