import React, { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Category, LibrarySeries, LibraryTag } from '../../domain/models';
import { categoryRepository } from '../../data/category-repository';
import { tagRepository } from '../../data/tag-repository';
import { BottomSheet } from '../../ui/components/bottom-sheet';
import { BookCard } from '../../ui/components/book-card';
import { PressableScale } from '../../ui/components/pressable-scale';
import { getGridLayout } from '../../ui/layout';
import { styles, layoutStyles, pageLayoutStyles, uiStyles } from '../../ui/legacy-styles';
import { useTheme } from '../../ui/theme';
import { SeriesProgress, IconButton } from '../shared/library-ui';

type Props = { series: LibrarySeries[]; openSeries: (series: LibrarySeries) => void };
type DisplayCategory = Category & { automatic?: boolean };

function TagChip({ tag, selected, onPress }: { tag: LibraryTag; selected?: boolean; onPress?: () => void }) {
  const { isDark } = useTheme();
  return <PressableScale onPress={onPress} accessibilityRole={onPress ? 'button' : undefined} style={[styles.tagChip, selected && styles.tagChipActive, isDark && styles.tagChipDark, isDark && selected && styles.tagChipActiveDark]}>
    <Ionicons name={tag.kind === 'author' ? 'person-outline' : 'pricetag-outline'} size={13} color={selected ? '#fff' : isDark ? '#C8B9FF' : '#7257E7'} />
    <Text numberOfLines={1} style={[styles.tagChipText, selected && styles.tagChipTextActive, isDark && !selected && styles.textMutedDark]}>{tag.name}</Text>
  </PressableScale>;
}

function CategoryIcon({ category, isDark }: { category: DisplayCategory; isDark: boolean }) {
  const tag = category.tags[0];
  return <View style={[styles.categoryIcon, isDark && styles.scanCardDark]}>
    <Ionicons name={category.automatic && tag?.kind === 'author' ? 'person-outline' : 'albums-outline'} size={22} color={isDark ? '#C8B9FF' : '#7257E7'} />
  </View>;
}

