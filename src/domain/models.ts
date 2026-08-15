export type BookFormat = 'epub' | 'mobi' | 'pdf';

export type StoredBook = {
  id: number;
  title: string;
  author: string;
  format: BookFormat;
  localUri: string;
  originalName: string;
  fileSize: number;
  coverUri: string | null;
  progress: number;
  currentLocation: string | null;
  addedAt: number;
  updatedAt: number;
  sourceId?: number;
  remotePath?: string;
  remoteLocator?: string;
  remoteSize?: number;
  remoteModifiedAt?: number;
  contentFingerprint?: string;
  pageCount?: number;
  scanStatus?: 'indexed' | 'cached' | 'ready' | 'error';
  lastOpenedAt?: number;
};

export type StoredSource = {
  id: number;
  type: 'local' | 'smb' | 'ftp';
  name: string;
  endpoint: string;
  enabled: boolean;
  bookCount: number;
  createdAt: number;
  updatedAt?: number;
};

export type LibrarySeries = {
  id: number;
  title: string;
  author: string;
  sourceUri: string;
  sourceId?: number;
  coverUri: string | null;
  progress: number;
  currentChapterId: number | null;
  currentChapterTitle: string | null;
  currentChapterNumber: number | null;
  chapterSearchText: string;
  chapterCount: number;
  updatedAt: number;
};

export type StoredChapter = StoredBook & {
  seriesId: number;
  chapterNumber: number;
  chapterTitle: string;
};

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
