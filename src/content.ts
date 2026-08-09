import * as FileSystem from 'expo-file-system';
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import type { StoredBook } from './library';
import { epubEntryFromUri, ensureEpubExtracted, extractEpubPage, isEpubEntryUri, normalizePath, resolveEpubUri, scanEpub } from './epub-native';

export type RenderableContent =
  | { kind: 'html'; html: string }
  | { kind: 'pdf'; uri: string };

export type EpubComicPage = { index: number; imageUri: string };
export type EpubComic = { title: string; author: string; direction: 'ltr' | 'rtl'; pages: EpubComicPage[] };

const epubCache = new Map<string, Promise<EpubComic>>();

export async function loadEpubComic(book: StoredBook): Promise<EpubComic> {
  let cached = epubCache.get(book.localUri);
  if (!cached) { cached = parseEpubComic(book); epubCache.set(book.localUri, cached); }
  return cached;
}

export async function loadEpubPage(book: StoredBook, page: EpubComicPage, sessionId?: string) {
  if (!isEpubEntryUri(page.imageUri)) return page.imageUri;
  const uri = await extractEpubPage(book.localUri, epubEntryFromUri(page.imageUri), sessionId || 'default');
  page.imageUri = uri;
  return uri;
}

async function parseEpubComic(book: StoredBook): Promise<EpubComic> {
  try {
    const scanned = await scanEpub(book.localUri);
    return { title: scanned.title || book.title, author: scanned.author || book.author, direction: scanned.direction, pages: scanned.pages };
  } catch (reason) {
    throw reason instanceof Error ? reason : new Error(String(reason));
  }
  const extracted = await ensureEpubExtracted(book.localUri);
  const { opf, packagePath, rootUri } = extracted;
  const manifestItems = asArray<any>(opf?.manifest?.item);
  const spineItems = asArray<any>(opf?.spine?.itemref);
  const manifest = new Map(manifestItems.map(item => [item['@_id'], item]));
  const basePath = packagePath.includes('/') ? packagePath.slice(0, packagePath.lastIndexOf('/') + 1) : '';
  const pages: EpubComicPage[] = [];
  for (const itemref of spineItems) {
    const item = manifest.get(itemref?.['@_idref']);
    if (!item?.['@_href']) continue;
    const chapterPath = normalizePath(basePath + item['@_href']);
    const chapterInfo = await FileSystem.getInfoAsync(`${rootUri}${chapterPath}`);
    if (!chapterInfo.exists) continue;
    const chapter = await FileSystem.readAsStringAsync(`${rootUri}${chapterPath}`);
    const source = chapter.match(/<(?:img|image)[^>]+(?:src|href)=["']([^"']+)["']/i)?.[1];
    if (!source) continue;
    const imageUri = resolveEpubUri(rootUri, chapterPath, source!);
    const imageInfo = await FileSystem.getInfoAsync(imageUri);
    if (!imageInfo.exists) continue;
    pages.push({ index: pages.length, imageUri });
  }
  if (!pages.length) throw new Error('这个 EPUB 的 spine 中没有找到漫画页面');
  const metadata = opf?.metadata ?? {};
  const writingMode = String(asArray<any>(metadata.meta).find(meta => meta?.['@_name'] === 'primary-writing-mode')?.['@_content'] ?? '');
  return { title: textValue(metadata.title) || book.title, author: textValue(metadata.creator) || book.author, direction: writingMode.endsWith('-rl') ? 'rtl' : 'ltr', pages };
}

export async function loadRenderableContent(book: StoredBook): Promise<RenderableContent> {
  if (book.format === 'pdf') return { kind: 'pdf', uri: book.localUri };
  const base64 = await FileSystem.readAsStringAsync(book.localUri, { encoding: FileSystem.EncodingType.Base64 });
  if (book.format === 'epub') return { kind: 'html', html: await renderEpub(base64, book.title) };
  return { kind: 'html', html: renderMobi(base64ToBytes(base64), book.title) };
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
function textValue(value: unknown): string { const first = Array.isArray(value) ? value[0] : value; if (typeof first === 'string') return first.trim(); if (first && typeof first === 'object' && '#text' in first) return String((first as any)['#text']).trim(); return ''; }
function readU16(bytes: Uint8Array, offset: number) { return (((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0)) >>> 0; }
function readU32(bytes: Uint8Array, offset: number) { return (((bytes[offset] ?? 0) << 24) | ((bytes[offset + 1] ?? 0) << 16) | ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0)) >>> 0; }
function concat(chunks: Uint8Array[]) { const length = chunks.reduce((sum, value) => sum + value.length, 0); const result = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; } return result; }
function decodeText(bytes: Uint8Array) { try { return new TextDecoder('utf-8').decode(bytes); } catch { return String.fromCharCode(...bytes.slice(0, 100000)); } }
function escapeHtml(value: string) { return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!); }
function base64ToBytes(base64: string) { const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'; const clean = base64.replace(/=+$/, ''); const output = new Uint8Array(Math.floor(clean.length * 3 / 4)); let buffer = 0, bits = 0, index = 0; for (const char of clean) { const value = chars.indexOf(char); if (value < 0) continue; buffer = (buffer << 6) | value; bits += 6; if (bits >= 8) { bits -= 8; output[index++] = (buffer >> bits) & 255; } } return output.slice(0, index); }
