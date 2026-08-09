import * as FileSystem from 'expo-file-system';
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import { NativeModules, Platform } from 'react-native';
import type { StoredBook } from './library';
import { epubEntryFromUri, extractEpubPage, isEpubEntryUri, normalizePath, scanEpub } from './epub-native';
import { trimCacheToLimit } from './cache';

export type RenderableContent =
  | { kind: 'html'; html: string }
  | { kind: 'pdf'; uri: string };

export type EpubComicPage = { index: number; imageUri: string };
export type EpubComic = { title: string; author: string; direction: 'ltr' | 'rtl'; pages: EpubComicPage[] };
export type PdfPage = { index: number; imageUri: string };

type MobiSession = { sourceUri: string; bytes?: Uint8Array; records: number[]; fingerprint: string; native: boolean };
const mobiSessions = new Map<string, MobiSession>();
const MOBI_ENTRY_PREFIX = 'mobi-entry://';
const PDF_ENTRY_PREFIX = 'pdf-entry://';

export async function loadEpubComic(book: StoredBook): Promise<EpubComic> {
  // Metadata caching and source invalidation are centralized in scanEpub.
  // Do not retain a second module-level Promise cache here: it could outlive
  // a replaced source archive and reintroduce stale page tables.
  return parseEpubComic(book);
}

export async function loadEpubPage(book: StoredBook, page: EpubComicPage, sessionId?: string) {
  if (book.format === 'pdf') return loadPdfPage(book, page, 1200);
  if (book.format === 'mobi') return loadMobiPage(book, page, sessionId || 'default');
  if (!isEpubEntryUri(page.imageUri)) return page.imageUri;
  // The scanned comic is shared by readers. Keep its entry URI immutable;
  // resolved files are session-scoped and must not leak after cleanup.
  return extractEpubPage(book.localUri, epubEntryFromUri(page.imageUri), sessionId || 'default');
}

export async function loadPdfComic(book: StoredBook): Promise<EpubComic> {
  const pageCount = await getPdfPageCount(book.localUri);
  if (pageCount <= 0) throw new Error('PDF 没有可读取的页面');
  return {
    title: book.title,
    author: book.author,
    direction: 'ltr',
    pages: Array.from({ length: pageCount }, (_, index) => ({ index, imageUri: PDF_ENTRY_PREFIX + index })),
  };
}

export async function loadPdfPage(book: StoredBook, page: EpubComicPage, targetWidth: number) {
  const index = Number(page.imageUri.slice(PDF_ENTRY_PREFIX.length));
  if (!Number.isFinite(index)) throw new Error('PDF 页面索引无效');
  return renderPdfPage(book.localUri, index, targetWidth);
}

export async function loadMobiComic(book: StoredBook, sessionId: string): Promise<EpubComic> {
  const native = (NativeModules as any).DocumentReader;
  if (Platform.OS === 'android' && native?.getMobiInfo && native?.renderMobiPage) {
    const result = await native.getMobiInfo(book.localUri);
    const records: number[] = Array.isArray(result?.imageRecords) ? (result.imageRecords as unknown[]).map((value: unknown) => Number(value)).filter((value: number) => Number.isFinite(value)) : [];
    if (!records.length) throw new Error('MOBI 中没有找到漫画图片');
    const fingerprint = `${book.localUri}:${records.length}:${String(result?.title ?? '')}`;
    mobiSessions.set(sessionId, { sourceUri: book.localUri, records, fingerprint, native: true });
    while (mobiSessions.size > 4) mobiSessions.delete(mobiSessions.keys().next().value as string);
    return {
      title: String(result?.title || book.title),
      author: String(result?.author || book.author || ''),
      direction: 'ltr',
      pages: records.map((record, index) => ({ index, imageUri: MOBI_ENTRY_PREFIX + record })),
    };
  }
  const bytes = await readBinary(book.localUri);
  const parsed = parseMobi(bytes);
  const fingerprint = `${bytes.length}:${bytes[0] ?? 0}:${bytes[bytes.length - 1] ?? 0}`;
  mobiSessions.set(sessionId, { sourceUri: book.localUri, bytes, records: parsed.imageRecords, fingerprint, native: false });
  while (mobiSessions.size > 4) mobiSessions.delete(mobiSessions.keys().next().value as string);
  return {
    title: parsed.title || book.title,
    author: parsed.author || book.author,
    direction: 'ltr',
    pages: parsed.imageRecords.map((record, index) => ({ index, imageUri: MOBI_ENTRY_PREFIX + record })),
  };
}

