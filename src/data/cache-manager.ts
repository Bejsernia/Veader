import {
  clearPageCache,
  clearSessionCache,
  clearSourceCache,
  getCacheBreakdown,
  getPageCacheLimitMb,
  getSourceCacheLimitMb,
  setPageCacheLimitMb,
  setSourceCacheLimitMb,
  trimSourceCacheToLimit,
  trimCacheToLimit,
} from '../cache';

export type CacheKind = 'page' | 'source' | 'session';

export type CacheBreakdown = {
  page: number;
  source: number;
  total: number;
};

export interface CacheManager {
  getBreakdown(): Promise<CacheBreakdown>;
  getPageLimitMb(): Promise<number>;
  setPageLimitMb(value: number): Promise<number>;
  getSourceLimitMb(): Promise<number>;
  setSourceLimitMb(value: number): Promise<number>;
  trim(): Promise<void>;
  trimSource(): Promise<void>;
  clear(kind: CacheKind): Promise<void>;
}

export const cacheManager: CacheManager = {
  getBreakdown: getCacheBreakdown,
  getPageLimitMb: getPageCacheLimitMb,
  setPageLimitMb: setPageCacheLimitMb,
  getSourceLimitMb: getSourceCacheLimitMb,
  setSourceLimitMb: setSourceCacheLimitMb,
  trim: async () => { await trimCacheToLimit(); },
  trimSource: async () => { await trimSourceCacheToLimit(); },
  clear: async kind => {
    if (kind === 'page') return clearPageCache();
    if (kind === 'source') return clearSourceCache();
    return clearSessionCache();
  },
};
