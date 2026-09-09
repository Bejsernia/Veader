import * as FileSystem from 'expo-file-system';
import { XMLParser } from 'fast-xml-parser';
import JSZip from 'jszip';
import { Platform } from 'react-native';
import { trimCacheToLimit } from './cache';
import { getSafScanner } from './platform/nativeContracts';

export type ScannedEpub = {
  title: string;
  author: string;
  direction: 'ltr' | 'rtl';
  pages: { index: number; imageUri: string }[];
};

type ScanCacheEntry = { fingerprint: string; value: Promise<ScannedEpub> };
const scanCache = new Map<string, ScanCacheEntry>();
const fingerprintCache = new Map<string, { value: string; checkedAt: number }>();
const MAX_SCAN_CACHE_ENTRIES = 32;
const ENTRY_PREFIX = 'epub-entry://';
type PendingPage = { queueKey: string; sourceUri: string; entry: string; sessionId: string; targetUri: string; fileName: string; resolve: (value: string) => void; reject: (reason: unknown) => void };
const pendingPages = new Map<string, PendingPage>();
const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();
const activePages = new Map<string, Promise<string>>();
const sessionPageUris = new Map<string, Map<string, string>>();
const archiveSessions = new Map<string, Promise<string>>();
const sessionArchiveKeys = new Map<string, string>();
const archiveRefs = new Map<string, number>();
const cancelledSessions = new Set<string>();
const runningBatches = new Map<string, Set<Promise<void>>>();

export function clearEpubMetadataCache() {
  scanCache.clear();
  fingerprintCache.clear();
}

export async function scanEpub(sourceUri: string): Promise<ScannedEpub> {
  const fingerprint = await sourceFingerprint(sourceUri);
  const cached = scanCache.get(sourceUri);
  if (cached?.fingerprint === fingerprint) {
    scanCache.delete(sourceUri);
    scanCache.set(sourceUri, cached);
    return cached.value;
  }
  const value = scanEpubSource(sourceUri);
  scanCache.set(sourceUri, { fingerprint, value });
  while (scanCache.size > MAX_SCAN_CACHE_ENTRIES) scanCache.delete(scanCache.keys().next().value as string);
  try {
    return await value;
  } catch (error) {
    const current = scanCache.get(sourceUri);
    if (current?.value === value) scanCache.delete(sourceUri);
    throw error;
  }
}

async function sourceFingerprint(sourceUri: string) {
  const cached = fingerprintCache.get(sourceUri);
  if (cached && Date.now() - cached.checkedAt < 2000) return cached.value;
  let value = 'unknown';
  try {
    const info = await FileSystem.getInfoAsync(sourceUri, { size: true });
    value = !info.exists ? 'missing' : `${(info as any).modificationTime ?? 0}:${(info as any).size ?? 0}`;
  } catch {
    value = 'unknown';
  }
  fingerprintCache.set(sourceUri, { value, checkedAt: Date.now() });
  while (fingerprintCache.size > MAX_SCAN_CACHE_ENTRIES) fingerprintCache.delete(fingerprintCache.keys().next().value as string);
  return value;
}

export async function extractEpubPage(sourceUri: string, entry: string, sessionId: string) {
  if (cancelledSessions.has(sessionId)) return Promise.reject(new Error('Reader session closed'));
  const cacheRoot = FileSystem.cacheDirectory;
  if (!cacheRoot) throw new Error('应用缓存目录不可用');
  const fingerprint = await sourceFingerprint(sourceUri);
  if (cancelledSessions.has(sessionId)) throw new Error('Reader session closed');
  const targetUri = pageTargetUri(cacheRoot, sourceUri, entry, sessionId, fingerprint);
  const sessionPages = sessionPageUris.get(sessionId) ?? new Map<string, string>();
  sessionPageUris.set(sessionId, sessionPages);
  const mappedUri = sessionPages.get(entry);
  if (mappedUri === targetUri) {
    const mappedInfo = await FileSystem.getInfoAsync(mappedUri);
    if (mappedInfo.exists) return mappedUri;
    sessionPages.delete(entry);
  } else if (mappedUri) sessionPages.delete(entry);
  const active = activePages.get(targetUri);
  if (active) {
    try { return await active; } catch (error) {
      if (cancelledSessions.has(sessionId) || !(error instanceof Error) || error.message !== 'Reader session closed') throw error;
      return extractEpubPage(sourceUri, entry, sessionId);
    }
  }
  const queueKey = sourceUri + '\n' + sessionId;
  const promise = new Promise<string>((resolve, reject) => {
    pendingPages.set(targetUri, { queueKey, sourceUri, entry, sessionId, targetUri, fileName: targetUri.split('/').pop()!, resolve, reject });
    if (!pendingTimers.has(queueKey)) {
      pendingTimers.set(queueKey, setTimeout(() => {
        pendingTimers.delete(queueKey);
        const batches = runningBatches.get(sessionId) ?? new Set<Promise<void>>();
        runningBatches.set(sessionId, batches);
        const batch = flushPageQueue(queueKey).finally(() => {
          batches.delete(batch);
          if (!batches.size && runningBatches.get(sessionId) === batches) runningBatches.delete(sessionId);
        });
        batches.add(batch);
      }, 0));
    }
  });
  const task = promise.finally(() => { if (activePages.get(targetUri) === task) activePages.delete(targetUri); });
  activePages.set(targetUri, task);
  sessionPages.set(entry, targetUri);
  return task;
}

