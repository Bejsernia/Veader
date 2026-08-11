import * as FileSystem from 'expo-file-system';

const settingsUri = () => `${FileSystem.documentDirectory}veader-settings.json`;
const DEFAULT_LIMIT_MB = 512;
const DEFAULT_SOURCE_LIMIT_MB = 2048;

type CacheSettings = { pageCacheLimitMb?: number; sourceCacheLimitMb?: number };
type CacheFile = { uri: string; size: number; modified: number };

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
  if (!FileSystem.cacheDirectory) return;
  const limit = (limitMb ?? await getSourceCacheLimitMb()) * 1024 ** 2;
  const files = (await listFiles(FileSystem.cacheDirectory + 'remote-books/')).sort((a, b) => a.modified - b.modified);
  let total = files.reduce((sum, file) => sum + file.size, 0);
  for (const file of files) {
    if (total <= limit) break;
    try { await FileSystem.deleteAsync(file.uri, { idempotent: true }); total -= file.size; } catch { /* Ignore a file that is currently in use. */ }
  }
}

export async function getCacheBreakdown() {
  const [page, source] = await Promise.all([getPageCacheSizeBytes(), getSourceCacheSizeBytes()]);
  return { page, source, total: page + source };
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
  if (!FileSystem.cacheDirectory) return;
  const limit = (limitMb ?? await getPageCacheLimitMb()) * 1024 ** 2;
  const files = (await listPageCacheFiles()).sort((a, b) => a.modified - b.modified);
  let total = files.reduce((sum, file) => sum + file.size, 0);
  for (const file of files) {
    if (total <= limit) break;
    try { await FileSystem.deleteAsync(file.uri, { idempotent: true }); total -= file.size; } catch { /* Ignore a file that is currently in use. */ }
  }
}

export async function clearPageCache() {
  if (!FileSystem.cacheDirectory) return;
  const roots = ['pdf-pages', 'mobi-pages', 'mobi-pages-native', 'cropped-pages'];
  await Promise.all(roots.map(root => FileSystem.deleteAsync(`${FileSystem.cacheDirectory}${root}/`, { idempotent: true }).catch(() => undefined)));
  const epubRoot = `${FileSystem.cacheDirectory}epub-pages/`;
  try {
    const children = await FileSystem.readDirectoryAsync(epubRoot);
    await Promise.all(children.filter(child => !child.split('/').filter(Boolean).pop()?.startsWith('cover-')).map(child => FileSystem.deleteAsync(child.startsWith('file://') ? child : `${epubRoot}${child}`, { idempotent: true }).catch(() => undefined)));
  } catch { /* The page cache may not exist yet. */ }
}

export async function clearSourceCache() {
  if (!FileSystem.cacheDirectory) return;
  await FileSystem.deleteAsync(`${FileSystem.cacheDirectory}remote-books/`, { idempotent: true });
}

export async function clearSessionCache() {
  if (!FileSystem.cacheDirectory) return;
  await Promise.all([
    FileSystem.deleteAsync(`${FileSystem.cacheDirectory}epub-archives/`, { idempotent: true }),
    FileSystem.deleteAsync(`${FileSystem.cacheDirectory}epub-pages/`, { idempotent: true }),
  ]);
}

/** Backwards-compatible alias for the old page-cache action. */
export async function clearAppCache() {
  return clearPageCache();
}

async function listPageCacheFiles() {
  if (!FileSystem.cacheDirectory) return [] as CacheFile[];
  const roots = ['epub-pages', 'pdf-pages', 'mobi-pages', 'mobi-pages-native', 'cropped-pages'];
  const files = (await Promise.all(roots.map(root => listFiles(`${FileSystem.cacheDirectory}${root}/`)))).flat();
  return files.filter(file => !file.uri.includes('/cover-'));
}
