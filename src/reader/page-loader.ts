import type { PageResult } from '../domain/models';

export type PageStatus = 'queued' | 'loading' | 'ready' | 'error' | 'cancelled';

export type PageState = {
  index: number;
  status: PageStatus;
  result?: PageResult;
  uri?: string;
  error?: Error;
};

export type PageLoaderOptions = {
  pageCount: number;
  prefetchDistance?: number;
  concurrency?: number;
  loadPage: (index: number) => Promise<PageResult>;
};

type Pending = { resolve: (result: PageResult) => void; reject: (error: Error) => void };

/** Priority queue for reader pages. It keeps UI work ahead of prefetch work. */
export class PageLoader {
  private readonly pageCount: number;
  private readonly prefetchDistance: number;
  private readonly concurrency: number;
  private readonly loadPageFn: (index: number) => Promise<PageResult>;
  private readonly states = new Map<number, PageState>();
  private readonly pending = new Map<number, Pending[]>();
  private readonly queue = new Map<number, number>();
  private readonly inFlight = new Map<number, number>();
  private readonly versions = new Map<number, number>();
  private readonly listeners = new Set<(state: PageState) => void>();
  private active = 0;
  private generation = 0;
  private disposed = false;

  constructor(options: PageLoaderOptions) {
    this.pageCount = Math.max(0, Math.floor(options.pageCount));
    this.prefetchDistance = Math.max(0, Math.floor(options.prefetchDistance ?? 4));
    this.concurrency = Math.max(1, Math.floor(options.concurrency ?? 2));
    this.loadPageFn = options.loadPage;
  }

  subscribe(listener: (state: PageState) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getState(index: number): PageState {
    return this.states.get(index) ?? { index, status: 'queued' };
  }

  async load(index: number): Promise<PageResult> {
    this.assertIndex(index);
    if (this.disposed) throw new Error('页面加载器已释放');
    const state = this.states.get(index);
    if (state?.status === 'ready' && state.result) return state.result;
    return new Promise<PageResult>((resolve, reject) => {
      const pending = this.pending.get(index) ?? [];
      pending.push({ resolve, reject });
      this.pending.set(index, pending);
      this.enqueue(index, 0);
      this.pump();
    });
  }

  prefetch(indexes: number[]) {
    if (this.disposed) return;
    for (const index of indexes) {
      if (index >= 0 && index < this.pageCount) this.enqueue(index, 1);
    }
    this.pump();
  }

  prefetchAround(index: number) {
    const indexes = Array.from({ length: this.prefetchDistance }, (_, offset) => index + offset + 1);
    this.prefetch(indexes);
  }

  retry(index: number) {
    this.assertIndex(index);
    const state = this.states.get(index);
    if (state?.status === 'error' || state?.status === 'cancelled') this.states.delete(index);
    return this.load(index);
  }

  cancel(index?: number) {
    const indexes = index === undefined
      ? [...new Set([...this.queue.keys(), ...this.inFlight.keys(), ...this.pending.keys()])]
      : [index];
    if (index === undefined) this.generation += 1;
    for (const item of indexes) {
      this.queue.delete(item);
      const version = (this.versions.get(item) ?? 0) + 1;
      this.versions.set(item, version);
      const state = this.states.get(item);
      if (state?.status === 'queued' || state?.status === 'loading') {
        this.publish({ index: item, status: 'cancelled' });
      }
      const pending = this.pending.get(item);
      pending?.forEach(({ reject }) => reject(new Error('页面加载已取消')));
      this.pending.delete(item);
    }
  }

  dispose() {
    if (this.disposed) return;
    this.cancel();
    this.disposed = true;
    this.listeners.clear();
  }

  private enqueue(index: number, priority: number) {
    if (this.disposed || index < 0 || index >= this.pageCount) return;
    const state = this.states.get(index);
    if (state?.status === 'ready' || state?.status === 'loading') return;
    const previous = this.queue.get(index);
    if (previous === undefined || priority < previous) this.queue.set(index, priority);
    this.publish({ index, status: 'queued' });
  }

  private pump() {
    while (!this.disposed && this.active < this.concurrency && this.queue.size > 0) {
      const next = [...this.queue.entries()].sort((a, b) => a[1] - b[1] || a[0] - b[0])[0];
      if (!next) return;
      const [index] = next;
      this.queue.delete(index);
      const version = this.versions.get(index) ?? 0;
      this.inFlight.set(index, version);
      void this.run(index, this.generation, version);
    }
  }

  private async run(index: number, generation: number, version: number) {
    this.active += 1;
    this.publish({ index, status: 'loading' });
    try {
      const result = await this.loadPageFn(index);
      if (!this.isCurrent(index, generation, version)) return;
      this.publish({ index, status: 'ready', result, uri: result.uri });
      this.pending.get(index)?.forEach(({ resolve }) => resolve(result));
    } catch (reason) {
      const error = reason instanceof Error ? reason : new Error(String(reason));
      if (this.isCurrent(index, generation, version)) {
        this.publish({ index, status: 'error', error });
        this.pending.get(index)?.forEach(({ reject }) => reject(error));
      }
    } finally {
      if (this.inFlight.get(index) === version) this.inFlight.delete(index);
      if (this.versions.get(index) === version) this.pending.delete(index);
      this.active -= 1;
      this.pump();
    }
  }

  private isCurrent(index: number, generation: number, version: number) {
    return !this.disposed && generation === this.generation && version === (this.versions.get(index) ?? 0);
  }

  private publish(state: PageState) {
    this.states.set(state.index, state);
    [...this.listeners].forEach(listener => listener(state));
  }

  private assertIndex(index: number) {
    if (!Number.isInteger(index) || index < 0 || index >= this.pageCount) throw new Error('页面索引无效: ' + index);
  }
}
