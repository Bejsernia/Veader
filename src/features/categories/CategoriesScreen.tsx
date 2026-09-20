import { Ionicons } from '@expo/vector-icons';
import React,{ useEffect,useMemo,useState } from 'react';
import { Alert,FlatList,ScrollView,Text,View,useWindowDimensions } from 'react-native';
import { categoryRepository } from '../../data/category-repository';
import { tagRepository } from '../../data/tag-repository';
import type { Category,LibrarySeries,LibraryTag } from '../../domain/models';
import { BookCover } from '../../ui/components/book-cover';
import { BottomSheet } from '../../ui/components/bottom-sheet';
import { Button } from '../../ui/components/button';
import { EmptyState } from '../../ui/components/empty-state';
import { PressableScale } from '../../ui/components/pressable-scale';
import { Screen } from '../../ui/components/screen';
import { ScreenHeader } from '../../ui/components/screen-header';
import { SectionHeader } from '../../ui/components/section-header';
import { TagChip as BaseTagChip } from '../../ui/components/tag-chip';
import { TextField } from '../../ui/components/text-field';
import { getGridLayout } from '../../ui/layout';
import { useScreenStyles } from '../../ui/screen-styles';
import { useTheme } from '../../ui/theme';
import { IconButton,SeriesCard } from '../shared/library-ui';

type Props = { series: LibrarySeries[]; openSeries: (series: LibrarySeries) => void };
type DisplayCategory = Category & { automatic?: boolean };

function TagChip({ tag, selected, onPress }: { tag: LibraryTag; selected?: boolean; onPress?: () => void }) {
  return <BaseTagChip label={tag.name} author={tag.kind === 'author'} selected={selected} onPress={onPress} />;
}

function CategoryCovers({ category, series }: { category: DisplayCategory; series: LibrarySeries[] }) {
  const matches = series.filter(item => category.tags.some(tag => item.tags.some(t => t.id === tag.id))).slice(0, 3);
  return <View style={{ flexDirection: 'row', width: 76, height: 66, alignItems: 'center' }}>
    {matches.length ? matches.map((item, index) => <BookCover key={item.id} uri={item.coverUri} title={item.title} style={{ width: 40, marginLeft: index ? -22 : 0 }} />) : <BookCover title={category.name} style={{ width: 40 }} />}
  </View>;
}
function AutomaticCategoryTile({ category, series, onPress }: { category: DisplayCategory; series: LibrarySeries[]; onPress: () => void }) {
  const { tokens } = useTheme();
  return <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={'打开分类' + category.name} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: tokens.colors.divider }}>
    <CategoryCovers category={category} series={series} />
    <View style={{ flex: 1 }}><Text style={[tokens.typography.label, { color: tokens.colors.text }]}>{category.name}</Text><Text style={[tokens.typography.caption, { color: tokens.colors.mutedText, marginTop: 4 }]}>{category.bookCount} 部作品</Text></View>
    <Ionicons name="chevron-forward" size={18} color={tokens.colors.mutedText} />
  </PressableScale>;
}

