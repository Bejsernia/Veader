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
import { getDocumentReader } from '../platform/nativeContracts';
import { acquireCacheLease } from '../data/cache-leases';
import { schedulePageCacheTrim, trimSourceCacheToLimit } from '../cache';

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
    const native = getDocumentReader();
    const releaseSource = acquireCacheLease(book.localUri);
    let nativeSessionId: string | undefined;
    let comic: EpubComic;
    try {
      nativeSessionId = native?.openSession
        ? await native.openSession({ uri: book.localUri, format: book.format, sessionId: options.sessionId })
        : undefined;
      comic = book.format === 'epub'
        ? await loadEpubComic(book)
        : book.format === 'mobi'
          ? await loadMobiComic(book, options.sessionId)
          : await loadPdfComic(book);
    } catch (error) {
      releaseSource();
      if (nativeSessionId && native?.closeSession) await native.closeSession(nativeSessionId).catch(() => undefined);
      throw error;
    }
    const info = toInfo(comic);
    const retained = new Map<string, () => void>();
    const pending = new Set<Promise<PageResult>>();
    let closing: Promise<void> | undefined;

    const render = async (index: number, pageOptions: PageOptions): Promise<PageResult> => {
      const page = comic.pages[index];
      if (!page) throw new Error('页面索引无效: ' + index);
      const uri = book.format === 'epub'
        ? await loadEpubPage(book, page, options.sessionId)
        : book.format === 'mobi'
          ? await loadMobiPage(book, page, options.sessionId, pageOptions.targetWidth || options.targetWidth || 1600)
          : await loadPdfPage(book, page, pageOptions.targetWidth || options.targetWidth || 1200);
      if (!retained.has(uri)) retained.set(uri, acquireCacheLease(uri));
      return pageResult(index, uri);
    };
    const getPage = (index: number, pageOptions: PageOptions): Promise<PageResult> => {
      if (closing) return Promise.reject(new Error('阅读会话已关闭'));
      const task = render(index, pageOptions).finally(() => pending.delete(task));
      pending.add(task);
      return task;
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
      close() {
        if (!closing) closing = (async () => {
          try {
            await Promise.allSettled([...pending]);
            if (book.format === 'mobi') await clearMobiSession(options.sessionId);
            if (book.format === 'epub') await clearEpubSession(options.sessionId);
          } finally {
            try { if (nativeSessionId && native?.closeSession) await native.closeSession(nativeSessionId); }
            finally {
              retained.forEach(release => release()); retained.clear(); releaseSource();
              schedulePageCacheTrim();
              void trimSourceCacheToLimit().catch(console.warn);
            }
          }
        })();
        return closing;
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
