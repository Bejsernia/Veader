import * as FileSystem from 'expo-file-system';
import { acquireCacheLease } from './data/cache-leases';
import { clearPageCache, clearSessionCache, trimCacheToLimit, trimSourceCacheToLimit, withPageCacheWrite } from './cache';

const mockFiles = new Map<string, number>();
jest.mock('expo-file-system', () => ({
  cacheDirectory: 'file:///cache/', documentDirectory: 'file:///documents/',
  readDirectoryAsync: jest.fn(async (uri: string) => {
    const root = uri.endsWith('/') ? uri : uri + '/';
    return [...new Set([...mockFiles.keys()].filter(key => key.startsWith(root)).map(key => key.slice(root.length).split('/')[0]))];
  }),
  getInfoAsync: jest.fn(async (uri: string) => ({ exists: mockFiles.has(uri) || [...mockFiles.keys()].some(key => key.startsWith(uri + '/')), isDirectory: !mockFiles.has(uri), size: mockFiles.get(uri) ?? 0, modificationTime: 1 })),
  deleteAsync: jest.fn(async (uri: string) => { for (const key of mockFiles.keys()) if (key === uri || key.startsWith(uri)) mockFiles.delete(key); }),
  readAsStringAsync: jest.fn(async () => '{}'),
}));
beforeEach(() => { jest.useFakeTimers(); mockFiles.clear(); jest.clearAllMocks(); });
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

it('protects an oversized source until every reader releases it', async () => {
  const uri = 'file:///cache/remote-books/large.epub';
  mockFiles.set(uri, 3 * 1024 ** 3);
  const first = acquireCacheLease(uri); const second = acquireCacheLease(uri);
  await trimSourceCacheToLimit(2048);
  expect(mockFiles.has(uri)).toBe(true);
  first(); first();
  await trimSourceCacheToLimit(2048);
  expect(mockFiles.has(uri)).toBe(true);
  second();
  await trimSourceCacheToLimit(2048);
  expect(mockFiles.has(uri)).toBe(false);
});

it('applies one page budget to PDF, native MOBI, crop and EPUB caches', async () => {
  for (const root of ['pdf-pages', 'mobi-pages-native', 'cropped-pages', 'epub-pages/book-1']) mockFiles.set(`file:///cache/${root}/page.jpg`, 20 * 1024 ** 2);
  const current = 'file:///cache/pdf-pages/page.jpg';
  const release = acquireCacheLease(current);
  await trimCacheToLimit(16);
  expect([...mockFiles.keys()]).toEqual([current]);
  await expect(clearPageCache()).rejects.toThrow('仍在使用');
  release();
  await clearPageCache();
  expect(mockFiles.size).toBe(0);
});

it('defers trimming while a native write is pending', async () => {
  mockFiles.set('file:///cache/pdf-pages/new.png', 30 * 1024 ** 2);
  let finish!: () => void;
  const writing = withPageCacheWrite(() => new Promise<void>(resolve => { finish = resolve; }));
  await trimCacheToLimit(16);
  expect(FileSystem.deleteAsync).not.toHaveBeenCalled();
  finish(); await writing;
  await trimCacheToLimit(16);
  expect(mockFiles.size).toBe(0);
});

it('session cleanup preserves persistent extracted pages and cached covers', async () => {
  mockFiles.set('file:///cache/epub-archives/archive-1.zip', 5);
  mockFiles.set('file:///cache/epub-pages/book-1/page.jpg', 5);
  mockFiles.set('file:///cache/epub-pages/cover-1/cover.jpg', 5);
  await clearSessionCache();
  expect(mockFiles.size).toBe(2);
  expect([...mockFiles.keys()].every(key => key.includes('epub-pages'))).toBe(true);
});
