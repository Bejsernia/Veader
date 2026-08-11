import type { LibraryQuery, ProgressUpdate, RefreshResult } from './models';
import type { LibrarySeries, StoredChapter, StoredSource } from '../library';

export interface LibraryRepository {
  initialize(): Promise<void>;
  listSeries(query?: LibraryQuery): Promise<LibrarySeries[]>;
  listChapters(seriesId: number): Promise<StoredChapter[]>;
  configureRoot(): Promise<LibrarySeries[]>;
  refreshAll(): Promise<LibrarySeries[]>;
  refreshSource(sourceId: number): Promise<RefreshResult>;
  ensureChapterLocal(chapter: StoredChapter): Promise<StoredChapter>;
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
  save(type: StoredSource['type'], name: string, endpoint: string, bookCount?: number): Promise<void>;
  rename(sourceId: number, name: string): Promise<void>;
  remove(sourceId: number): Promise<void>;
  setEnabled(sourceId: number, enabled: boolean): Promise<void>;
}
