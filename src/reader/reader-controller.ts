import type { StoredBook } from '../library';
import type { ContentSession } from '../content/content-loader';
import { PageLoader } from './page-loader';

export type ReaderControllerOptions = {
  openChapter: (book: StoredBook, sessionId: string) => Promise<ContentSession>;
  targetWidth: number;
  prefetchDistance?: number;
  concurrency?: number;
};

export type ReaderControllerState = {
  chapterId: number;
  sessionId: string;
  pageCount: number;
  currentPage: number;
  contentSession: ContentSession;
  pageLoader: PageLoader;
};

/**
 * Owns one reader chapter at a time. UI code can render the state while the
 * controller keeps session cleanup and page scheduling out of React effects.
 */
export class ReaderController {
  private readonly options: ReaderControllerOptions;
  private session?: ContentSession;
  private state?: ReaderControllerState;
  private generation = 0;

  constructor(options: ReaderControllerOptions) {
    this.options = options;
  }

  getState() {
    return this.state;
  }

  async open(book: StoredBook, initialPage = 0): Promise<ReaderControllerState> {
    const generation = ++this.generation;
    await this.closeCurrent();
    const sessionId = 'reader-' + book.id + '-' + Date.now();
    const session = await this.options.openChapter(book, sessionId);
    if (generation !== this.generation) {
      await session.close();
      throw new Error('阅读章节切换已取消');
    }
    const pageCount = session.comic.pages.length;
    const pageLoader = new PageLoader({
      pageCount,
      prefetchDistance: this.options.prefetchDistance ?? 4,
      concurrency: this.options.concurrency ?? 2,
      loadPage: index => session.getPage(index, { targetWidth: this.options.targetWidth }),
    });
    const currentPage = Math.max(0, Math.min(Math.max(0, pageCount - 1), Math.round(initialPage)));
    this.session = session;
    this.state = { chapterId: book.id, sessionId, pageCount, currentPage, contentSession: session, pageLoader };
    if (pageCount > 0) {
      await pageLoader.load(currentPage);
      pageLoader.prefetchAround(currentPage);
    }
    return this.state;
  }

  async goTo(page: number) {
    const state = this.requireState();
    const currentPage = Math.max(0, Math.min(Math.max(0, state.pageCount - 1), Math.round(page)));
    await state.pageLoader.load(currentPage);
    state.pageLoader.prefetchAround(currentPage);
    state.currentPage = currentPage;
    return state.pageLoader.getState(currentPage);
  }

  retry(page: number) {
    const state = this.requireState();
    return state.pageLoader.retry(page);
  }

  async close() {
    this.generation += 1;
    await this.closeCurrent();
  }

  private async closeCurrent() {
    const state = this.state;
    const session = this.session;
    this.state = undefined;
    this.session = undefined;
    state?.pageLoader.dispose();
    if (session) await session.close();
  }

  private requireState() {
    if (!this.state) throw new Error('阅读会话未打开');
    return this.state;
  }
}
