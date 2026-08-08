import * as FileSystem from 'expo-file-system';
import { unzip } from 'react-native-zip-archive';
import { XMLParser } from 'fast-xml-parser';

export type ExtractedEpub = {
  rootUri: string;
  packagePath: string;
  packageUri: string;
  opf: any;
};

const extractionCache = new Map<string, Promise<ExtractedEpub>>();

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