export async function loadMobiPage(book: StoredBook, page: EpubComicPage, sessionId: string) {
  let session = mobiSessions.get(sessionId);
  if (!session || session.sourceUri !== book.localUri) {
    await loadMobiComic(book, sessionId);
    session = mobiSessions.get(sessionId);
  }
  if (!session) throw new Error('MOBI 阅读会话已失效');
  const recordIndex = Number(page.imageUri.slice(MOBI_ENTRY_PREFIX.length));
  const native = (NativeModules as any).DocumentReader;
  if (session.native && Platform.OS === 'android' && native?.renderMobiPage) {
    return String(await native.renderMobiPage(book.localUri, recordIndex, 1600));
  }
  if (!session.bytes) throw new Error('MOBI 阅读会话没有可用数据');
  const recordStart = readU32(session.bytes, 78 + recordIndex * 8);
  const recordEnd = recordIndex + 1 < readU16(session.bytes, 76) ? readU32(session.bytes, 78 + (recordIndex + 1) * 8) : session.bytes.length;
  if (recordStart >= recordEnd || recordEnd > session.bytes.length) throw new Error('MOBI 图片记录无效');
  const bytes = session.bytes.slice(recordStart, recordEnd);
  const extension = bytes[0] === 0xff && bytes[1] === 0xd8 ? 'jpg' : bytes[0] === 0x89 && bytes[1] === 0x50 ? 'png' : bytes[0] === 0x47 && bytes[1] === 0x49 ? 'gif' : 'jpg';
  const root = FileSystem.cacheDirectory;
  if (!root) throw new Error('应用缓存目录不可用');
  const uri = `${root}mobi-pages/${sessionId}/${session.fingerprint}-${page.index}.${extension}`;
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(`${root}mobi-pages/${sessionId}`, { intermediates: true });
    await FileSystem.writeAsStringAsync(uri, bytesToBase64(bytes), { encoding: FileSystem.EncodingType.Base64 });
    await trimCacheToLimit();
  }
  return uri;
}

export function clearMobiSession(sessionId: string) {
  mobiSessions.delete(sessionId);
  const root = FileSystem.cacheDirectory;
  return root ? FileSystem.deleteAsync(`${root}mobi-pages/${sessionId}`, { idempotent: true }) : Promise.resolve();
}

export function clearEpubComicCache() {
  // Kept for callers from older builds; scanEpub owns the bounded cache now.
}

export async function getPdfPageCount(uri: string) {
  const native = (NativeModules as any).DocumentReader;
  if (Platform.OS === 'android' && native?.getPdfInfo) {
    const result = await native.getPdfInfo(uri);
    return Math.max(0, Number(result?.pageCount ?? 0));
  }
  throw new Error('当前平台没有可用的 PDF 原生阅读器');
}

export async function renderPdfPage(uri: string, pageIndex: number, targetWidth: number) {
  const native = (NativeModules as any).DocumentReader;
  if (Platform.OS === 'android' && native?.renderPdfPage) {
    return String(await native.renderPdfPage(uri, pageIndex, Math.round(targetWidth)));
  }
  throw new Error('当前平台没有可用的 PDF 原生阅读器');
}

export async function cropPageImage(uri: string) {
  const native = (NativeModules as any).DocumentReader;
  if (Platform.OS === 'android' && native?.cropImage) {
    return String(await native.cropImage(uri));
  }
  // iOS uses the original URI until the native cropper is available; never
  // duplicate the source file or silently pretend a crop was performed.
  return uri;
}

async function parseEpubComic(book: StoredBook): Promise<EpubComic> {
  try {
    const scanned = await scanEpub(book.localUri);
    return { title: scanned.title || book.title, author: scanned.author || book.author, direction: scanned.direction, pages: scanned.pages };
  } catch (reason) {
    throw reason instanceof Error ? reason : new Error(String(reason));
  }
}

export async function loadRenderableContent(book: StoredBook): Promise<RenderableContent> {
  if (book.format === 'pdf') return { kind: 'pdf', uri: book.localUri };
  const base64 = await FileSystem.readAsStringAsync(book.localUri, { encoding: FileSystem.EncodingType.Base64 });
  if (book.format === 'epub') return { kind: 'html', html: await renderEpub(base64, book.title) };
  return { kind: 'html', html: renderMobi(base64ToBytes(base64), book.title) };
}

async function readBinary(uri: string) {
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  return base64ToBytes(base64);
}