export function CategoriesScreen({ series, openSeries }: Props) {
  const { isDark } = useTheme();
  const { width } = useWindowDimensions();
  const grid = getGridLayout(width);
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
  })), [series, tags]);

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

  const renderAutomaticCategory = (category: DisplayCategory) => (
    <PressableScale key={category.id} onPress={() => setSelected(category)} style={[styles.categoryCard, isDark && styles.cardDark, { width: '48%', marginTop: 0, padding: 12, backgroundColor: isDark ? '#211C29' : '#FAF8FF', borderWidth: 1, borderColor: isDark ? '#3F3558' : '#E7DFFF' }]}>
      <View style={styles.categoryCardTop}>
        <CategoryIcon category={category} isDark={isDark} />
        <View style={pageLayoutStyles.rowContent}>
          <Text numberOfLines={1} style={[styles.rowTitle, isDark && styles.textPrimaryDark]}>{category.name}</Text>
          <Text style={[styles.meta, isDark && styles.textMutedDark]}>{category.tags[0]?.kind === 'author' ? '作者' : '标签'} · {category.bookCount} 部作品</Text>
        </View>
        <Ionicons name="chevron-forward" size={19} color={isDark ? '#B9A5FF' : '#9A86E8'} />
      </View>
    </PressableScale>
  );

  const renderCustomCategory = (category: Category) => (
    <View key={category.id} style={[styles.categoryCard, isDark && styles.cardDark]}>
      <View style={styles.categoryCardTop}>
        <PressableScale onPress={() => setSelected(category)} accessibilityRole="button" accessibilityLabel={`打开分类${category.name}`} style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <CategoryIcon category={category} isDark={isDark} />
          <View style={pageLayoutStyles.rowContent}>
            <Text numberOfLines={1} style={[styles.rowTitle, isDark && styles.textPrimaryDark]}>{category.name}</Text>
            <Text style={[styles.meta, isDark && styles.textMutedDark]}>{category.bookCount} 部作品</Text>
          </View>
        </PressableScale>
        <Pressable accessibilityRole="button" accessibilityLabel={`编辑${category.name}`} onPress={() => openEditor(category)} style={styles.iconAction}>
          <Ionicons name="create-outline" size={19} color={isDark ? '#C8B9FF' : '#7257E7'} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`删除${category.name}`} onPress={() => remove(category)} style={styles.iconAction}>
          <Ionicons name="trash-outline" size={19} color={isDark ? '#F5A9B7' : '#C84459'} />
        </Pressable>
      </View>
      <View style={styles.tagList}>{category.tags.length ? category.tags.map(tag => <TagChip key={tag.id} tag={tag} />) : <Text style={[styles.meta, isDark && styles.textMutedDark]}>未绑定 tag</Text>}</View>
    </View>
  );

  if (selected) return <SafeAreaView style={[styles.safe, isDark && styles.safeDark]}>
    <FlatList
      data={selectedSeries}
      numColumns={grid.columns}
      keyExtractor={item => String(item.id)}
      contentContainerStyle={[styles.page, isDark && styles.pageDark, { paddingHorizontal: grid.pageInset }]}
      columnWrapperStyle={{ gap: grid.gutter }}
      ListHeaderComponent={<View>
        <View style={[styles.header, pageLayoutStyles.pageHeader]}>
          <IconButton name="chevron-back" label="返回分类" onPress={() => setSelected(undefined)} />
          <Text numberOfLines={1} style={[styles.navTitle, isDark && styles.textPrimaryDark]}>{selected.name}</Text>
          {!selected.automatic ? <PressableScale accessibilityRole="button" accessibilityLabel="编辑分类" onPress={() => openEditor(selected)} style={pageLayoutStyles.trailingAction}><Ionicons name="create-outline" size={21} color={isDark ? '#C8B9FF' : '#7257E7'} /></PressableScale> : <View style={pageLayoutStyles.headerSpacer} />}
        </View>
        <View style={styles.tagList}>{selected.tags.map(tag => <TagChip key={tag.id} tag={tag} />)}</View>
        <Text style={[styles.meta, isDark && styles.textMutedDark]}>{selectedSeries.length} 部作品</Text>
      </View>}
      renderItem={({ item, index }) => <View style={{ width: grid.cardWidth, marginBottom: grid.gutter }}><BookCard title={item.title} author={item.author} coverUri={item.coverUri} index={index} onPress={() => openSeries(item)} footer={<SeriesProgress series={item} compact />} /></View>}
      ListEmptyComponent={<View style={styles.empty}><Ionicons name="albums-outline" size={36} color="#B2ADB7" /><Text style={[styles.meta, isDark && styles.textMutedDark]}>这个分类还没有作品</Text></View>}
    />
  </SafeAreaView>;

  const hasAnyCategory = categories.length > 0 || automaticCategories.length > 0;

  return <SafeAreaView style={[styles.safe, isDark && styles.safeDark]}>
    <ScrollView contentContainerStyle={[styles.page, isDark && styles.pageDark]}>
      <View style={[styles.header, pageLayoutStyles.pageHeader]}>
        <Text style={[styles.title, isDark && styles.textPrimaryDark]}>分类</Text>
        <View style={layoutStyles.libraryHeaderActions}><View style={pageLayoutStyles.headerSpacer} /></View>
      </View>
      <Text style={[styles.meta, isDark && styles.textMutedDark]}>按作者、题材和自定义 tag 浏览作品</Text>

      {categories.length > 0 && <Text style={[styles.sectionTitle, isDark && styles.textPrimaryDark, { marginTop: 24 }]}>自定义分类</Text>}
      {categories.map(renderCustomCategory)}

      {automaticCategories.length > 0 && <Text style={[styles.sectionTitle, isDark && styles.textPrimaryDark, { marginTop: categories.length ? 26 : 24 }]}>自动分类</Text>}
      {automaticAuthors.length > 0 && <Text style={[styles.settingSection, isDark && uiStyles.settingSectionDark, { marginTop: 14 }]}>作者</Text>}
      {automaticAuthors.length > 0 && <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10, marginTop: 10 }}>{automaticAuthors.map(renderAutomaticCategory)}</View>}
      {automaticTags.length > 0 && <Text style={[styles.settingSection, isDark && uiStyles.settingSectionDark, { marginTop: 18 }]}>标签</Text>}
      {automaticTags.length > 0 && <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10, marginTop: 10 }}>{automaticTags.map(renderAutomaticCategory)}</View>}

      {!hasAnyCategory && <View style={styles.empty}>
        <Ionicons name="albums-outline" size={38} color="#B2ADB7" />
        <Text style={[styles.rowTitle, isDark && styles.textPrimaryDark]}>还没有分类</Text>
        <Text style={[styles.meta, isDark && styles.textMutedDark]}>创建一个分类，或先给作品添加作者和 tag</Text>
      </View>}

      <PressableScale accessibilityRole="button" accessibilityLabel="添加分类" onPress={() => openEditor()} style={[styles.dashedButton, { borderStyle: 'solid', borderWidth: 0, backgroundColor: isDark ? '#30274A' : '#EEE9FF', height: 54, borderRadius: 16, marginTop: hasAnyCategory ? 18 : 6 }]}>
        <Ionicons name="add-circle-outline" size={21} color={isDark ? '#C8B9FF' : '#7257E7'} />
        <Text style={[styles.dashedText, isDark && styles.textPrimaryDark]}>添加分类</Text>
      </PressableScale>
    </ScrollView>

    <BottomSheet visible={editor !== undefined} onClose={() => setEditor(undefined)} maxHeight="82%">
      <View style={styles.sheetHeading}>
        <Text style={[styles.sheetTitle, isDark && styles.textPrimaryDark]}>{editor?.id ? '编辑分类' : '新建分类'}</Text>
        <PressableScale disabled={saving} onPress={save} style={{ minWidth: 44, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' }}>
          <Text style={styles.done}>{saving ? '保存中…' : '保存'}</Text>
        </PressableScale>
      </View>
      <Text style={[styles.settingSection, isDark && uiStyles.settingSectionDark]}>分类名称</Text>
      <TextInput value={name} onChangeText={setName} placeholder="例如：正在阅读" placeholderTextColor={isDark ? '#B8B1C2' : '#8A8691'} style={[styles.input, isDark && uiStyles.inputDark]} />
      <Text style={[styles.settingSection, isDark && uiStyles.settingSectionDark]}>绑定 tag（命中任意一个即可）</Text>
      <View style={styles.tagList}>{tags.map(tag => <TagChip key={tag.id} tag={tag} selected={selectedTagIds.includes(tag.id)} onPress={() => setSelectedTagIds(current => current.includes(tag.id) ? current.filter(id => id !== tag.id) : [...current, tag.id])} />)}</View>
      {tags.length === 0 && <Text style={[styles.meta, isDark && styles.textMutedDark]}>先在作品详情中添加 tag</Text>}
    </BottomSheet>
  </SafeAreaView>;
}
