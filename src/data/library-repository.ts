import {
  clearSeriesHistory,
  chooseSeriesCover,
  configureLibraryRoot,
  deleteSource,
  ensureChapterLocal,
  initializeLibrary,
  listChapters,
  listSeries,
  listSources,
  renameSource,
  refreshAllLibraries,
  recordChapterContentInfo,
  saveSource,
  setSeriesCover,
  setSourceEnabled,
  updateChapterProgress,
} from '../library';
import type { LibraryRepository, ProgressRepository, SourceRepository } from '../domain/repositories';
import type { LibraryQuery, ProgressUpdate, RefreshResult } from '../domain/models';

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
    const beforeSeries = await listSeries({ fast: true });
    await refreshAllLibraries();
    const afterSeries = await listSeries({ fast: true });
    const afterSource = (await listSources()).find(item => item.id === sourceId);
    return {
      sourceId,
      seriesCount: afterSeries.filter(item => item.sourceUri.startsWith(source.endpoint)).length,
      chapterCount: afterSource?.bookCount ?? 0,
      added: Math.max(0, afterSeries.length - beforeSeries.length),
      updated: 0,
      removed: Math.max(0, beforeSeries.length - afterSeries.length),
      errors: [],
    };
  },
};

export const progressRepository: ProgressRepository = {
  saveProgress({ chapter, progress, location }: ProgressUpdate) {
    return updateChapterProgress(chapter, progress, location);
  },
  clearHistory(seriesId) {
    return clearSeriesHistory(seriesId);
  },
};

export const sourceRepository: SourceRepository = {
  list: listSources,
  save: saveSource,
  rename: renameSource,
  remove: deleteSource,
  setEnabled: setSourceEnabled,
};
