import type { StoredChapter } from '../domain/models';

export function orderedChapters(chapters: StoredChapter[]): StoredChapter[] {
  return [...chapters].sort((left, right) => {
    const numberDifference = left.chapterNumber - right.chapterNumber;
    if (numberDifference !== 0) return numberDifference;
    const nameDifference = left.originalName.localeCompare(right.originalName);
    return nameDifference !== 0 ? nameDifference : left.id - right.id;
  });
}

export function getAdjacentChapter(chapters: StoredChapter[], currentId: number, delta: -1 | 1): StoredChapter | undefined {
  const ordered = orderedChapters(chapters);
  const index = ordered.findIndex(chapter => chapter.id === currentId);
  if (index < 0) return undefined;
  return ordered[index + delta];
}
