import * as FileSystem from 'expo-file-system';
import { unzip } from 'react-native-zip-archive';
import { XMLParser } from 'fast-xml-parser';
import JSZip from 'jszip';
import { NativeModules, Platform } from 'react-native';
import { trimCacheToLimit } from './cache';

export type ExtractedEpub = {
  rootUri: string;
  packagePath: string;
  packageUri: string;
  opf: any;
};

export type ScannedEpub = {
  title: string;
  author: string;
  direction: 'ltr' | 'rtl';
  pages: { index: number; imageUri: string }[];
};

const extractionCache = new Map<string, Promise<ExtractedEpub>>();
const scanCache = new Map<string, Promise<ScannedEpub>>();
const ENTRY_PREFIX = 'epub-entry://';
type PendingPage = { queueKey: string; sourceUri: string; entry: string; sessionId: string; targetUri: string; fileName: string; resolve: (value: string) => void; reject: (reason: unknown) => void };
const pendingPages = new Map<string, PendingPage>();
const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();
const activePages = new Map<string, Promise<string>>();

export function scanEpub(sourceUri: string) {
  let cached = scanCache.get(sourceUri);
  if (!cached) {
    cached = scanEpubSource(sourceUri);
    scanCache.set(sourceUri, cached);
  }
  return cached;
}

export function extractEpubPage(sourceUri: string, entry: string, sessionId: string) {
  const cacheRoot = FileSystem.cacheDirectory;
  if (!cacheRoot) throw new Error('应用缓存目录不可用');
  const targetUri = pageTargetUri(cacheRoot, entry, sessionId);
  const active = activePages.get(targetUri);
  if (active) return active;
  const queueKey = sourceUri + '\n' + sessionId;
  const promise = new Promise<string>((resolve, reject) => {
    pendingPages.set(targetUri, { queueKey, sourceUri, entry, sessionId, targetUri, fileName: targetUri.split('/').pop()!, resolve, reject });
    if (!pendingTimers.has(queueKey)) {
      pendingTimers.set(queueKey, setTimeout(() => { pendingTimers.delete(queueKey); void flushPageQueue(queueKey); }, 0));
    }
  });
  activePages.set(targetUri, promise);
  return promise.finally(() => activePages.delete(targetUri));
}

function pageTargetUri(cacheRoot: string, entry: string, sessionId: string) {
  const key = stableKey(entry);
  const extension = entry.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'img';
  return cacheRoot + 'epub-pages/' + sessionId + '/' + key + '.' + extension;
}

async function flushPageQueue(queueKey: string) {
  const requests = [...pendingPages.entries()].filter(([, request]) => request.queueKey === queueKey).map(([targetUri, request]) => { pendingPages.delete(targetUri); return request; });
  if (!requests.length) return;
  try {
    const cacheRoot = FileSystem.cacheDirectory;
    if (!cacheRoot) throw new Error('cache directory unavailable');
    const targetDir = cacheRoot + 'epub-pages/' + requests[0]!.sessionId + '/';
    const missing: PendingPage[] = [];
    for (const request of requests) {
      const info = await FileSystem.getInfoAsync(request.targetUri);
      if (!info.exists) missing.push(request);
    }
    if (missing.length) {
      await FileSystem.makeDirectoryAsync(targetDir, { intermediates: true });
      const scanner = (NativeModules as any).SafScanner;
      if (Platform.OS === 'android' && scanner?.extractEpubEntries) {
        await scanner.extractEpubEntries(missing[0]!.sourceUri, missing.map(item => item.entry), targetDir, missing.map(item => item.fileName));
      } else if (Platform.OS === 'android' && scanner?.extractEpubEntry) {
        for (const item of missing) {
          const base64 = await scanner.extractEpubEntry(item.sourceUri, item.entry);
          await FileSystem.writeAsStringAsync(item.targetUri, base64, { encoding: FileSystem.EncodingType.Base64 });
        }
      } else {
        await extractEpubEntriesWithJsZip(missing[0]!.sourceUri, missing.map(item => item.entry), missing.map(item => item.targetUri));
      }
    }
    await trimCacheToLimit();
    for (const request of requests) {
      const info = await FileSystem.getInfoAsync(request.targetUri);
      if (!info.exists) throw new Error('EPUB page extraction failed');
      request.resolve(request.targetUri);
    }
  } catch (error) {
    requests.forEach(request => request.reject(error));
  }
}
export async function clearEpubSession(sessionId: string) {
  if (!FileSystem.cacheDirectory) return;
  await FileSystem.deleteAsync(FileSystem.cacheDirectory + 'epub-pages/' + sessionId, { idempotent: true });
}