function parseMobi(bytes: Uint8Array) {
  if (bytes.length < 100) throw new Error('MOBI 文件过小');
  const recordCount = readU16(bytes, 76);
  const record0 = readU32(bytes, 78);
  const compression = readU16(bytes, record0);
  const textRecordCount = readU16(bytes, record0 + 8);
  const chunks: Uint8Array[] = [];
  for (let index = 1; index <= textRecordCount && index < recordCount; index++) {
    const start = readU32(bytes, 78 + index * 8);
    const end = index + 1 < recordCount ? readU32(bytes, 78 + (index + 1) * 8) : bytes.length;
    const record = bytes.slice(start, end);
    chunks.push(compression === 2 ? decompressPalmDoc(record) : record);
  }
  const html = decodeText(concat(chunks)).replace(/\0+$/g, '');
  const imageRecords: number[] = [];
  for (let index = textRecordCount + 1; index < recordCount; index++) {
    const start = readU32(bytes, 78 + index * 8);
    const end = index + 1 < recordCount ? readU32(bytes, 78 + (index + 1) * 8) : bytes.length;
    const first = bytes[start] ?? 0;
    const second = bytes[start + 1] ?? 0;
    if ((first === 0xff && second === 0xd8) || (first === 0x89 && second === 0x50) || (first === 0x47 && second === 0x49)) imageRecords.push(index);
  }
  if (!imageRecords.length) throw new Error('MOBI 中没有找到漫画图片');
  const title = readMobiTitle(bytes, record0);
  const author = readMobiAuthor(bytes, record0);
  return { title, author, imageRecords, html };
}

function readMobiTitle(bytes: Uint8Array, record0: number) {
  const mobi = record0 + 16;
  if (ascii(bytes, mobi, 4) !== 'MOBI') return '';
  const offset = readU32(bytes, mobi + 84); const length = readU32(bytes, mobi + 88);
  return decodeText(bytes.slice(record0 + offset, record0 + offset + length)).replace(/\0/g, '').trim();
}

function readMobiAuthor(bytes: Uint8Array, record0: number) {
  const mobi = record0 + 16;
  if (ascii(bytes, mobi, 4) !== 'MOBI') return '';
  const headerLength = readU32(bytes, mobi + 4); const exth = mobi + headerLength;
  if (ascii(bytes, exth, 4) !== 'EXTH') return '';
  const count = readU32(bytes, exth + 8); let offset = exth + 12;
  for (let index = 0; index < count && offset + 8 <= bytes.length; index++) {
    const type = readU32(bytes, offset); const size = readU32(bytes, offset + 4);
    if (size < 8 || offset + size > bytes.length) break;
    if (type === 100) return decodeText(bytes.slice(offset + 8, offset + size)).replace(/\0/g, '').trim();
    offset += size;
  }
  return '';
}

function bytesToBase64(bytes: Uint8Array) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let output = ''; for (let index = 0; index < bytes.length; index += 3) { const a = bytes[index] ?? 0; const b = bytes[index + 1]; const c = bytes[index + 2]; output += alphabet[a >> 2]! + alphabet[((a & 3) << 4) | ((b ?? 0) >> 4)]! + (b === undefined ? '=' : alphabet[((b & 15) << 2) | ((c ?? 0) >> 6)]!) + (c === undefined ? '=' : alphabet[c & 63]!); }
  return output;
}

function ascii(bytes: Uint8Array, offset: number, length: number) {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

async function renderEpub(base64: string, title: string) {
  const zip = await JSZip.loadAsync(base64, { base64: true });
  const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true });
  const containerText = await zip.file('META-INF/container.xml')?.async('text');
  if (!containerText) throw new Error('EPUB 缺少 META-INF/container.xml');
  const rootfiles = parser.parse(containerText)?.container?.rootfiles?.rootfile;
  const packagePath = (Array.isArray(rootfiles) ? rootfiles[0] : rootfiles)?.['@_full-path'];
  const packageText = packagePath ? await zip.file(packagePath)?.async('text') : undefined;
  if (!packageText || !packagePath) throw new Error('EPUB 缺少 OPF 包文档');
  const opf = parser.parse(packageText)?.package;
  const manifestItems = asArray(opf?.manifest?.item);
  const spineItems = asArray(opf?.spine?.itemref);
  const manifest = new Map(manifestItems.map((item: any) => [item['@_id'], item]));
  const basePath = packagePath.includes('/') ? packagePath.slice(0, packagePath.lastIndexOf('/') + 1) : '';
  const sections: string[] = [];
  for (const itemref of spineItems) {
    const item: any = manifest.get(itemref?.['@_idref']);
    if (!item?.['@_href']) continue;
    const chapterPath = normalizePath(basePath + item['@_href']);
    const chapter = await zip.file(chapterPath)?.async('text');
    if (!chapter) continue;
    sections.push(await inlineEpubAssets(chapter, chapterPath, zip));
  }
  return htmlDocument(title, sections.join('<hr class="chapter-break"/>'));
}

