import type { StoredBook } from '../library';
import type {
  ContentInfo,
  ContentLocator,
  OpenOptions,
  PageOptions,
  PageResult,
} from '../domain/models';
import {
  clearMobiSession,
  loadEpubComic,
  loadEpubPage,
  loadMobiComic,
  loadMobiPage,
  loadPdfComic,
  loadPdfPage,
} from '../content';
import type { EpubComic } from '../content';
import { clearEpubSession } from '../epub-native';

export type ContentSession = {
  comic: EpubComic;
  info: ContentInfo;
  getPage(index: number, options: PageOptions): Promise<PageResult>;
  prefetch(indexes: number[], options: PageOptions): Promise<void>;
  retry(index: number, options: PageOptions): Promise<PageResult>;
  close(): Promise<void>;
};

export interface ContentLoader {
  canHandle(format: StoredBook['format']): boolean;
  scan(locator: ContentLocator): Promise<ContentInfo>;
  open(locator: ContentLocator, options: OpenOptions): Promise<ContentSession>;
}

function bookFromLocator(locator: ContentLocator): StoredBook {
  return {
    id: 0,
    title: locator.title || locator.uri.split('/').pop() || '未命名文档',
    author: locator.author || '',
    format: locator.format,
    localUri: locator.uri,
    originalName: locator.uri.split('/').pop() || locator.uri,
    fileSize: 0,
    coverUri: null,
    progress: 0,
    currentLocation: null,
    addedAt: 0,
    updatedAt: 0,
    sourceId: locator.sourceId,
    remotePath: locator.remotePath,
    contentFingerprint: locator.fingerprint,
  };
}

function toInfo(comic: EpubComic): ContentInfo {
  return {
    title: comic.title,
    author: comic.author,
    pageCount: comic.pages.length,
    direction: comic.direction,
  };
}

function pageResult(index: number, uri: string): PageResult {
  return { index, uri };
}

/** Adapter boundary for format-specific parsing and page rendering. */
export const contentLoader: ContentLoader = {
  canHandle: format => format === 'epub' || format === 'pdf' || format === 'mobi',

  async scan(locator) {
    const book = bookFromLocator(locator);
    const sessionId = 'scan-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    try {
      const comic = book.format === 'epub'
        ? await loadEpubComic(book)
        : book.format === 'mobi'
          ? await loadMobiComic(book, sessionId)
          : await loadPdfComic(book);
      return toInfo(comic);
    } finally {
      if (book.format === 'mobi') await clearMobiSession(sessionId);
    }
  },

  async open(locator, options) {
    const book = bookFromLocator(locator);
    const comic = book.format === 'epub'
      ? await loadEpubComic(book)
      : book.format === 'mobi'
        ? await loadMobiComic(book, options.sessionId)
        : await loadPdfComic(book);
    const info = toInfo(comic);

    const getPage = async (index: number, pageOptions: PageOptions): Promise<PageResult> => {
      const page = comic.pages[index];
      if (!page) throw new Error('页面索引无效: ' + index);
      const uri = book.format === 'epub'
        ? await loadEpubPage(book, page, options.sessionId)
        : book.format === 'mobi'
          ? await loadMobiPage(book, page, options.sessionId)
          : await loadPdfPage(book, page, pageOptions.targetWidth || options.targetWidth || 1200);
      return pageResult(index, uri);
    };

    return {
      comic,
      info,
      getPage,
      async prefetch(indexes, pageOptions) {
        await Promise.allSettled(indexes.map(index => getPage(index, pageOptions)));
      },
      retry(index, pageOptions) {
        return getPage(index, pageOptions);
      },
      async close() {
        if (book.format === 'mobi') await clearMobiSession(options.sessionId);
        if (book.format === 'epub') await clearEpubSession(options.sessionId);
      },
    };
  },
};

export function contentLocatorFromBook(book: StoredBook): ContentLocator {
  return {
    uri: book.localUri,
    format: book.format,
    title: book.title,
    author: book.author,
    sourceId: book.sourceId,
    remotePath: book.remotePath,
    fingerprint: book.contentFingerprint,
  };
}