export function isEpubEntryUri(value: string) {
  return value.startsWith(ENTRY_PREFIX);
}

export function epubEntryFromUri(value: string) {
  return decodeURIComponent(value.slice(ENTRY_PREFIX.length));
}

async function scanEpubSource(sourceUri: string): Promise<ScannedEpub> {
  const scanner = (NativeModules as any).SafScanner;
  if (Platform.OS === 'android' && scanner?.scanEpub) {
    const result = await scanner.scanEpub(sourceUri);
    const pages = Array.isArray(result.pages) ? result.pages : [];
    return {
      title: String(result.title ?? ''),
      author: String(result.author ?? ''),
      direction: result.direction === 'rtl' ? 'rtl' : 'ltr',
      pages: pages.map((entry: string, index: number) => ({ index, imageUri: ENTRY_PREFIX + encodeURIComponent(entry) })),
    };
  }
  return scanEpubWithJsZip(sourceUri);
}

async function scanEpubWithJsZip(sourceUri: string): Promise<ScannedEpub> {
  const base64 = await FileSystem.readAsStringAsync(sourceUri, { encoding: FileSystem.EncodingType.Base64 });
  const zip = await JSZip.loadAsync(base64, { base64: true });
  const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true });
  const containerText = await zip.file('META-INF/container.xml')?.async('text');
  if (!containerText) throw new Error('EPUB 缺少 container.xml');
  const rootfiles = parser.parse(containerText)?.container?.rootfiles?.rootfile;
  const packagePath = normalizePath((Array.isArray(rootfiles) ? rootfiles[0] : rootfiles)?.['@_full-path'] ?? '');
  const packageText = await zip.file(packagePath)?.async('text');
  if (!packageText) throw new Error('EPUB 缺少 OPF 文件');
  const opf = parser.parse(packageText)?.package;
  const items = asArray<any>(opf?.manifest?.item); const refs = asArray<any>(opf?.spine?.itemref);
  const manifest = new Map(items.map(item => [item['@_id'], item['@_href']]));
  const basePath = packagePath.includes('/') ? packagePath.slice(0, packagePath.lastIndexOf('/') + 1) : '';
  const pages: { index: number; imageUri: string }[] = [];
  for (const ref of refs) {
    const href = manifest.get(ref?.['@_idref']); if (!href) continue;
    const chapterPath = normalizePath(basePath + href);
    const chapter = await zip.file(chapterPath)?.async('text'); if (!chapter) continue;
    const source = chapter.match(/<(?:img|image)[^>]+(?:src|href)=[\"']([^\"']+)[\"']/i)?.[1]; if (!source) continue;
    const imagePath = normalizePath((chapterPath.includes('/') ? chapterPath.slice(0, chapterPath.lastIndexOf('/') + 1) : '') + decodeURIComponent(source.split('#')[0]!));
    if (zip.file(imagePath)) pages.push({ index: pages.length, imageUri: ENTRY_PREFIX + encodeURIComponent(imagePath) });
  }
  if (!pages.length) throw new Error('EPUB 中没有找到漫画页面');
  const metadata = opf?.metadata ?? {};
  const creators = asArray<any>(metadata.creator).map(item => textValue(item)).filter(Boolean);
  const writingMode = String(asArray<any>(metadata.meta).find(meta => meta?.['@_name'] === 'primary-writing-mode')?.['@_content'] ?? '');
  return { title: textValue(metadata.title), author: [...new Set(creators)].join('、'), direction: writingMode.endsWith('-rl') ? 'rtl' : 'ltr', pages };
}

async function extractEpubEntriesWithJsZip(sourceUri: string, entries: string[], targetUris: string[]) {
  const base64 = await FileSystem.readAsStringAsync(sourceUri, { encoding: FileSystem.EncodingType.Base64 });
  const zip = await JSZip.loadAsync(base64, { base64: true });
  for (let index = 0; index < entries.length; index++) {
    const page = zip.file(entries[index]!);
    if (!page) throw new Error('EPUB page missing');
    await FileSystem.writeAsStringAsync(targetUris[index]!, await page.async('base64'), { encoding: FileSystem.EncodingType.Base64 });
  }
}

async function extractEpubEntryWithJsZip(sourceUri: string, entry: string, targetUri: string) {
  const base64 = await FileSystem.readAsStringAsync(sourceUri, { encoding: FileSystem.EncodingType.Base64 });
  const zip = await JSZip.loadAsync(base64, { base64: true });
  const page = zip.file(entry);
  if (!page) throw new Error('EPUB 页面不存在');
  await FileSystem.writeAsStringAsync(targetUri, await page.async('base64'), { encoding: FileSystem.EncodingType.Base64 });
}

function asArray<T>(value: T | T[] | undefined): T[] { return value === undefined ? [] : Array.isArray(value) ? value : [value]; }
function textValue(value: unknown): string {
  const first = Array.isArray(value) ? value[0] : value;
  if (typeof first === 'string') return first.trim();
  if (first && typeof first === 'object' && '#text' in first) return String((first as any)['#text']).trim();
  return '';
}

export function ensureEpubExtracted(sourceUri: string) {
  let cached = extractionCache.get(sourceUri);
  if (!cached) {
    cached = extractAndReadPackage(sourceUri);
    extractionCache.set(sourceUri, cached);
  }
  return cached;
}

async function extractAndReadPackage(sourceUri: string): Promise<ExtractedEpub> {
  const cacheRoot = FileSystem.cacheDirectory;
  if (!cacheRoot) throw new Error('应用缓存目录不可用');
  const key = stableKey(sourceUri);
  const rootUri = `${cacheRoot}epub-extracted/${key}/`;
  const markerUri = `${rootUri}META-INF/container.xml`;
  const markerInfo = await FileSystem.getInfoAsync(markerUri);
  if (!markerInfo.exists) {
    await FileSystem.makeDirectoryAsync(rootUri, { intermediates: true });
    try {
      const localUri = await cacheSourceIfNeeded(sourceUri, key);
      await unzip(nativePath(localUri), nativePath(rootUri), 'UTF-8');
    } catch (error) {
      await FileSystem.deleteAsync(rootUri, { idempotent: true });
      throw error;
    }
  }
  const containerText = await FileSystem.readAsStringAsync(markerUri);
  const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true });
  const rootfiles = parser.parse(containerText)?.container?.rootfiles?.rootfile;
  const packagePath = (Array.isArray(rootfiles) ? rootfiles[0] : rootfiles)?.['@_full-path'];
  if (!packagePath) throw new Error('EPUB container.xml 没有 rootfile');
  const packageUri = `${rootUri}${normalizePath(packagePath)}`;
  const packageText = await FileSystem.readAsStringAsync(packageUri);
  return { rootUri, packagePath: normalizePath(packagePath), packageUri, opf: parser.parse(packageText)?.package };
}

