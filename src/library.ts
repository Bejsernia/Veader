import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
import { NativeModules } from 'react-native';
import { XMLParser } from 'fast-xml-parser';
import { ensureEpubExtracted } from './epub-native';

export type BookFormat = 'epub' | 'mobi' | 'pdf';

export type StoredBook = {
  id: number;
  title: string;
  author: string;
  format: BookFormat;
  localUri: string;
  originalName: string;
  fileSize: number;
  coverUri: string | null;
  progress: number;
  currentLocation: string | null;
  addedAt: number;
  updatedAt: number;
};

export type StoredSource = { id: number; type: 'local' | 'smb' | 'ftp'; name: string; endpoint: string; enabled: boolean; bookCount: number; createdAt: number };
export type LibrarySeries = { id: number; title: string; author: string; sourceUri: string; coverUri: string | null; progress: number; currentChapterId: number | null; currentChapterTitle: string | null; currentChapterNumber: number | null; chapterCount: number; updatedAt: number };
export type StoredChapter = StoredBook & { seriesId: number; chapterNumber: number; chapterTitle: string };

let database: Promise<SQLite.SQLiteDatabase> | undefined;

function getDatabase() {
  database ??= SQLite.openDatabaseAsync('veader.db');
  return database;
}

export async function initializeLibrary() {
  const db = await getDatabase();
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      author TEXT NOT NULL DEFAULT '',
      format TEXT NOT NULL CHECK(format IN ('epub','mobi','pdf')),
      local_uri TEXT NOT NULL UNIQUE,
      original_name TEXT NOT NULL,
      file_size INTEGER NOT NULL DEFAULT 0,
      cover_uri TEXT,
      progress REAL NOT NULL DEFAULT 0,
      current_location TEXT,
      added_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_books_title ON books(title);
    CREATE TABLE IF NOT EXISTS series (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      author TEXT NOT NULL DEFAULT '',
      source_uri TEXT NOT NULL UNIQUE,
      cover_uri TEXT,
      progress REAL NOT NULL DEFAULT 0,
      current_chapter_id INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS chapters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      series_id INTEGER NOT NULL REFERENCES series(id) ON DELETE CASCADE,
      chapter_number INTEGER NOT NULL,
      chapter_title TEXT NOT NULL,
      format TEXT NOT NULL CHECK(format IN ('epub','mobi','pdf')),
      local_uri TEXT NOT NULL UNIQUE,
      original_name TEXT NOT NULL,
      file_size INTEGER NOT NULL DEFAULT 0,
      progress REAL NOT NULL DEFAULT 0,
      current_location TEXT,
      added_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_chapters_series ON chapters(series_id, chapter_number);
    CREATE TABLE IF NOT EXISTS sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      username TEXT,
      secret_key TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    );
  `);
  try { await db.execAsync('ALTER TABLE sources ADD COLUMN book_count INTEGER NOT NULL DEFAULT 0'); } catch { /* Column already exists. */ }
}

export async function listSeries(): Promise<LibrarySeries[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>(`SELECT s.*, COUNT(c.id) AS chapter_count,
    (SELECT chapter_title FROM chapters current_chapter WHERE current_chapter.id = s.current_chapter_id) AS current_chapter_title,
    (SELECT chapter_number FROM chapters current_chapter WHERE current_chapter.id = s.current_chapter_id) AS current_chapter_number
    FROM series s LEFT JOIN chapters c ON c.series_id = s.id GROUP BY s.id ORDER BY s.updated_at DESC`);
  return rows.map(row => ({ id: row.id, title: row.title, author: row.author, sourceUri: row.source_uri, coverUri: row.cover_uri, currentChapterTitle: row.current_chapter_title, currentChapterNumber: row.current_chapter_number,
    progress: row.progress, currentChapterId: row.current_chapter_id, chapterCount: row.chapter_count, updatedAt: row.updated_at }));
}

export async function listChapters(seriesId: number): Promise<StoredChapter[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>('SELECT * FROM chapters WHERE series_id = ? ORDER BY chapter_number, original_name', seriesId);
  return rows.map(row => ({ id: row.id, seriesId: row.series_id, chapterNumber: row.chapter_number, chapterTitle: row.chapter_title,
    title: row.chapter_title, author: '', format: row.format, localUri: row.local_uri, originalName: row.original_name, fileSize: row.file_size,
    coverUri: null, progress: row.progress, currentLocation: row.current_location, addedAt: row.added_at, updatedAt: row.updated_at }));
}

export async function updateChapterProgress(chapter: StoredChapter, progress: number, location: string) {
  const db = await getDatabase(); const safe = Math.max(0, Math.min(1, progress)); const now = Date.now();
  await db.runAsync('UPDATE chapters SET progress = ?, current_location = ?, updated_at = ? WHERE id = ?', safe, location, now, chapter.id);
  await db.runAsync('UPDATE series SET progress = ?, current_chapter_id = ?, updated_at = ? WHERE id = ?', safe, chapter.id, now, chapter.seriesId);
}

export async function clearSeriesHistory(seriesId: number) {
  const db = await getDatabase(); const now = Date.now();
  await db.runAsync('UPDATE chapters SET progress = 0, current_location = NULL, updated_at = ? WHERE series_id = ?', now, seriesId);
  await db.runAsync('UPDATE series SET progress = 0, current_chapter_id = NULL, updated_at = ? WHERE id = ?', now, seriesId);
}

export async function setSeriesCover(seriesId: number, coverUri: string) {
  const db = await getDatabase(); await db.runAsync('UPDATE series SET cover_uri = ?, updated_at = ? WHERE id = ?', coverUri, Date.now(), seriesId);
}

export async function chooseSeriesCover(seriesId: number): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true });
  if (result.canceled) return null;
  const asset = result.assets[0]!; const root = `${FileSystem.documentDirectory}covers/`;
  await FileSystem.makeDirectoryAsync(root, { intermediates: true });
  const extension = asset.name.split('.').pop() || 'jpg'; const localUri = `${root}${seriesId}-${Date.now()}.${extension}`;
  await FileSystem.copyAsync({ from: asset.uri, to: localUri }); await setSeriesCover(seriesId, localUri); return localUri;
}

// The selected directory is the library root. Its direct children are series; files below each child are chapters.
export async function configureLibraryRoot(): Promise<LibrarySeries[]> {
  await initializeLibrary();
  const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!permission.granted) return [];
  const nativeSeries = await NativeModules.SafScanner.scan(permission.directoryUri) as { name: string; uri: string; chapters: { name: string; uri: string }[] }[];
  const db = await getDatabase(); const now = Date.now(); let seriesCount = 0;
  for (const native of nativeSeries) {
    const child = native.uri; const folderName = native.name;
    const candidates = native.chapters;
    if (!candidates.length) continue;
    const existing = await db.getFirstAsync<any>('SELECT id, cover_uri FROM series WHERE source_uri = ?', child);
    let seriesId: number;
    if (existing) { seriesId = existing.id; await db.runAsync('UPDATE series SET title = ?, updated_at = ? WHERE id = ?', cleanSeriesTitle(folderName), now, seriesId); }
    else { const created = await db.runAsync('INSERT INTO series(title, source_uri, created_at, updated_at) VALUES(?, ?, ?, ?)', cleanSeriesTitle(folderName), child, now, now); seriesId = Number(created.lastInsertRowId); }
    let chapterNumber = 1;
    for (const candidate of candidates.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))) {
      const format = formatFromName(candidate.name)!;
      let chapter: StoredChapter;
      try { chapter = await importChapter(candidate.uri, candidate.name, format, seriesId, chapterNumber++); } catch { continue; }
      if (!existing?.cover_uri && chapterNumber === 2 && format === 'epub') {
        const firstPage = await epubFirstPageUri(chapter.localUri); if (firstPage) await setSeriesCover(seriesId, firstPage);
      }
    }
    seriesCount++;
  }
  const existingSource = await db.getFirstAsync<any>('SELECT name FROM sources WHERE type = ? AND endpoint = ?', 'local', permission.directoryUri);
  const sourceCount = await db.getFirstAsync<any>('SELECT COUNT(*) AS total FROM sources WHERE type = ?', 'local');
  await saveSource('local', existingSource?.name || `漫画源${Number(sourceCount?.total || 0) + 1}`, permission.directoryUri, seriesCount);
  return listSeries();
}

async function importChapter(uri: string, name: string, format: BookFormat, seriesId: number, chapterNumber: number): Promise<StoredChapter> {
  const db = await getDatabase(); const existing = await db.getFirstAsync<any>('SELECT * FROM chapters WHERE original_name = ? AND series_id = ?', name, seriesId);
  if (existing) return (await listChapters(seriesId)).find(chapter => chapter.id === existing.id)!;
  const now = Date.now(); const title = name.replace(/\.(epub|mobi|pdf)$/i, '');
  // `uri` is an Android SAF content URI. It remains the authoritative source; no original book is copied here.
  const result = await db.runAsync(`INSERT INTO chapters(series_id, chapter_number, chapter_title, format, local_uri, original_name, file_size, added_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`, seriesId, chapterNumber, title, format, uri, name, 0, now, now);
  return { id: Number(result.lastInsertRowId), seriesId, chapterNumber, chapterTitle: title, title, author: '', format, localUri: uri, originalName: name, fileSize: 0, coverUri: null, progress: 0, currentLocation: null, addedAt: now, updatedAt: now };
}

function displayName(uri: string) { return decodeURIComponent(uri).split('/').filter(Boolean).pop() ?? uri; }
function cleanSeriesTitle(value: string) { return value.replace(/^\[[^\]]+\]\s*/, '').trim(); }
async function epubFirstPageUri(uri: string): Promise<string | null> {
  try {
    const extracted = await ensureEpubExtracted(uri); const manifest = extracted.opf?.manifest?.item ?? []; const spine = extracted.opf?.spine?.itemref ?? [];
    const items = Array.isArray(manifest) ? manifest : [manifest]; const refs = Array.isArray(spine) ? spine : [spine];
    const first = items.find((item: any) => item['@_id'] === refs[0]?.['@_idref']); if (!first) return null;
    const chapterPath = first['@_href']; const chapter = await FileSystem.readAsStringAsync(`${extracted.rootUri}${chapterPath}`);
    const source = chapter.match(/<(?:img|image)[^>]+(?:src|href)=["']([^"']+)["']/i)?.[1];
    if (!source) return null; const base = chapterPath.includes('/') ? chapterPath.slice(0, chapterPath.lastIndexOf('/') + 1) : '';
    return `${extracted.rootUri}${normalizeEpubPath(base + source)}`;
  } catch { return null; }
}
function normalizeEpubPath(value: string) { const parts: string[] = []; for (const part of value.replace(/\\/g, '/').split('/')) { if (!part || part === '.') continue; if (part === '..') parts.pop(); else parts.push(part); } return parts.join('/'); }

export async function listSources(): Promise<StoredSource[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>('SELECT * FROM sources ORDER BY created_at DESC');
  return rows.map(row => ({ id: row.id, type: row.type, name: row.name, endpoint: row.endpoint, enabled: Boolean(row.enabled), bookCount: row.book_count ?? 0, createdAt: row.created_at }));
}

export async function saveSource(type: StoredSource['type'], name: string, endpoint: string, bookCount = 0) {
  const db = await getDatabase();
  const existing = await db.getFirstAsync<any>('SELECT id FROM sources WHERE type = ? AND endpoint = ?', type, endpoint);
  if (existing) await db.runAsync('UPDATE sources SET name = ?, book_count = ?, enabled = 1 WHERE id = ?', name, bookCount, existing.id);
  else await db.runAsync('INSERT INTO sources(type, name, endpoint, enabled, book_count, created_at) VALUES(?, ?, ?, 1, ?, ?)', type, name, endpoint, bookCount, Date.now());
}

export async function setSourceEnabled(id: number, enabled: boolean) {
  const db = await getDatabase(); await db.runAsync('UPDATE sources SET enabled = ? WHERE id = ?', enabled ? 1 : 0, id);
}

export async function renameSource(id: number, name: string) {
  const db = await getDatabase();
  await db.runAsync('UPDATE sources SET name = ? WHERE id = ?', name.trim(), id);
}

export async function deleteSource(id: number) {
  const db = await getDatabase();
  const source = await db.getFirstAsync<any>('SELECT type, endpoint FROM sources WHERE id = ?', id);
  if (source?.type === 'local') await db.runAsync('DELETE FROM series WHERE source_uri LIKE ?', `${source.endpoint}%`);
  await db.runAsync('DELETE FROM sources WHERE id = ?', id);
}

export async function listStoredBooks(): Promise<StoredBook[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>('SELECT * FROM books ORDER BY updated_at DESC');
  return rows.map(row => ({
    id: row.id, title: row.title, author: row.author, format: row.format,
    localUri: row.local_uri, originalName: row.original_name, fileSize: row.file_size,
    coverUri: row.cover_uri, progress: row.progress, currentLocation: row.current_location,
    addedAt: row.added_at, updatedAt: row.updated_at,
  }));
}

export async function updateReadingProgress(id: number, progress: number, location: string) {
  const db = await getDatabase();
  await db.runAsync('UPDATE books SET progress = ?, current_location = ?, updated_at = ? WHERE id = ?', Math.max(0, Math.min(1, progress)), location, Date.now(), id);
}

export async function pickAndImportBooks(): Promise<StoredBook[]> {
  await initializeLibrary();
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/epub+zip', 'application/pdf', 'application/x-mobipocket-ebook', 'application/octet-stream'],
    multiple: true,
    copyToCacheDirectory: true,
  });
  if (result.canceled) return [];
  const imported: StoredBook[] = [];
  for (const asset of result.assets) {
    const format = formatFromName(asset.name);
    if (!format) continue;
    imported.push(await importAsset(asset.uri, asset.name, asset.size ?? 0, format));
  }
  return imported;
}

export async function pickAndImportFolder(): Promise<StoredBook[]> {
  await initializeLibrary();
  const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!permission.granted) return [];
  const candidates = await scanDirectory(permission.directoryUri, 0);
  const imported: StoredBook[] = [];
  for (const candidate of candidates) {
    const format = formatFromName(candidate.name);
    if (!format) continue;
    const info = await FileSystem.getInfoAsync(candidate.uri, { size: true });
    imported.push(await importAsset(candidate.uri, candidate.name, info.exists && 'size' in info ? info.size : 0, format));
  }
  await saveSource('local', '本地文件夹', permission.directoryUri, imported.length);
  return imported;
}

async function scanDirectory(uri: string, depth: number): Promise<{ uri: string; name: string }[]> {
  if (depth > 8) return [];
  let children: string[];
  try { children = await FileSystem.StorageAccessFramework.readDirectoryAsync(uri); }
  catch { children = await FileSystem.StorageAccessFramework.readDirectoryAsync(asTreeUri(uri)); }
  const results: { uri: string; name: string }[] = [];
  for (const child of children) {
    const name = decodeURIComponent(child).split('/').pop() ?? child;
    if (formatFromName(name)) { results.push({ uri: child, name }); continue; }
    try { results.push(...await scanDirectory(child, depth + 1)); } catch { /* A non-book file is not a directory. */ }
  }
  return results;
}

// Android returns direct children as `.../tree/<root>/document/<child>`, but Expo's
// recursive directory API accepts the child again as a tree URI on API 34.
function asTreeUri(uri: string) {
  const match = uri.match(/^(.*)\/tree\/[^/]+\/document\/(.+)$/);
  return match ? `${match[1]}/tree/${match[2]}` : uri;
}

function formatFromName(name: string): BookFormat | null {
  const extension = name.split('.').pop()?.toLowerCase();
  return extension === 'epub' || extension === 'mobi' || extension === 'pdf' ? extension : null;
}

async function importAsset(uri: string, name: string, size: number, format: BookFormat): Promise<StoredBook> {
  const root = `${FileSystem.documentDirectory}library/`;
  await FileSystem.makeDirectoryAsync(root, { intermediates: true });
  const safeName = `${Date.now()}-${name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const localUri = `${root}${safeName}`;
  await FileSystem.copyAsync({ from: uri, to: localUri });
  const metadata = await extractMetadata(localUri, name, format);
  const db = await getDatabase();
  const now = Date.now();
  const result = await db.runAsync(
    `INSERT INTO books(title, author, format, local_uri, original_name, file_size, added_at, updated_at)
     VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
    metadata.title, metadata.author, format, localUri, name, size, now, now,
  );
  return { id: Number(result.lastInsertRowId), title: metadata.title, author: metadata.author, format, localUri, originalName: name, fileSize: size, coverUri: null, progress: 0, currentLocation: null, addedAt: now, updatedAt: now };
}

async function extractMetadata(uri: string, filename: string, format: BookFormat) {
  const fallback = { title: filename.replace(/\.(epub|mobi|pdf)$/i, ''), author: '' };
  try {
    if (format === 'epub') return await readEpubMetadata(uri, fallback);
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    const bytes = base64ToBytes(base64);
    if (format === 'mobi') return readMobiMetadata(bytes, fallback);
    return readPdfMetadata(bytes, fallback);
  } catch {
    return fallback;
  }
}

async function readEpubMetadata(uri: string, fallback: { title: string; author: string }) {
  const opf = (await ensureEpubExtracted(uri)).opf;
  const metadata = opf?.metadata ?? {};
  return { title: textValue(metadata.title) || fallback.title, author: textValue(metadata.creator) || fallback.author };
}

function textValue(value: unknown): string {
  const first = Array.isArray(value) ? value[0] : value;
  if (typeof first === 'string') return first.trim();
  if (first && typeof first === 'object' && '#text' in first) return String((first as any)['#text']).trim();
  return '';
}

function readMobiMetadata(bytes: Uint8Array, fallback: { title: string; author: string }) {
  if (bytes.length < 100) return fallback;
  const record0 = readU32(bytes, 78);
  const mobi = record0 + 16;
  if (ascii(bytes, mobi, 4) !== 'MOBI') return fallback;
  const titleOffset = readU32(bytes, mobi + 84);
  const titleLength = readU32(bytes, mobi + 88);
  const title = decodeText(bytes.slice(record0 + titleOffset, record0 + titleOffset + titleLength)).replace(/\0/g, '').trim();
  return { ...fallback, title: title || fallback.title };
}

function readPdfMetadata(bytes: Uint8Array, fallback: { title: string; author: string }) {
  const sample = decodeText(bytes.slice(0, Math.min(bytes.length, 1024 * 1024)));
  const title = sample.match(/\/Title\s*\(([^)]{1,300})\)/)?.[1];
  const author = sample.match(/\/Author\s*\(([^)]{1,300})\)/)?.[1];
  return { title: unescapePdf(title) || fallback.title, author: unescapePdf(author) || fallback.author };
}

function unescapePdf(value?: string) {
  return value?.replace(/\\([()\\])/g, '$1').trim() ?? '';
}

function readU32(bytes: Uint8Array, offset: number) {
  return (((bytes[offset] ?? 0) << 24) | ((bytes[offset + 1] ?? 0) << 16) | ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0)) >>> 0;
}

function ascii(bytes: Uint8Array, offset: number, length: number) {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

function decodeText(bytes: Uint8Array) {
  try { return new TextDecoder('utf-8').decode(bytes); } catch { return String.fromCharCode(...bytes.slice(0, 100000)); }
}

function base64ToBytes(base64: string) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = base64.replace(/=+$/, '');
  const output = new Uint8Array(Math.floor(clean.length * 3 / 4));
  let buffer = 0, bits = 0, index = 0;
  for (const char of clean) {
    const value = chars.indexOf(char); if (value < 0) continue;
    buffer = (buffer << 6) | value; bits += 6;
    if (bits >= 8) { bits -= 8; output[index++] = (buffer >> bits) & 0xff; }
  }
  return output.slice(0, index);
}
