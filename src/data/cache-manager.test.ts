jest.mock('../cache', () => ({
  clearPageCache: jest.fn(async () => undefined),
  clearSessionCache: jest.fn(async () => undefined),
  clearSourceCache: jest.fn(async () => undefined),
  getCacheBreakdown: jest.fn(async () => ({ page: 10, source: 20, total: 30 })),
  getPageCacheLimitMb: jest.fn(async () => 512),
  setPageCacheLimitMb: jest.fn(async (value: number) => value),
  getSourceCacheLimitMb: jest.fn(async () => 2048),
  setSourceCacheLimitMb: jest.fn(async (value: number) => value),
  trimCacheToLimit: jest.fn(async () => undefined),
  trimSourceCacheToLimit: jest.fn(async () => undefined),
}));

import { cacheManager } from './cache-manager';
import { clearPageCache, clearSessionCache, clearSourceCache } from '../cache';

describe('CacheManager', () => {
  it('keeps page, source, and session cleanup separate', async () => {
    await cacheManager.clear('page');
    await cacheManager.clear('source');
    await cacheManager.clear('session');

    expect(clearPageCache).toHaveBeenCalledTimes(1);
    expect(clearSourceCache).toHaveBeenCalledTimes(1);
    expect(clearSessionCache).toHaveBeenCalledTimes(1);
  });

  it('exposes the bounded page cache settings through one boundary', async () => {
    await expect(cacheManager.getBreakdown()).resolves.toEqual({ page: 10, source: 20, total: 30 });
    await expect(cacheManager.getPageLimitMb()).resolves.toBe(512);
    await expect(cacheManager.setPageLimitMb(256)).resolves.toBe(256);
  });
});