// Network/SAF sources are copied only while a chapter is opened. The cache can be safely removed at any time.
async function cacheSourceIfNeeded(sourceUri: string, key: string) {
  if (sourceUri.startsWith('file://')) return sourceUri;
  const cacheRoot = FileSystem.cacheDirectory;
  if (!cacheRoot) throw new Error('应用缓存目录不可用');
  const targetUri = `${cacheRoot}epub-source/${key}.epub`;
  const info = await FileSystem.getInfoAsync(targetUri);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(`${cacheRoot}epub-source/`, { intermediates: true });
    await FileSystem.copyAsync({ from: sourceUri, to: targetUri });
  }
  return targetUri;
}

export function resolveEpubUri(rootUri: string, fromPath: string, relativePath: string) {
  const directory = fromPath.includes('/') ? fromPath.slice(0, fromPath.lastIndexOf('/') + 1) : '';
  return `${rootUri}${normalizePath(directory + decodeURIComponent(relativePath.split('#')[0]!))}`;
}

export function normalizePath(path: string) {
  const parts: string[] = [];
  for (const part of path.replace(/\\/g, '/').split('/')) {
    if (part === '..') parts.pop();
    else if (part && part !== '.') parts.push(part);
  }
  return parts.join('/');
}

function nativePath(uri: string) {
  return decodeURIComponent(uri.replace(/^file:\/\//, ''));
}

function stableKey(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `book-${(hash >>> 0).toString(16)}`;
}
