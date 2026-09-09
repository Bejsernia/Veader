import type { StoredBook } from '../domain/models';
import type { ContentSession } from '../content/content-loader';

export type PrefetchEdge = 'start' | 'end';
export type OpenChapterForPrefetch = (book: StoredBook, sessionId: string) => Promise<ContentSession>;

type CachedChapter = {
  key: string;
  session: ContentSession;
  lastUsedAt: number;
};

type PendingPrefetch = {
  key: string;
  promise: Promise<void>;
};

const MAX_CACHED_CHAPTERS = 2;
let sessionSequence = 0;

function chapterKey(book: StoredBook) {
  return [book.id, book.localUri, book.contentFingerprint || `${book.fileSize}:${book.updatedAt}`].join('|');
}

function edgePages(pageCount: number, edge: PrefetchEdge) {
  if (pageCount <= 1) return [0];
  const last = pageCount - 1;
  const pages = edge === 'start'
    ? [0, 1, 2, 3]
    : [last, last - 1, last - 2, last - 3];
  return [...new Set(pages.filter(index => index >= 0 && index < pageCount))];
}

/**
 * Keeps a very small number of adjacent chapter sessions warm. The session is
 * transferred to ReaderController when that chapter is opened, so the
 * prefetched files and native archive handle are reused instead of being
 * thrown away and opened a second time.
 */
export class ChapterPrefetcher {
  private readonly entries = new Map<number, CachedChapter>();
  private readonly pending = new Map<number, PendingPrefetch>();
  private generation = 0;

  async prefetch(book: StoredBook, edge: PrefetchEdge, targetWidth: number, openChapter: OpenChapterForPrefetch): Promise<void> {
    const generation = this.generation;
    const key = chapterKey(book);
    const cached = this.entries.get(book.id);
    if (cached?.key === key) {
      cached.lastUsedAt = Date.now();
      return;
    }
    if (cached) await this.closeEntry(book.id);
    if (generation !== this.generation) return;

    const existing = this.pending.get(book.id);
    if (existing?.key === key) return existing.promise;
    if (existing) {
      await existing.promise.catch(() => undefined);
      if (generation !== this.generation) return;
      return this.prefetch(book, edge, targetWidth, openChapter);
    }

    const promise = this.start(book, edge, targetWidth, openChapter, key, generation);
    this.pending.set(book.id, { key, promise });
    try {
      await promise;
    } finally {
      if (this.pending.get(book.id)?.promise === promise) this.pending.delete(book.id);
    }
  }

  async take(book: StoredBook): Promise<ContentSession | undefined> {
    const generation = this.generation;
    const key = chapterKey(book);
    const existing = this.pending.get(book.id);
    if (existing?.key === key) await existing.promise.catch(() => undefined);
    if (generation !== this.generation) return undefined;
    const cached = this.entries.get(book.id);
    if (!cached) return undefined;
    if (cached.key !== key) {
      await this.closeEntry(book.id);
      return undefined;
    }
    this.entries.delete(book.id);
    return cached.session;
  }

  async clear() {
    this.generation += 1;
    // In-flight native work may not support abort. Its generation check closes
    // the session when it settles without publishing back into this cache.
    this.pending.clear();
    const ids = [...this.entries.keys()];
    await Promise.all(ids.map(id => this.closeEntry(id)));
  }

  get size() {
    return this.entries.size;
  }

  private async start(book: StoredBook, edge: PrefetchEdge, targetWidth: number, openChapter: OpenChapterForPrefetch, key: string, generation: number) {
    const sessionId = `prefetch-${book.id}-${Date.now()}-${sessionSequence += 1}`;
    let session: ContentSession | undefined;
    try {
      session = await openChapter(book, sessionId);
      if (generation !== this.generation) { await session.close(); return; }
      await session.prefetch(edgePages(session.comic.pages.length, edge), { targetWidth });
      if (generation !== this.generation) { await session.close(); return; }
      const previous = this.entries.get(book.id);
      if (previous) await previous.session.close().catch(() => undefined);
      if (generation !== this.generation) { await session.close(); return; }
      this.entries.set(book.id, { key, session, lastUsedAt: Date.now() });
      await this.evictOldEntries(book.id);
    } catch (reason) {
      await session?.close().catch(() => undefined);
      throw reason;
    }
  }

  private async evictOldEntries(protectedId: number) {
    while (this.entries.size > MAX_CACHED_CHAPTERS) {
      const oldest = [...this.entries.entries()]
        .filter(([id]) => id !== protectedId)
        .sort(([, left], [, right]) => left.lastUsedAt - right.lastUsedAt)[0];
      if (!oldest) return;
      await this.closeEntry(oldest[0]);
    }
  }

  private async closeEntry(id: number) {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.entries.delete(id);
    await entry.session.close().catch(() => undefined);
  }
}

export const chapterPrefetcher = new ChapterPrefetcher();
