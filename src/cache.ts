import * as FileSystem from 'expo-file-system';
import { selectLruFilesToTrim } from './data/cache-policy';
import { hasCacheLeaseUnder, isCacheLeased } from './data/cache-leases';

const settingsUri = () => `${FileSystem.documentDirectory}veader-settings.json`;
const DEFAULT_LIMIT_MB = 512;
const DEFAULT_SOURCE_LIMIT_MB = 2048;

type CacheSettings = { pageCacheLimitMb?: number; sourceCacheLimitMb?: number };
type CacheFile = { uri: string; size: number; modified: number };
const PAGE_CACHE_ROOTS = ['epub-pages', 'pdf-pages', 'mobi-pages', 'mobi-pages-native', 'cropped-pages'];
let pageWriters = 0;
let pageTrimTimer: ReturnType<typeof setTimeout> | undefined;
let maintenance: Promise<unknown> = Promise.resolve();

function maintain<T>(work: () => Promise<T>): Promise<T> {
  const task = maintenance.then(work);
  maintenance = task.catch(() => undefined);
  return task;
}

export function schedulePageCacheTrim() {
  if (pageTrimTimer) clearTimeout(pageTrimTimer);
  pageTrimTimer = setTimeout(() => {
    pageTrimTimer = undefined;
    void trimCacheToLimit().catch(console.warn);
  }, 100);
}

/** Defer eviction until writers return their URI and the session can retain it. */
export async function withPageCacheWrite<T>(work: () => Promise<T>): Promise<T> {
  pageWriters += 1;
  try { return await work(); }
  finally { pageWriters -= 1; if (!pageWriters) schedulePageCacheTrim(); }
}

async function readSettings(): Promise<CacheSettings> {
  try {
    const info = await FileSystem.getInfoAsync(settingsUri());
    if (!info.exists) return {};
    return JSON.parse(await FileSystem.readAsStringAsync(settingsUri())) as CacheSettings;
  } catch {
    return {};
  }
}

async function writeSettings(settings: CacheSettings) {
  await FileSystem.writeAsStringAsync(settingsUri(), JSON.stringify(settings));
}

async function listFiles(uri: string): Promise<CacheFile[]> {
  let children: string[];
  try { children = await FileSystem.readDirectoryAsync(uri); } catch { return []; }
  const entries = await Promise.all(children.map(async child => {
    const childUri = child.startsWith('file://') || child.startsWith('content://') ? child : `${uri.endsWith('/') ? uri : `${uri}/`}${child}`;
    const info = await FileSystem.getInfoAsync(childUri, { size: true });
    if (!info.exists) return [] as CacheFile[];
    if ((info as any).isDirectory) return listFiles(childUri);
    return [{ uri: childUri, size: (info as any).size ?? 0, modified: (info as any).modificationTime ?? 0 }];
  }));
  return entries.flat();
}

