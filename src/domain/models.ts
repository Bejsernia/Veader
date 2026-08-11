import type { BookFormat, LibrarySeries, StoredChapter, StoredSource } from '../library';

export type { BookFormat, LibrarySeries, StoredChapter, StoredSource };

export type LibraryQuery = {
  search?: string;
  sourceId?: number;
  sort?: 'updated' | 'title' | 'progress';
};

export type RefreshResult = {
  sourceId: number;
  seriesCount: number;
  chapterCount: number;
  added: number;
  updated: number;
  removed: number;
  errors: string[];
};

export type ProgressUpdate = {
  chapter: StoredChapter;
  progress: number;
  location: string;
};

export type ContentLocator = {
  uri: string;
  format: BookFormat;
  title?: string;
  author?: string;
  sourceId?: number;
  remotePath?: string;
  fingerprint?: string;
};

export type ContentInfo = {
  title: string;
  author: string;
  pageCount: number;
  direction: 'ltr' | 'rtl';
};

export type OpenOptions = {
  sessionId: string;
  targetWidth?: number;
};

export type PageOptions = {
  targetWidth: number;
};

export type PageResult = {
  index: number;
  uri: string;
  width?: number;
  height?: number;
};

export type SourceSnapshot = {
  source: StoredSource;
  entries: Array<{
    name: string;
    path: string;
    size: number;
    modifiedAt?: number;
    format: BookFormat;
  }>;
};