async function inlineEpubAssets(html: string, chapterPath: string, zip: JSZip) {
  const chapterDir = chapterPath.includes('/') ? chapterPath.slice(0, chapterPath.lastIndexOf('/') + 1) : '';
  const matches = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/gi)];
  let output = html;
  for (const match of matches) {
    const source = match[1];
    if (!source || /^(data:|https?:|#)/i.test(source)) continue;
    const assetPath = normalizePath(chapterDir + decodeURIComponent(source.split('#')[0]!));
    const file = zip.file(assetPath);
    if (!file) continue;
    const extension = assetPath.split('.').pop()?.toLowerCase();
    const mime = extension === 'svg' ? 'image/svg+xml' : extension === 'png' ? 'image/png' : extension === 'gif' ? 'image/gif' : extension === 'webp' ? 'image/webp' : extension === 'css' ? 'text/css' : 'image/jpeg';
    if (mime === 'text/css') continue;
    const data = await file.async('base64');
    output = output.split(source).join(`data:${mime};base64,${data}`);
  }
  const body = output.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1];
  return `<section class="chapter">${body ?? output}</section>`;
}

function renderMobi(bytes: Uint8Array, title: string) {
  if (bytes.length < 100) throw new Error('MOBI 文件过小');
  const recordCount = readU16(bytes, 76);
  const offsets = Array.from({ length: recordCount }, (_, index) => readU32(bytes, 78 + index * 8));
  const record0 = offsets[0] ?? 0;
  const compression = readU16(bytes, record0);
  const textRecordCount = readU16(bytes, record0 + 8);
  const chunks: Uint8Array[] = [];
  for (let index = 1; index <= textRecordCount && index < offsets.length; index++) {
    const start = offsets[index] ?? 0;
    const end = offsets[index + 1] ?? bytes.length;
    const record = bytes.slice(start, end);
    chunks.push(compression === 2 ? decompressPalmDoc(record) : record);
  }
  const html = decodeText(concat(chunks)).replace(/\0+$/g, '');
  return htmlDocument(title, /<body/i.test(html) ? (html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html) : `<pre>${escapeHtml(html)}</pre>`);
}

function decompressPalmDoc(input: Uint8Array) {
  const output: number[] = [];
  for (let i = 0; i < input.length;) {
    const value = input[i++] ?? 0;
    if (value === 0 || (value >= 9 && value <= 0x7f)) output.push(value);
    else if (value >= 1 && value <= 8) for (let j = 0; j < value && i < input.length; j++) output.push(input[i++] ?? 0);
    else if (value >= 0xc0) { output.push(0x20, value ^ 0x80); }
    else {
      const next = input[i++] ?? 0;
      const pair = (value << 8) | next;
      const distance = (pair >> 3) & 0x7ff;
      const length = (pair & 7) + 3;
      for (let j = 0; j < length; j++) output.push(output[output.length - distance] ?? 0x20);
    }
  }
  return Uint8Array.from(output);
}

function htmlDocument(title: string, body: string) {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=4"><style>body{margin:0;padding:20px;background:#f5f1e9;color:#242126;font:18px/1.75 system-ui,-apple-system,sans-serif}h1,h2,h3{text-align:left;line-height:1.3}img,svg{display:block;max-width:100%;height:auto;margin:0 auto 16px}.chapter{display:block;max-width:880px;margin:auto}.chapter-break{border:0;height:30px}pre{white-space:pre-wrap;font:inherit}</style><title>${escapeHtml(title)}</title></head><body>${body}</body></html>`;
}

function asArray<T>(value: T | T[] | undefined): T[] { return value === undefined ? [] : Array.isArray(value) ? value : [value]; }
function readU16(bytes: Uint8Array, offset: number) { return (((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0)) >>> 0; }
function readU32(bytes: Uint8Array, offset: number) { return (((bytes[offset] ?? 0) << 24) | ((bytes[offset + 1] ?? 0) << 16) | ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0)) >>> 0; }
function concat(chunks: Uint8Array[]) { const length = chunks.reduce((sum, value) => sum + value.length, 0); const result = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; } return result; }
function decodeText(bytes: Uint8Array) { try { return new TextDecoder('utf-8').decode(bytes); } catch { return String.fromCharCode(...bytes.slice(0, 100000)); } }
function escapeHtml(value: string) { return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!); }
function base64ToBytes(base64: string) { const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'; const clean = base64.replace(/=+$/, ''); const output = new Uint8Array(Math.floor(clean.length * 3 / 4)); let buffer = 0, bits = 0, index = 0; for (const char of clean) { const value = chars.indexOf(char); if (value < 0) continue; buffer = (buffer << 6) | value; bits += 6; if (bits >= 8) { bits -= 8; output[index++] = (buffer >> bits) & 255; } } return output.slice(0, index); }
