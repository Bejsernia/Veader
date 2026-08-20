import type { StoredChapter } from '../domain/models';
import { getAdjacentChapter, orderedChapters } from './chapter-navigation';

function chapter(id: number, chapterNumber: number, originalName: string): StoredChapter {
  return {
    id,
    seriesId: 7,
    chapterNumber,
    chapterTitle: originalName,
    title: originalName,
    author: '',
    format: 'epub',
    localUri: `file:///chapter-${id}.epub`,
    originalName,
    fileSize: 1,
    coverUri: null,
    progress: 0,
    currentLocation: null,
    addedAt: 0,
    updatedAt: 0,
  };
}

describe('chapter navigation', () => {
  const chapters = [chapter(3, 3, '卷03'), chapter(1, 1, '卷01'), chapter(2, 2, '卷02')];

  it('orders chapters before selecting a neighbor', () => {
    expect(orderedChapters(chapters).map(item => item.id)).toEqual([1, 2, 3]);
    expect(getAdjacentChapter(chapters, 1, 1)?.id).toBe(2);
    expect(getAdjacentChapter(chapters, 3, -1)?.id).toBe(2);
  });

  it('returns no chapter beyond either edge', () => {
    expect(getAdjacentChapter(chapters, 1, -1)).toBeUndefined();
    expect(getAdjacentChapter(chapters, 3, 1)).toBeUndefined();
    expect(getAdjacentChapter(chapters, 999, 1)).toBeUndefined();
  });
});
