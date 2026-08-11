import { ReaderController } from './reader-controller';
import type { StoredBook } from '../library';
import type { ContentSession } from '../content/content-loader';

function book(): StoredBook {
  return {
    id: 7,
    title: '测试章节',
    author: '',
    format: 'epub',
    localUri: 'file:///test.epub',
    originalName: 'test.epub',
    fileSize: 1,
    coverUri: null,
    progress: 0,
    currentLocation: null,
    addedAt: 0,
    updatedAt: 0,
  };
}

describe('ReaderController', () => {
  it('opens one session, schedules pages, and releases it on close', async () => {
    const calls: number[] = [];
    let closed = 0;
    const openChapter = async (_book: StoredBook, _sessionId: string): Promise<ContentSession> => ({
      comic: { title: '测试', author: '', direction: 'ltr', pages: [0, 1, 2].map(index => ({ index, imageUri: 'entry-' + index })) },
      info: { title: '测试', author: '', direction: 'ltr', pageCount: 3 },
      getPage: async index => { calls.push(index); return { index, uri: 'file:///page-' + index }; },
      prefetch: async () => undefined,
      retry: async index => ({ index, uri: 'file:///page-' + index }),
      close: async () => { closed += 1; },
    });
    const controller = new ReaderController({ openChapter, targetWidth: 1200, concurrency: 1 });

    const state = await controller.open(book(), 1);
    await controller.goTo(2);
    expect(state.currentPage).toBe(2);
    expect(calls.slice(0, 2)).toEqual([1, 2]);
    await controller.close();
    expect(closed).toBe(1);
    expect(controller.getState()).toBeUndefined();
  });
});
