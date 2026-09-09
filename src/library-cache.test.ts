import * as FileSystem from 'expo-file-system';
import { acquireChapterLocal } from './library';
import { isCacheLeased } from './data/cache-leases';
import { trimSourceCacheToLimit } from './cache';
import type { StoredChapter } from './domain/models';

const mockFiles = new Map<string, number>();
const mockRun = jest.fn(async () => undefined);
jest.mock('./data/database', () => ({
  getLibraryDatabase: async () => ({ getFirstAsync: async () => ({ type: 'ftp', endpoint: 'ftp://test' }), runAsync: mockRun }),
}));
jest.mock('./protocols', () => ({ createRemoteSourceAdapter: () => ({}) }));
jest.mock('./data/remote-download', () => ({
  downloadRemoteFile: async ({ targetUri }: { targetUri: string }) => { mockFiles.set(targetUri, 3 * 1024 ** 3); },
}));
jest.mock('expo-file-system', () => ({
  cacheDirectory: 'file:///cache/', documentDirectory: 'file:///documents/',
  makeDirectoryAsync: jest.fn(async () => undefined),
  getInfoAsync: jest.fn(async (uri: string) => ({ exists: mockFiles.has(uri), size: mockFiles.get(uri), modificationTime: 1 })),
  readDirectoryAsync: jest.fn(async (uri: string) => [...mockFiles.keys()].filter(key => key.startsWith(uri)).map(key => key.slice(uri.length))),
  deleteAsync: jest.fn(async (uri: string) => { mockFiles.delete(uri); }),
  readAsStringAsync: jest.fn(async () => '{}'),
}));

it('returns a readable oversized download and evicts it only after the caller releases it', async () => {
  const chapter = { id: 1, sourceId: 1, remotePath: '/large.epub', remoteSize: 3 * 1024 ** 3, format: 'epub', contentFingerprint: 'large-v1' } as StoredChapter;
  const acquired = await acquireChapterLocal(chapter);
  expect(isCacheLeased(acquired.chapter.localUri)).toBe(true);
  await expect(FileSystem.getInfoAsync(acquired.chapter.localUri)).resolves.toMatchObject({ exists: true, size: chapter.remoteSize });
  expect(mockRun).toHaveBeenCalledWith(expect.stringContaining("scan_status = 'cached'"), acquired.chapter.localUri, chapter.remoteSize, 'large-v1', expect.any(Number), 1);
  acquired.release();
  await trimSourceCacheToLimit();
  expect(mockFiles.has(acquired.chapter.localUri)).toBe(false);
});
