import { PageLoader } from './page-loader';

describe('PageLoader', () => {
  it('loads the requested page before prefetching the next pages', async () => {
    const calls: number[] = [];
    const loader = new PageLoader({
      pageCount: 6,
      concurrency: 1,
      prefetchDistance: 4,
      loadPage: async index => {
        calls.push(index);
        return { index, uri: 'file:///page-' + index + '.jpg' };
      },
    });

    await loader.load(0);
    loader.prefetchAround(0);
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(calls).toEqual([0, 1, 2, 3, 4]);
    expect(loader.getState(0)).toMatchObject({ status: 'ready', uri: 'file:///page-0.jpg' });
    expect(loader.getState(4).status).toBe('ready');
    loader.dispose();
  });

  it('prefetches the nearest pages in both directions', async () => {
    const calls: number[] = [];
    const loader = new PageLoader({
      pageCount: 7,
      concurrency: 1,
      prefetchDistance: 2,
      loadPage: async index => {
        calls.push(index);
        return { index, uri: 'file:///page-' + index + '.jpg' };
      },
    });

    await loader.load(3);
    loader.prefetchAround(3);
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(calls).toEqual([3, 4, 2, 5, 1]);
    loader.dispose();
  });

  it('supports retry after a failed page load', async () => {
    let attempts = 0;
    const loader = new PageLoader({
      pageCount: 1,
      loadPage: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('temporary failure');
        return { index: 0, uri: 'file:///recovered.jpg' };
      },
    });

    await expect(loader.load(0)).rejects.toThrow('temporary failure');
    expect(loader.getState(0).status).toBe('error');
    await expect(loader.retry(0)).resolves.toEqual({ index: 0, uri: 'file:///recovered.jpg' });
    expect(loader.getState(0).status).toBe('ready');
    loader.dispose();
  });

  it('rejects invalid indexes without touching the loader', async () => {
    const loader = new PageLoader({ pageCount: 2, loadPage: async index => ({ index, uri: String(index) }) });
    await expect(loader.load(-1)).rejects.toThrow('页面索引无效');
    expect(() => loader.retry(2)).toThrow('页面索引无效');
    loader.dispose();
  });

  it('deduplicates concurrent requests for the same page', async () => {
    let calls = 0;
    let release!: (result: { index: number; uri: string }) => void;
    const loader = new PageLoader({
      pageCount: 1,
      loadPage: async index => {
        calls += 1;
        return new Promise(resolve => { release = resolve; });
      },
    });

    const first = loader.load(0);
    const second = loader.load(0);
    expect(calls).toBe(1);
    release({ index: 0, uri: 'file:///same.jpg' });
    await expect(Promise.all([first, second])).resolves.toEqual([
      { index: 0, uri: 'file:///same.jpg' },
      { index: 0, uri: 'file:///same.jpg' },
    ]);
    loader.dispose();
  });

  it('cancels queued and active work and rejects waiting callers', async () => {
    let release!: (result: { index: number; uri: string }) => void;
    const loader = new PageLoader({
      pageCount: 2,
      concurrency: 1,
      loadPage: async index => new Promise(resolve => {
        release = () => resolve({ index, uri: 'file:///page-' + index + '.jpg' });
      }),
    });

    const active = loader.load(0);
    const queued = loader.load(1);
    loader.cancel();
    release({ index: 0, uri: 'file:///page-0.jpg' });

    await expect(active).rejects.toThrow('页面加载已取消');
    await expect(queued).rejects.toThrow('页面加载已取消');
    expect(loader.getState(0).status).toBe('cancelled');
    expect(loader.getState(1).status).toBe('cancelled');
    loader.dispose();
  });
});
