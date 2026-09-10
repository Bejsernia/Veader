import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { readerAppearance,ThemeTokens,useTheme } from './theme';

// Feature-specific layouts only. Shared controls live in components/.
function createScreenStyles(tokens: ThemeTokens) {
  const styles = StyleSheet.create({
    flex: { flex: 1 },
    page: { padding: 16, paddingBottom: 28 },
    meta: { ...tokens.typography.caption, color: tokens.colors.mutedText, },
    sectionTitle: { ...tokens.typography.sectionTitle, color: tokens.colors.text, },
    rowTitle: { ...tokens.typography.label, color: tokens.colors.text, marginBottom: 5 },
    detailPage: { padding: 16 },
    detailTop: { flexDirection: 'row', justifyContent: 'space-between' },
    hero: { flexDirection: 'row', gap: 20, marginTop: 12 },
    heroBody: { flex: 1, minWidth: 0, paddingTop: 8 },
    detailTitle: { ...tokens.typography.pageTitle, color: tokens.colors.text, marginBottom: 8 },
    heroProgress: { color: tokens.colors.mutedText, fontSize: 12, marginTop: 21, marginBottom: 7 },
    readerTop: { position: 'absolute', top: 0, left: 0, right: 0, paddingTop: 45, height: 110, paddingHorizontal: 0, backgroundColor: readerAppearance.dark.overlay, flexDirection: 'row', alignItems: 'center' },
    readerTopTitle: { position: 'absolute', left: 56, right: 56, top: 0, bottom: 0, minWidth: 0, alignItems: 'center', justifyContent: 'center' },
    readerBook: { color: readerAppearance.dark.text, fontWeight: '700', textAlign: 'center', maxWidth: '100%' },
    readerChapter: { color: readerAppearance.dark.muted, fontSize: 12, marginTop: 3, textAlign: 'center', maxWidth: '100%' },
    sheetTitle: { ...tokens.typography.sectionTitle, color: tokens.colors.text },
    settingSection: { color: tokens.colors.mutedText, fontSize: 12, fontWeight: '700', marginTop: 22, marginBottom: 10 },
    empty: { width: '100%', alignItems: 'center', gap: 10, paddingVertical: 40 },
    sourceCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: tokens.colors.surface, padding: 15, borderRadius: tokens.radius.md, marginBottom: 12 },
    sourceIcon: { width: 48, height: 48, borderRadius: tokens.radius.md, alignItems: 'center', justifyContent: 'center' },
    sourceStatus: { ...tokens.typography.caption, color: tokens.colors.primary, marginTop: 5 },
    sheetHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    documentReader: { flex: 1, backgroundColor: readerAppearance.dark.canvas },
    documentTop: { height: 72, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: readerAppearance.dark.canvas },
    readerMessage: { flex: 1, padding: 30, alignItems: 'center', justifyContent: 'center', gap: 18 },
    errorText: { color: readerAppearance.dark.text, textAlign: 'center', lineHeight: 22 },
    comicReader: { flex: 1, backgroundColor: readerAppearance.dark.canvas },
    epubPage: { backgroundColor: readerAppearance.dark.canvas, alignItems: 'center', justifyContent: 'center' },
    epubImage: { width: '100%', height: '100%' },
    epubBottom: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: readerAppearance.dark.overlay, paddingHorizontal: 0, paddingTop: 16, paddingBottom: 24 },
    epubCounter: { color: readerAppearance.dark.text, fontWeight: '800', textAlign: 'center' },
    readerOverlay: { zIndex: 20, elevation: 20 },
    chapterLabel: { color: readerAppearance.dark.muted, fontSize: 12, textAlign: 'center', marginBottom: 4 },
    readerSlider: { width: '100%', height: 40 },
    quickActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', minHeight: 44, marginTop: 0 },
    quickAction: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', paddingVertical: 4 },
    sourceSwipe: { position: 'relative', overflow: 'hidden', borderRadius: tokens.radius.md, marginBottom: 12 },
    sourceDelete: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 78, backgroundColor: tokens.colors.danger, alignItems: 'center', justifyContent: 'center', gap: 3 },
    sourceDeleteText: { color: tokens.colors.onPrimary, fontSize: 11, fontWeight: '800' },
    pageDark: { backgroundColor: tokens.colors.background },
    cardDark: { backgroundColor: tokens.colors.surface },
    scanCardDark: { backgroundColor: tokens.colors.selectedContainer },
    textPrimaryDark: { color: tokens.colors.text },
    textMutedDark: { ...tokens.typography.caption, color: tokens.colors.mutedText },
    readerMenuSurface: { marginHorizontal: 12, borderRadius: 18, overflow: 'hidden' },
    tagList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
    tagEditor: { marginTop: 16, marginBottom: 4 },
    categoryCardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    categoryIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: tokens.colors.selectedContainer, alignItems: 'center', justifyContent: 'center' },
    iconAction: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    statsSummaryCard: { backgroundColor: tokens.colors.surface, borderRadius: tokens.radius.md, padding: 16, marginBottom: 6 },
    statsSummaryTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    statsEyebrow: { ...tokens.typography.caption, color: tokens.colors.mutedText, fontWeight: '700' },
    statsSummaryValue: { color: tokens.colors.text, fontSize: 24, lineHeight: 30, fontWeight: '800', marginTop: 3 },
    miniChart: { height: 76, flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 12 },
    miniChartColumn: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
    miniChartBar: { width: '68%', minHeight: 4, borderRadius: 4, backgroundColor: tokens.colors.primary },
    miniChartLabel: { ...tokens.typography.caption, color: tokens.colors.mutedText, },
    statsLink: { color: tokens.colors.primary, fontSize: 12, fontWeight: '800', marginTop: 8 },
    statsOverviewGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 },
    statsOverviewCard: { width: '48%', minHeight: 105, borderRadius: tokens.radius.md, backgroundColor: tokens.colors.selectedContainer, padding: 14, justifyContent: 'space-between' },
    statsOverviewValue: { color: tokens.colors.text, fontSize: 19, lineHeight: 25, fontWeight: '800' },
    statsPanel: { backgroundColor: tokens.colors.surface, borderRadius: tokens.radius.md, padding: 16, marginTop: 14, gap: 14 }
  });
  const categoryStyles = StyleSheet.create({
    customCategoryCard: { backgroundColor: tokens.colors.surface, borderRadius: tokens.radius.md, padding: 16, marginTop: 14 },
    customCategoryCardDark: { backgroundColor: tokens.colors.surface },
    automaticCategoryGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10, marginTop: 10 },
    automaticCategoryTile: { width: '48%', minHeight: 68, borderRadius: tokens.radius.md, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 9 },
    automaticAuthorTile: { backgroundColor: tokens.colors.selectedContainer },
    automaticTagTile: { backgroundColor: tokens.colors.elevated },
    automaticAuthorTileDark: { backgroundColor: tokens.colors.selectedContainer },
    automaticTagTileDark: { backgroundColor: tokens.colors.elevated },
    automaticCategoryIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    automaticAuthorIcon: { backgroundColor: tokens.colors.selectedContainer },
    automaticTagIcon: { backgroundColor: tokens.colors.selectedContainer },
    automaticAuthorIconDark: { backgroundColor: tokens.colors.selectedContainer },
    automaticTagIconDark: { backgroundColor: tokens.colors.selectedContainer },
    automaticCategoryBody: { flex: 1, minWidth: 0 },
    automaticCategoryName: { color: tokens.colors.text, fontSize: 14, lineHeight: 19, fontWeight: '700' },
    automaticCategoryCount: { ...tokens.typography.caption, color: tokens.colors.mutedText, marginTop: 2 },
    categoryOverview: { flexDirection: 'row', alignItems: 'center', minHeight: 66, marginTop: 16, paddingHorizontal: 12, borderRadius: tokens.radius.md, backgroundColor: tokens.colors.selectedContainer },
    categoryOverviewDark: { backgroundColor: tokens.colors.selectedContainer },
    categoryOverviewItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
    categoryOverviewValue: { color: tokens.colors.text, fontSize: 18, lineHeight: 23, fontWeight: '800' },
    categoryOverviewLabel: { ...tokens.typography.caption, color: tokens.colors.mutedText, },
    categoryOverviewDivider: { width: 1, height: 28, backgroundColor: tokens.colors.divider },
    categoryOverviewDividerDark: { backgroundColor: tokens.colors.divider }
  });
  const statsChartStyles = StyleSheet.create({
    dailyChart: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 24 },
    dailyYAxis: { ...tokens.typography.caption, width: 34, height: 152, marginRight: 8, position: 'relative' },
    dailyAxisUnit: { ...tokens.typography.caption, position: 'absolute', top: -20, left: 0, width: 34, color: tokens.colors.mutedText, textAlign: 'right' },
    dailyYAxisTicks: { ...tokens.typography.caption, height: 128, justifyContent: 'space-between' },
    dailyAxisText: { ...tokens.typography.caption, color: tokens.colors.mutedText, textAlign: 'right' },
    dailyAxisTextDark: { ...tokens.typography.caption, color: tokens.colors.mutedText },
    dailyPlot: { height: 152 },
    dailyPlotArea: { position: 'relative' },
    dailyGridLine: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: tokens.colors.divider },
    dailyGridLineDark: { backgroundColor: tokens.colors.divider },
    dailyBarsRow: { flexDirection: 'row', alignItems: 'flex-end' },
    dailyBarSlot: { height: '100%', alignItems: 'center', justifyContent: 'flex-end' },
    dailyBar: { borderRadius: 4, backgroundColor: tokens.colors.secondary },
    dailyXAxis: { ...tokens.typography.caption, flexDirection: 'row', alignItems: 'flex-start' },
    dailyXAxisLabel: { ...tokens.typography.caption, color: tokens.colors.mutedText, textAlign: 'center' }
  });
  const pageLayoutStyles = StyleSheet.create({
    rowContent: { flex: 1, minWidth: 0 }
  });
  const layoutStyles = StyleSheet.create({
    detailTopAligned: { marginLeft: -11, marginRight: -11 },
    detailAuthorSlot: { minHeight: 21, justifyContent: 'flex-start' },
    sourceCardInset: { marginRight: 0, marginBottom: 0 },
    sourceDeleteInset: { right: 0, top: 0, bottom: 0, width: 60 }
  });
  const uiStyles = StyleSheet.create({
    loadingState: { alignItems: 'center', justifyContent: 'center', gap: 12 },
    sourceStatusDark: { ...tokens.typography.caption, color: tokens.colors.primary },
    settingSectionDark: { color: tokens.colors.mutedText }
  });
  const statsChartAdjustments = StyleSheet.create({
    dailyChartInset: { marginLeft: -8 }
  });
  const categoryUiStyles = StyleSheet.create({
    categoryDetailCount: { ...tokens.typography.caption, marginTop: 8, marginBottom: 20 }
  });
  return { styles, categoryStyles, statsChartStyles, pageLayoutStyles, layoutStyles, uiStyles, statsChartAdjustments, categoryUiStyles };
}
export function useScreenStyles() {
  const { tokens } = useTheme();
  return useMemo(() => createScreenStyles(tokens), [tokens]);
}