function pageTargetUri(cacheRoot: string, sourceUri: string, entry: string, sessionId: string, fingerprint: string) {
  const key = stableKey(sourceUri + '\n' + fingerprint + '\n' + entry);
  const extension = entry.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'img';
  // Cover extraction remains series-scoped. Reader and prefetch sessions use
  // a stable book/fingerprint directory so pages survive session handoff and
  // can be reused after reopening the same unchanged EPUB.
  const scope = sessionId.startsWith('cover-')
    ? sessionId
    : 'book-' + stableKey(sourceUri + '\n' + fingerprint);
  return cacheRoot + 'epub-pages/' + scope + '/' + key + '.' + extension;
}

async function flushPageQueue(queueKey: string) {
  const requests = [...pendingPages.entries()].filter(([, request]) => request.queueKey === queueKey).map(([targetUri, request]) => { pendingPages.delete(targetUri); return request; });
  if (!requests.length) return;
  try {
    const sessionId = requests[0]!.sessionId;
    if (cancelledSessions.has(sessionId)) throw new Error('Reader session closed');
    const cacheRoot = FileSystem.cacheDirectory;
    if (!cacheRoot) throw new Error('cache directory unavailable');
    const firstTarget = requests[0]!.targetUri;
    const targetDir = firstTarget.slice(0, firstTarget.lastIndexOf('/') + 1);
    const missing: PendingPage[] = [];
    for (const request of requests) {
      const info = await FileSystem.getInfoAsync(request.targetUri);
      if (!info.exists) missing.push(request);
    }
    if (missing.length) {
      if (cancelledSessions.has(sessionId)) throw new Error('Reader session closed');
      await FileSystem.makeDirectoryAsync(targetDir, { intermediates: true });
      const scanner = getSafScanner();
      if (Platform.OS === 'android' && scanner?.prepareEpubSession && scanner?.extractEpubEntriesFromSession && (sessionId.startsWith('reader-') || sessionId.startsWith('prefetch-'))) {
        const archiveKey = 'archive-' + stableKey(missing[0]!.sourceUri + '\n' + await sourceFingerprint(missing[0]!.sourceUri));
        let archive = archiveSessions.get(archiveKey);
        if (!archive) {
          const pendingArchive = Promise.resolve(scanner.prepareEpubSession(missing[0]!.sourceUri, archiveKey));
          archive = pendingArchive.catch(error => {
            if (archiveSessions.get(archiveKey) === archive) archiveSessions.delete(archiveKey);
            throw error;
          });
          archiveSessions.set(archiveKey, archive);
          while (archiveSessions.size > 32) archiveSessions.delete(archiveSessions.keys().next().value as string);
        }
        if (!sessionArchiveKeys.has(sessionId)) {
          sessionArchiveKeys.set(sessionId, archiveKey);
          archiveRefs.set(archiveKey, (archiveRefs.get(archiveKey) ?? 0) + 1);
        }
        await scanner.extractEpubEntriesFromSession(await archive, missing.map(item => item.entry), targetDir, missing.map(item => item.fileName));
      } else if (Platform.OS === 'android' && scanner?.extractEpubEntries) {
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
    if (cancelledSessions.has(sessionId)) {
      throw new Error('Reader session closed');
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
  cancelledSessions.add(sessionId);
  sessionPageUris.delete(sessionId);
  const sessionError = new Error('Reader session closed');
  for (const [queueKey, timer] of pendingTimers) {
    if (!queueKey.endsWith('\n' + sessionId)) continue;
    clearTimeout(timer);
    pendingTimers.delete(queueKey);
  }
  for (const [targetUri, request] of pendingPages) {
    if (request.sessionId !== sessionId) continue;
    pendingPages.delete(targetUri);
    request.reject(sessionError);
  }
  // Wait before releasing an archive still used by prepare/extract.
  await Promise.allSettled([...(runningBatches.get(sessionId) ?? [])]);
  const archiveKey = sessionArchiveKeys.get(sessionId);
  sessionArchiveKeys.delete(sessionId);
  const scanner = getSafScanner();
  if (archiveKey) {
    const nextRefs = (archiveRefs.get(archiveKey) ?? 1) - 1;
    if (nextRefs <= 0) {
      archiveRefs.delete(archiveKey);
      archiveSessions.delete(archiveKey);
      if (Platform.OS === 'android' && scanner?.releaseEpubSession) await scanner.releaseEpubSession(archiveKey).catch(() => undefined);
    } else archiveRefs.set(archiveKey, nextRefs);
  }
  // Extracted pages are fingerprint-scoped persistent cache entries. The
  // staged archive itself is reference-counted and is released once no
  // current/adjacent reader session needs it.

}

export function isEpubEntryUri(value: string) {
  return value.startsWith(ENTRY_PREFIX);
}

export function epubEntryFromUri(value: string) {
  return decodeURIComponent(value.slice(ENTRY_PREFIX.length));
}

async function scanEpubSource(sourceUri: string): Promise<ScannedEpub> {
  const scanner = getSafScanner();
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
    const chapterDir = chapterPath.includes('/') ? chapterPath.slice(0, chapterPath.lastIndexOf('/') + 1) : '';
    for (const match of chapter.matchAll(/<(?:img|image)[^>]+(?:src|href)=[\"']([^\"']+)[\"']/gi)) {
      const source = match[1];
      if (!source) continue;
      const imagePath = normalizePath(chapterDir + decodeURIComponent(source.split('#')[0]!));
      if (zip.file(imagePath)) pages.push({ index: pages.length, imageUri: ENTRY_PREFIX + encodeURIComponent(imagePath) });
    }
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

function stableKey(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `book-${(hash >>> 0).toString(16)}`;
}

export function normalizePath(path: string) {
  const parts: string[] = [];
  for (const part of path.replace(/\\/g, '/').split('/')) {
    if (part === '..') parts.pop();
    else if (part && part !== '.') parts.push(part);
  }
  return parts.join('/');
}
