import * as FileSystem from 'expo-file-system';

const settingsUri = () => `${FileSystem.documentDirectory}veader-settings.json`;
const DEFAULT_LIMIT_MB = 512;

type CacheSettings = { pageCacheLimitMb?: number };
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
  const files: CacheFile[] = [];
  for (const child of children) {
    const childUri = child.startsWith('file://') || child.startsWith('content://') ? child : `${uri.endsWith('/') ? uri : `${uri}/`}${child}`;
    const info = await FileSystem.getInfoAsync(childUri, { size: true });
    if (!info.exists) continue;
    if ((info as any).isDirectory) files.push(...await listFiles(childUri));
    else files.push({ uri: childUri, size: (info as any).size ?? 0, modified: (info as any).modificationTime ?? 0 });
  }
  return files;
}

export function formatCacheSize(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(0, bytes / 1024).toFixed(1)} KB`;
}

export async function getCacheSizeBytes() {
  if (!FileSystem.cacheDirectory) return 0;
  const files = await listFiles(FileSystem.cacheDirectory);
  return files.reduce((sum, file) => sum + file.size, 0);
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
  const files = (await listFiles(FileSystem.cacheDirectory)).sort((a, b) => a.modified - b.modified);
  let total = files.reduce((sum, file) => sum + file.size, 0);
  for (const file of files) {
    if (total <= limit) break;
    try { await FileSystem.deleteAsync(file.uri, { idempotent: true }); total -= file.size; } catch { /* Ignore a file that is currently in use. */ }
  }
}

export async function clearAppCache() {
  if (!FileSystem.cacheDirectory) return;
  let children: string[];
  try { children = await FileSystem.readDirectoryAsync(FileSystem.cacheDirectory); } catch { return; }
  await Promise.all(children.map(child => {
    const uri = child.startsWith('file://') || child.startsWith('content://') ? child : `${FileSystem.cacheDirectory!.endsWith('/') ? FileSystem.cacheDirectory : `${FileSystem.cacheDirectory}/`}${child}`;
    return FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
  }));
}