export function CategoriesScreen({ series, openSeries }: Props) {
  const { tokens } = useTheme();
  const { styles, categoryStyles, pageLayoutStyles, uiStyles, categoryUiStyles } = useScreenStyles();
  const { isDark } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const grid = getGridLayout(width, fontScale);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<LibraryTag[]>([]);
  const [selected, setSelected] = useState<DisplayCategory>();
  const [editor, setEditor] = useState<Category | null | undefined>(undefined);
  const [name, setName] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    const [nextCategories, nextTags] = await Promise.all([categoryRepository.listCategories(), tagRepository.listTags()]);
    setCategories(nextCategories);
    setTags(nextTags.filter(tag => tag.sources.length > 0));
    if (selected && !selected.automatic) setSelected(nextCategories.find(item => item.id === selected.id));
  };

  useEffect(() => { void reload().catch(console.warn); }, [series]);

  const automaticCategories = useMemo<DisplayCategory[]>(() => tags.map(tag => ({
    id: -tag.id,
    name: tag.name,
    tags: [tag],
    bookCount: series.filter(item => item.tags.some(itemTag => itemTag.id === tag.id)).length,
    createdAt: 0,
    updatedAt: 0,
    automatic: true,
  })).sort((left, right) => right.bookCount - left.bookCount || left.name.localeCompare(right.name, 'zh-CN')), [series, tags]);

  const automaticAuthors = automaticCategories.filter(category => category.tags[0]?.kind === 'author');
  const automaticTags = automaticCategories.filter(category => category.tags[0]?.kind !== 'author');

  const openEditor = (category?: Category) => {
    setEditor(category ?? null);
    setName(category?.name ?? '');
    setSelectedTagIds(category?.tags.map(tag => tag.id) ?? []);
  };

  const save = async () => {
    setSaving(true);
    try {
      if (editor?.id) await categoryRepository.updateCategory(editor.id, name, selectedTagIds);
      else await categoryRepository.createCategory(name, selectedTagIds);
      setEditor(undefined);
      await reload();
    } catch (error) {
      Alert.alert('保存失败', error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const remove = (category: Category) => Alert.alert(
    '删除分类',
    `确定删除“${category.name}”吗？`,
    [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => categoryRepository.deleteCategory(category.id).then(reload).catch(error => Alert.alert('删除失败', String(error))) },
    ],
  );

  const selectedSeries = useMemo(
    () => selected ? series.filter(item => selected.tags.some(tag => item.tags.some(itemTag => itemTag.id === tag.id))) : [],
    [selected, series],
  );

  const renderCustomCategory = (category: Category) => (
    <View key={category.id} style={[categoryStyles.customCategoryCard, isDark && categoryStyles.customCategoryCardDark]}>
      <View style={styles.categoryCardTop}>
        <PressableScale onPress={() => setSelected(category)} accessibilityRole="button" accessibilityLabel={`打开分类${category.name}`} style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <CategoryCovers category={category} series={series} />
          <View style={pageLayoutStyles.rowContent}>
            <Text numberOfLines={1} style={[styles.rowTitle, isDark && styles.textPrimaryDark]}>{category.name}</Text>
            <Text style={[styles.meta, isDark && styles.textMutedDark]}>{category.bookCount} 部作品</Text>
          </View>
        </PressableScale>
        <IconButton name="ellipsis-horizontal" label={'管理分类' + category.name} onPress={() => Alert.alert(category.name, undefined, [{ text: '编辑分类', onPress: () => openEditor(category) }, { text: '删除分类', style: 'destructive', onPress: () => remove(category) }, { text: '取消', style: 'cancel' }])} />
      </View>
      <View style={styles.tagList}>{category.tags.length ? category.tags.map(tag => <TagChip key={tag.id} tag={tag} />) : <Text style={[styles.meta, isDark && styles.textMutedDark]}>未绑定标签</Text>}</View>
    </View>
  );

  const selectedContent = selected ? <Screen safeArea={false}>
    <FlatList
      key={grid.columns}
      data={selectedSeries}
      numColumns={grid.columns}
      keyExtractor={item => String(item.id)}
      contentContainerStyle={[styles.page, isDark && styles.pageDark, { paddingHorizontal: grid.pageInset }]}
      columnWrapperStyle={grid.columns > 1 ? { gap: grid.gutter } : undefined}
      ListHeaderComponent={<View>
        <ScreenHeader title={selected.name} back={() => setSelected(undefined)} trailing={!selected.automatic && <IconButton name="create-outline" label="编辑分类" onPress={() => openEditor(selected)} />} />
        <Text style={[styles.meta, categoryUiStyles.categoryDetailCount, isDark && styles.textMutedDark]}>{selectedSeries.length} 部作品</Text>
      </View>}
      renderItem={({ item, index }) => <View style={{ width: grid.cardWidth }}><SeriesCard series={item} index={index} onPress={() => openSeries(item)} /></View>}
      ListEmptyComponent={<EmptyState icon="albums-outline" title="这个分类还没有作品" />}
    />
  </Screen> : null;

  const hasAnyCategory = categories.length > 0 || automaticCategories.length > 0;

  return <Screen safeArea={false}>
    {selected ? selectedContent : <ScrollView contentContainerStyle={[styles.page, isDark && styles.pageDark, { paddingHorizontal: grid.pageInset }]}>
      <ScreenHeader title="分类" />

      {categories.length > 0 && <SectionHeader title="自定义分类" />}
      {categories.map(renderCustomCategory)}

      {automaticAuthors.length > 0 && <SectionHeader title="作者" />}
      {automaticAuthors.length > 0 && <View style={{ gap: 0 }}>{automaticAuthors.map(category => <AutomaticCategoryTile key={category.id} category={category} series={series} onPress={() => setSelected(category)} />)}</View>}
      {automaticTags.length > 0 && <SectionHeader title="标签" />}
      {automaticTags.length > 0 && <View style={{ gap: 0 }}>{automaticTags.map(category => <AutomaticCategoryTile key={category.id} category={category} series={series} onPress={() => setSelected(category)} />)}</View>}

      {!hasAnyCategory && <EmptyState icon="albums-outline" title="还没有分类" description="创建分类，或先给作品添加作者和标签。" />}

      <Button label="添加分类" variant="secondary" icon="add-circle-outline" onPress={() => openEditor()} style={{ marginTop: 16 }} />
    </ScrollView>}

    <BottomSheet visible={editor !== undefined} onClose={() => setEditor(undefined)} maxHeight="82%">
      <ScrollView keyboardShouldPersistTaps="handled" style={{ flexShrink: 1 }}>
      <ScreenHeader title={editor?.id ? '编辑分类' : '新建分类'} trailing={<IconButton name="close" label="关闭分类编辑" onPress={() => setEditor(undefined)} />} />
      <TextField label="分类名称" value={name} onChangeText={setName} placeholder="例如：正在阅读" />
      <Text style={[styles.settingSection, isDark && uiStyles.settingSectionDark]}>绑定标签（命中任意一个即可）</Text>
      <View style={styles.tagList}>{tags.map(tag => <TagChip key={tag.id} tag={tag} selected={selectedTagIds.includes(tag.id)} onPress={() => setSelectedTagIds(current => current.includes(tag.id) ? current.filter(id => id !== tag.id) : [...current, tag.id])} />)}</View>
      {tags.length === 0 && <Text style={[styles.meta, isDark && styles.textMutedDark]}>先在作品详情中添加标签</Text>}
      <Button label="保存分类" loading={saving} disabled={!name.trim()} onPress={save} style={{ marginTop: 16 }} />
      </ScrollView>
    </BottomSheet>
  </Screen>;
}
