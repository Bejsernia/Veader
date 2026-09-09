import * as FileSystem from 'expo-file-system';
import { extractEpubPage, clearEpubSession, clearEpubMetadataCache } from './epub-native';

const mockFiles = new Set<string>();
const mockPrepare = jest.fn(async () => 'file:///cache/archive.zip');
const mockExtract = jest.fn();
const mockRelease = jest.fn(async () => undefined);
jest.mock('./platform/nativeContracts', () => ({
  getSafScanner: () => ({ prepareEpubSession: mockPrepare, extractEpubEntriesFromSession: mockExtract, releaseEpubSession: mockRelease }),
}));
jest.mock('./cache', () => ({ trimCacheToLimit: jest.fn(async () => undefined), withPageCacheWrite: (work: () => Promise<unknown>) => work() }));
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
jest.mock('expo-file-system', () => ({
  cacheDirectory: 'file:///cache/',
  getInfoAsync: jest.fn(async (uri: string) => ({ exists: uri === 'file:///book.epub' || mockFiles.has(uri), size: 12, modificationTime: 1 })),
  makeDirectoryAsync: jest.fn(async () => undefined),
  deleteAsync: jest.fn(async () => undefined),
}));

it('keeps shared pages and holds the archive until a cancelled extraction finishes', async () => {
  jest.useFakeTimers();
  clearEpubMetadataCache();
  let finish!: () => void;
  mockExtract.mockImplementation(async (_archive: string, _entries: string[], root: string, names: string[]) => {
    await new Promise<void>(resolve => { finish = resolve; });
    names.forEach(name => mockFiles.add(root + name));
  });
  const old = extractEpubPage('file:///book.epub', 'page.jpg', 'reader-old');
  const oldResult = old.catch(error => error.message);
  await jest.runAllTimersAsync();
  expect(mockExtract).toHaveBeenCalledTimes(1);
  const closing = clearEpubSession('reader-old');
  const next = extractEpubPage('file:///book.epub', 'page.jpg', 'reader-new');
  expect(mockRelease).not.toHaveBeenCalled();
  finish();
  await closing;
  await expect(oldResult).resolves.toBe('Reader session closed');
  await jest.runAllTimersAsync();
  await expect(next).resolves.toMatch(/epub-pages\/book-.*\.jpg$/);
  expect(FileSystem.deleteAsync).not.toHaveBeenCalled();
  expect(mockExtract).toHaveBeenCalledTimes(1);
  expect(mockRelease).toHaveBeenCalledTimes(1);
  await clearEpubSession('reader-new');
  jest.useRealTimers();
});
