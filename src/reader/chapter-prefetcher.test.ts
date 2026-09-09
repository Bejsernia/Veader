import type { StoredBook } from '../domain/models';
import type { ContentSession } from '../content/content-loader';
import { ChapterPrefetcher } from './chapter-prefetcher';

function book(id: number): StoredBook {
  return {
    id,
    title: `章节${id}`,
    author: '',
    format: 'epub',
    localUri: `file:///chapter-${id}.epub`,
    originalName: `chapter-${id}.epub`,
    fileSize: 100,
    coverUri: null,
    progress: 0,
    currentLocation: null,
    addedAt: 0,
    updatedAt: 1,
  };
}

function session(pageCount: number, prefetchCalls: number[][], closed: number[]): ContentSession {
  return {
    comic: { title: '测试', author: '', direction: 'ltr', pages: Array.from({ length: pageCount }, (_, index) => ({ index, imageUri: `entry-${index}` })) },
    info: { title: '测试', author: '', direction: 'ltr', pageCount },
    getPage: async index => ({ index, uri: `file:///page-${index}.jpg` }),
    prefetch: async indexes => { prefetchCalls.push(indexes); },
    retry: async index => ({ index, uri: `file:///page-${index}.jpg` }),
    close: async () => { closed.push(1); },
  };
}

describe('ChapterPrefetcher', () => {
  it('closes pending work after clear without repopulating the cache', async () => {
    const prefetcher = new ChapterPrefetcher();
    const closed: number[] = [];
    const content = session(4, [], closed);
    let finish!: () => void;
    content.prefetch = () => new Promise<void>(resolve => { finish = resolve; });
    const pending = prefetcher.prefetch(book(1), 'start', 1200, async () => content);
    await Promise.resolve();
    await prefetcher.clear();
    finish();
    await pending;
    expect(prefetcher.size).toBe(0);
    expect(closed).toHaveLength(1);
  });

  it('does not let old work replace a new session after clear', async () => {
    const prefetcher = new ChapterPrefetcher();
    const oldClosed: number[] = [];
    let finish!: (value: ContentSession) => void;
    const pending = prefetcher.prefetch(book(1), 'start', 1200, () => new Promise(resolve => { finish = resolve; }));
    await prefetcher.clear();
    const next = session(4, [], []);
    await prefetcher.prefetch(book(1), 'start', 1200, async () => next);
    finish(session(4, [], oldClosed));
    await pending;
    expect(oldClosed).toHaveLength(1);
    await expect(prefetcher.take(book(1))).resolves.toBe(next);
  });

  it('warms the correct edge and transfers the session to the reader', async () => {
    const prefetchCalls: number[][] = [];
    const closed: number[] = [];
    const prefetcher = new ChapterPrefetcher();
    await prefetcher.prefetch(book(1), 'start', 1200, async () => session(4, prefetchCalls, closed));

    expect(prefetchCalls).toEqual([[0, 1, 2, 3]]);
    await expect(prefetcher.take(book(1))).resolves.toBeDefined();
    expect(prefetcher.size).toBe(0);
    expect(closed).toEqual([]);
  });

  it('keeps only two chapter sessions and closes evicted sessions', async () => {
    const prefetchCalls: number[][] = [];
    const closed: number[] = [];
    const prefetcher = new ChapterPrefetcher();
    await prefetcher.prefetch(book(1), 'end', 1200, async () => session(4, prefetchCalls, closed));
    await prefetcher.prefetch(book(2), 'start', 1200, async () => session(4, prefetchCalls, closed));
    await prefetcher.prefetch(book(3), 'start', 1200, async () => session(4, prefetchCalls, closed));

    expect(prefetcher.size).toBe(2);
    expect(closed).toHaveLength(1);
  });
});
