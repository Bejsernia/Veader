import type { Category, LibraryQuery, LibrarySeries, LibraryTag, PageViewedEvent, ProgressUpdate, ReadingStatsRange, ReadingStatsSummary, RefreshResult, StartReadingSession, StoredChapter, StoredSource, TagKind } from './models';

export interface LibraryRepository {
  initialize(): Promise<void>;
  listSeries(query?: LibraryQuery): Promise<LibrarySeries[]>;
  listChapters(seriesId: number): Promise<StoredChapter[]>;
  configureRoot(): Promise<LibrarySeries[]>;
  refreshAll(): Promise<LibrarySeries[]>;
  refreshSource(sourceId: number): Promise<RefreshResult>;
  acquireChapterLocal(chapter: StoredChapter): Promise<{ chapter: StoredChapter; release: () => void }>;
  recordContentInfo(chapterId: number, pageCount: number, status?: 'ready' | 'error'): Promise<void>;
  setSeriesCover(seriesId: number, coverUri: string): Promise<string>;
  chooseSeriesCover(seriesId: number): Promise<string | null>;
}

export interface ProgressRepository {
  saveProgress(input: ProgressUpdate): Promise<void>;
  clearHistory(seriesId: number): Promise<void>;
}

export interface SourceRepository {
  list(): Promise<StoredSource[]>;
  save(type: StoredSource['type'], name: string, endpoint: string, bookCount?: number): Promise<number>;
  rename(sourceId: number, name: string): Promise<void>;
  remove(sourceId: number): Promise<void>;
  setEnabled(sourceId: number, enabled: boolean): Promise<void>;
}

export interface TagRepository {
  listTags(): Promise<LibraryTag[]>;
  listSeriesTags(seriesId: number): Promise<LibraryTag[]>;
  addSeriesTag(seriesId: number, name: string, kind?: TagKind): Promise<LibraryTag>;
  removeSeriesTag(seriesId: number, tagId: number, source?: 'manual' | 'metadata'): Promise<void>;
  syncAuthorTag(seriesId: number, author: string): Promise<void>;
}

export interface CategoryRepository {
  listCategories(): Promise<Category[]>;
  createCategory(name: string, tagIds: number[]): Promise<number>;
  updateCategory(id: number, name: string, tagIds: number[]): Promise<void>;
  deleteCategory(id: number): Promise<void>;
  listSeriesByCategory(categoryId: number): Promise<LibrarySeries[]>;
}

export interface StatsRepository {
  recoverOpenSessions(now?: number): Promise<void>;
  startSession(input: StartReadingSession): Promise<number>;
  recordPageViewed(input: PageViewedEvent): Promise<void>;
  pauseSession(sessionId: number, now?: number): Promise<void>;
  resumeSession(sessionId: number, now?: number): Promise<void>;
  finishSession(sessionId: number, now?: number): Promise<void>;
  getSummary(range: ReadingStatsRange): Promise<ReadingStatsSummary>;
}