export function formatCacheSize(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(0, bytes / 1024).toFixed(1)} KB`;
}

export async function getCacheSizeBytes() {
  if (!FileSystem.cacheDirectory) return 0;
  // The cache screen and its clear action are specifically about rendered
  // comic pages. Keep metadata, source archives, and persistent covers out of
  // this number so clearing page cache does not appear to leave a stale value.
  const files = await listPageCacheFiles();
  return files.reduce((sum, file) => sum + file.size, 0);
}

export async function getPageCacheSizeBytes() {
  return getCacheSizeBytes();
}

export async function getSourceCacheSizeBytes() {
  if (!FileSystem.cacheDirectory) return 0;
  const files = await listFiles(`${FileSystem.cacheDirectory}remote-books/`);
  return files.reduce((sum, file) => sum + file.size, 0);
}

export async function getSourceCacheLimitMb() {
  const settings = await readSettings();
  return Math.max(128, Math.min(8192, Math.round(settings.sourceCacheLimitMb ?? DEFAULT_SOURCE_LIMIT_MB)));
}

export async function setSourceCacheLimitMb(value: number) {
  const sourceCacheLimitMb = Math.max(128, Math.min(8192, Math.round(value)));
  const settings = await readSettings();
  await writeSettings({ ...settings, sourceCacheLimitMb });
  await trimSourceCacheToLimit(sourceCacheLimitMb);
  return sourceCacheLimitMb;
}

export async function trimSourceCacheToLimit(limitMb?: number) {
  return maintain(async () => {
    if (!FileSystem.cacheDirectory) return;
    const limit = (limitMb ?? await getSourceCacheLimitMb()) * 1024 ** 2;
    const files = await listFiles(FileSystem.cacheDirectory + 'remote-books/');
    for (const file of selectLruFilesToTrim(files.map(file => ({ ...file, protected: isCacheLeased(file.uri) })), limit)) {
      if (isCacheLeased(file.uri)) continue;
      try { await FileSystem.deleteAsync(file.uri, { idempotent: true }); } catch { /* Ignore a file that is currently in use. */ }
    }
  });
}

export async function getCacheBreakdown() {
  if (!FileSystem.cacheDirectory) return { page: 0, source: 0, session: 0, cover: 0, other: 0, total: 0 };
  const root = FileSystem.cacheDirectory;
  const files = await listFiles(root);
  let page = 0;
  let source = 0;
  let session = 0;
  let cover = 0;
  let other = 0;
  for (const file of files) {
    const relative = file.uri.startsWith(root) ? file.uri.slice(root.length) : file.uri;
    const top = relative.split('/').filter(Boolean)[0] ?? '';
    if (top === 'remote-books') source += file.size;
    else if (top === 'epub-archives') session += file.size;
    else if (PAGE_CACHE_ROOTS.includes(top)) {
      if (file.uri.includes('/cover-')) cover += file.size;
      else page += file.size;
    } else other += file.size;
  }
  return { page, source, session, cover, other, total: page + source + session + cover + other };
}

export async function getPageCacheLimitMb() {
  const settings = await readSettings();
  return Math.max(16, Math.min(4096, Math.round(settings.pageCacheLimitMb ?? DEFAULT_LIMIT_MB)));
}

export async function setPageCacheLimitMb(value: number) {
  const pageCacheLimitMb = Math.max(16, Math.min(4096, Math.round(value)));
  const settings = await readSettings();
  await writeSettings({ ...settings, pageCacheLimitMb });
  await trimCacheToLimit(pageCacheLimitMb);
  return pageCacheLimitMb;
}

export async function trimCacheToLimit(limitMb?: number) {
  return maintain(async () => {
    if (pageWriters) return;
    if (!FileSystem.cacheDirectory) return;
    const limit = (limitMb ?? await getPageCacheLimitMb()) * 1024 ** 2;
    const files = await listPageCacheFiles();
    for (const file of selectLruFilesToTrim(files.map(file => ({ ...file, protected: isCacheLeased(file.uri) })), limit)) {
      if (pageWriters) return;
      if (isCacheLeased(file.uri)) continue;
      try { await FileSystem.deleteAsync(file.uri, { idempotent: true }); } catch { /* Ignore a file that is currently in use. */ }
    }
  });
}

export async function clearPageCache() {
  return maintain(async () => {
    if (!FileSystem.cacheDirectory) return;
    const files = await listPageCacheFiles();
    for (const file of files) {
      if (pageWriters || isCacheLeased(file.uri)) throw new Error('页面仍在使用，请退出阅读后再清理');
      await FileSystem.deleteAsync(file.uri, { idempotent: true });
    }
  });
}

export async function clearSourceCache() {
  return maintain(async () => {
    if (!FileSystem.cacheDirectory) return;
    const files = await listFiles(`${FileSystem.cacheDirectory}remote-books/`);
    for (const file of files) {
      if (isCacheLeased(file.uri)) throw new Error('源文件仍在使用，请退出阅读或等待下载结束后再清理');
      await FileSystem.deleteAsync(file.uri, { idempotent: true });
    }
  });
}

export async function clearSessionCache() {
  return maintain(async () => {
    if (!FileSystem.cacheDirectory) return;
    if (pageWriters || hasCacheLeaseUnder(FileSystem.cacheDirectory)) throw new Error('阅读会话仍在使用，请退出阅读后再清理');
    await FileSystem.deleteAsync(`${FileSystem.cacheDirectory}epub-archives/`, { idempotent: true });
  });
}

/** Remove session artifacts left by older builds or a forced process stop. */
export async function cleanupStaleSessionCache() {
  if (!FileSystem.cacheDirectory) return;
  const archiveRoot = `${FileSystem.cacheDirectory}epub-archives/`;
  const pageRoot = `${FileSystem.cacheDirectory}epub-pages/`;
  const cleanupChildren = async (root: string, predicate: (name: string) => boolean) => {
    let children: string[];
    try { children = await FileSystem.readDirectoryAsync(root); } catch { return; }
    await Promise.all(children.filter(predicate).map(child => FileSystem.deleteAsync(`${root}${child}`, { idempotent: true }).catch(() => undefined)));
  };
  await cleanupChildren(archiveRoot, child => child.startsWith('archive-') || child.startsWith('reader-') || child.startsWith('prefetch-'));
  await cleanupChildren(pageRoot, child => child.startsWith('reader-') || child.startsWith('prefetch-'));
}

/** Backwards-compatible alias for the old page-cache action. */
export async function clearAppCache() {
  return clearPageCache();
}

async function listPageCacheFiles() {
  if (!FileSystem.cacheDirectory) return [] as CacheFile[];
  const files = (await Promise.all(PAGE_CACHE_ROOTS.map(root => listFiles(`${FileSystem.cacheDirectory}${root}/`)))).flat();
  return files.filter(file => !file.uri.includes('/cover-'));
}
