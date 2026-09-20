import React from 'react';
import { FlatList } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SeriesLibrary } from './library/LibraryScreens';
import { CategoriesScreen } from './categories/CategoriesScreen';
const mockWindow = { width: 375, height: 800, scale: 1, fontScale: 1 };
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: () => mockWindow }));
jest.mock('../ui/theme', () => ({ ...jest.requireActual('../ui/theme'), useTheme: () => ({ isDark: false, reducedMotion: true, tokens: jest.requireActual('../ui/theme').lightTokens }) }));
jest.mock('../ui/components/bottom-sheet', () => ({ BottomSheet: ({ visible, children }: any) => visible ? children : null }));
jest.mock('../ui/components/book-card', () => ({ BookCard: () => null }));
jest.mock('../data/category-repository', () => ({ categoryRepository: { listCategories: async () => [{ id: 1, name: '测试分类', tags: [], bookCount: 0 }] } }));
jest.mock('../data/tag-repository', () => ({ tagRepository: { listTags: async () => [] } }));

it('remounts the library grid across column breakpoints without a FlatList invariant', () => {
  const element = <SeriesLibrary series={[]} importing={false} refreshLibraries={jest.fn()} openSeries={jest.fn()} continueSeries={jest.fn()} openSources={jest.fn()} />;
  mockWindow.width = 375;
  const screen = render(element);
  for (const [width, columns] of [[600, 4], [900, 6], [375, 3]] as const) {
    mockWindow.width = width;
    screen.rerender(React.cloneElement(element));
    expect(screen.UNSAFE_getByType(FlatList).props.numColumns).toBe(columns);
  }
});

it('remounts the selected category grid across column breakpoints', async () => {
  mockWindow.width = 375;
  const element = <CategoriesScreen series={[]} openSeries={jest.fn()} />;
  const screen = render(element);
  await waitFor(() => expect(screen.getByLabelText('打开分类测试分类')).toBeTruthy());
  fireEvent.press(screen.getByLabelText('打开分类测试分类'));
  for (const [width, columns] of [[600, 4], [900, 6], [375, 3]] as const) {
    mockWindow.width = width;
    screen.rerender(React.cloneElement(element));
    expect(screen.UNSAFE_getByType(FlatList).props.numColumns).toBe(columns);
  }
});

it('opens the category editor from inside the selected category', async () => {
  const screen = render(<CategoriesScreen series={[]} openSeries={jest.fn()} />);
  await waitFor(() => expect(screen.getByLabelText('打开分类测试分类')).toBeTruthy());
  fireEvent.press(screen.getByLabelText('打开分类测试分类'));
  fireEvent.press(screen.getByLabelText('编辑分类'));
  expect(screen.getByLabelText('分类名称').props.value).toBe('测试分类');
});

it.each([0, 3, 100, 1000])('keeps %i books in a virtualized searchable library', count => {
  mockWindow.width = 390; mockWindow.fontScale = 1;
  const series = Array.from({ length: count }, (_, id) => ({ id, title: '测试作品' + id, author: '作者', tags: [], chapterSearchText: '', sourceUri: '', coverUri: null, progress: 0, currentChapterId: null, currentChapterTitle: null, currentChapterNumber: null, chapterCount: 3, updatedAt: id }));
  const screen = render(<SeriesLibrary series={series} importing={false} refreshLibraries={jest.fn()} openSeries={jest.fn()} continueSeries={jest.fn()} openSources={jest.fn()} />);
  expect(screen.UNSAFE_getByType(FlatList).props.data).toHaveLength(count);
  fireEvent.press(screen.getByLabelText('搜索作品'));
  fireEvent.changeText(screen.getByLabelText('搜索作品'), '没有匹配');
  expect(screen.UNSAFE_getByType(FlatList).props.data).toHaveLength(0);
});

it('switches to one column at large text without columnWrapperStyle', () => {
  mockWindow.width = 390; mockWindow.fontScale = 2;
  const screen = render(<SeriesLibrary series={[]} importing={false} refreshLibraries={jest.fn()} openSeries={jest.fn()} continueSeries={jest.fn()} openSources={jest.fn()} />);
  expect(screen.UNSAFE_getByType(FlatList).props.numColumns).toBe(1);
  expect(screen.UNSAFE_getByType(FlatList).props.columnWrapperStyle).toBeUndefined();
  mockWindow.fontScale = 1;
});
