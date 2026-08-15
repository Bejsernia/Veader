import {
  chooseSeriesCover,
  configureLibraryRoot,
  ensureChapterLocal,
  initializeLibrary,
  listChapters,
  listSeries,
  listSources,
  refreshAllLibraries,
  recordChapterContentInfo,
  setSeriesCover,
} from '../library';
import type { LibraryRepository } from '../domain/repositories';
import type { LibraryQuery, RefreshResult } from '../domain/models';
import { progressRepository } from './progress-repository';
import { sourceRepository } from './source-repository';

export const libraryRepository: LibraryRepository = {
  initialize: initializeLibrary,
  async listSeries(query) {
    const rows = await listSeries({ refreshMetadata: false, fast: true });
    let filtered = rows;
    if (query?.sourceId !== undefined) {
      const source = (await listSources()).find(item => item.id === query.sourceId);
      if (source) filtered = filtered.filter(row => row.sourceUri.startsWith(source.endpoint));
    }
    if (query?.sort === 'title') filtered = [...filtered].sort((a, b) => a.title.localeCompare(b.title));
    if (query?.sort === 'progress') filtered = [...filtered].sort((a, b) => b.progress - a.progress);
    if (!query?.search) return filtered;
    const search = query.search.trim().toLocaleLowerCase();
    if (!search) return filtered;
    return filtered.filter(row => `${row.title} ${row.author} ${row.chapterSearchText}`.toLocaleLowerCase().includes(search));
  },
  async listChapters(seriesId) {
    return listChapters(seriesId);
  },
  configureRoot: configureLibraryRoot,
  refreshAll: refreshAllLibraries,
  ensureChapterLocal,
  recordContentInfo: recordChapterContentInfo,
  setSeriesCover,
  chooseSeriesCover,
  async refreshSource(sourceId): Promise<RefreshResult> {
    const before = await listSources();
    const source = before.find(item => item.id === sourceId);
    if (!source) throw new Error('漫画来源不存在');
    const beforeSeries = (await listSeries({ fast: true })).filter(item => item.sourceUri.startsWith(source.endpoint));
    await refreshAllLibraries(sourceId);
    const afterSeries = (await listSeries({ fast: true })).filter(item => item.sourceUri.startsWith(source.endpoint));
    const afterSource = (await listSources()).find(item => item.id === sourceId);
    const beforeIds = new Set(beforeSeries.map(item => item.id));
    const afterIds = new Set(afterSeries.map(item => item.id));
    return {
      sourceId,
      seriesCount: afterSeries.length,
      chapterCount: afterSource?.bookCount ?? 0,
      added: afterSeries.filter(item => !beforeIds.has(item.id)).length,
      updated: afterSeries.filter(item => beforeIds.has(item.id) && item.updatedAt > (beforeSeries.find(previous => previous.id === item.id)?.updatedAt ?? 0)).length,
      removed: beforeSeries.filter(item => !afterIds.has(item.id)).length,
      errors: [],
    };
  },
};

export { progressRepository, sourceRepository };
