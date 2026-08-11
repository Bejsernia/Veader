import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';
import { XMLParser } from 'fast-xml-parser';
import { epubEntryFromUri, extractEpubPage, scanEpub } from './epub-native';
import { getDocumentReader, getFolderPicker, getSafScanner } from './platform/nativeContracts';
import { createRemoteSourceAdapter } from './protocols';
import { trimSourceCacheToLimit } from './cache';

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
  sourceId?: number;
  remotePath?: string;
  remoteLocator?: string;
  remoteSize?: number;
  remoteModifiedAt?: number;
  contentFingerprint?: string;
  pageCount?: number;
  scanStatus?: 'indexed' | 'cached' | 'ready' | 'error';
  lastOpenedAt?: number;
};

export type StoredSource = { id: number; type: 'local' | 'smb' | 'ftp'; name: string; endpoint: string; enabled: boolean; bookCount: number; createdAt: number; updatedAt?: number };
export type LibrarySeries = { id: number; title: string; author: string; sourceUri: string; sourceId?: number; coverUri: string | null; progress: number; currentChapterId: number | null; currentChapterTitle: string | null; currentChapterNumber: number | null; chapterSearchText: string; chapterCount: number; updatedAt: number };
export type StoredChapter = StoredBook & { seriesId: number; chapterNumber: number; chapterTitle: string };

let database: Promise<SQLite.SQLiteDatabase> | undefined;
type SeriesMetadata = { title: string; author: string };
type MetadataCacheEntry = { fingerprint: string; value: Promise<SeriesMetadata> };
const metadataCache = new Map<string, MetadataCacheEntry>();
const MAX_METADATA_CACHE_ENTRIES = 64;

function getDatabase() {
  database ??= SQLite.openDatabaseAsync('veader.db');
  return database;
}

export async function initializeLibrary() {
  const db = await getDatabase();
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS series (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER,
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
      source_id INTEGER,
      chapter_number INTEGER NOT NULL,
      chapter_title TEXT NOT NULL,
      format TEXT NOT NULL CHECK(format IN ('epub','mobi','pdf')),
      local_uri TEXT NOT NULL UNIQUE,
      original_name TEXT NOT NULL,
      file_size INTEGER NOT NULL DEFAULT 0,
      remote_path TEXT,
      remote_locator TEXT,
      remote_size INTEGER,
      remote_modified_at INTEGER,
      content_fingerprint TEXT,
      page_count INTEGER,
      scan_status TEXT NOT NULL DEFAULT 'ready',
      progress REAL NOT NULL DEFAULT 0,
      current_location TEXT,
      last_opened_at INTEGER,
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
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS schema_meta (
      name TEXT PRIMARY KEY NOT NULL,
      version INTEGER NOT NULL
    );
  `);
  for (const statement of [
    'ALTER TABLE series ADD COLUMN source_id INTEGER',
    'ALTER TABLE sources ADD COLUMN book_count INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE sources ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE chapters ADD COLUMN remote_locator TEXT',
    'ALTER TABLE chapters ADD COLUMN page_count INTEGER',
    'ALTER TABLE chapters ADD COLUMN last_opened_at INTEGER',
  ]) {
    try { await db.execAsync(statement); } catch { /* Existing installations already have the column. */ }
  }
  for (const statement of [
    'ALTER TABLE chapters ADD COLUMN remote_path TEXT',
    'ALTER TABLE chapters ADD COLUMN source_id INTEGER',
    'ALTER TABLE chapters ADD COLUMN remote_size INTEGER',
    'ALTER TABLE chapters ADD COLUMN remote_modified_at INTEGER',
    'ALTER TABLE chapters ADD COLUMN content_fingerprint TEXT',
    "ALTER TABLE chapters ADD COLUMN scan_status TEXT NOT NULL DEFAULT 'ready'",
  ]) {
    try { await db.execAsync(statement); } catch { /* Existing installations already have the column. */ }
  }
  // Create indexes only after the additive migrations above. On an existing
  // database, creating an index that references a newly-added column before
  // the ALTER TABLE statements would abort the whole initialization batch.
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_chapters_remote ON chapters(source_id, remote_path, content_fingerprint)');
  const schema = await db.getFirstAsync<{ version: number }>('SELECT version FROM schema_meta WHERE name = ?', 'library');
  if (!schema) {
    await db.runAsync('INSERT INTO schema_meta(name, version) VALUES(?, ?)', 'library', 2);
  } else if (Number(schema.version) < 2) {
    await db.runAsync('UPDATE schema_meta SET version = ? WHERE name = ?', 2, 'library');
  }
}

export async function listSeries(options: { refreshMetadata?: boolean; fast?: boolean } = {}): Promise<LibrarySeries[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>(`SELECT s.*, COUNT(c.id) AS chapter_count, GROUP_CONCAT(c.chapter_title, ' ') AS chapter_search,
    (SELECT chapter_title FROM chapters current_chapter WHERE current_chapter.id = s.current_chapter_id) AS current_chapter_title,
    (SELECT chapter_number FROM chapters current_chapter WHERE current_chapter.id = s.current_chapter_id) AS current_chapter_number
    FROM series s LEFT JOIN chapters c ON c.series_id = s.id GROUP BY s.id ORDER BY s.updated_at DESC`);
  if (!options.fast) {
    await Promise.all(rows.map(async row => {
      await restoreSeriesCover(row, db);
      if (options.refreshMetadata || !String(row.author ?? '').trim()) {
        const firstChapter = await db.getFirstAsync<any>('SELECT local_uri, original_name, format FROM chapters WHERE series_id = ? ORDER BY chapter_number, original_name LIMIT 1', row.id);
        if (!firstChapter) return;
        const metadata = await scanSeriesMetadata(firstChapter.local_uri, firstChapter.original_name, firstChapter.format as BookFormat);
        if (metadata.author !== String(row.author ?? '')) {
          row.author = metadata.author;
          await db.runAsync('UPDATE series SET author = ? WHERE id = ?', metadata.author, row.id);
        }
      }
    }));
  }
  return rows.map(row => ({ id: row.id, title: row.title, author: row.author, sourceUri: row.source_uri, sourceId: row.source_id ?? undefined, coverUri: row.cover_uri, currentChapterTitle: row.current_chapter_title, currentChapterNumber: row.current_chapter_number,
    chapterSearchText: String(row.chapter_search ?? ''), progress: row.progress, currentChapterId: row.current_chapter_id, chapterCount: row.chapter_count, updatedAt: row.updated_at }));
}

async function scanSeriesMetadata(uri: string, filename: string, format: BookFormat): Promise<SeriesMetadata> {
  const fallback = { title: filename.replace(/\.(epub|mobi|pdf)$/i, ''), author: '' };
  let fingerprint = 'unknown';
  try {
    const info = await FileSystem.getInfoAsync(uri, { size: true });
    fingerprint = info.exists ? `${(info as any).modificationTime ?? 0}:${(info as any).size ?? 0}` : 'missing';
  } catch { /* Keep the unknown fingerprint and retry when the source becomes available. */ }
  const key = `${format}:${uri}`;
  const cached = metadataCache.get(key);
  if (cached?.fingerprint === fingerprint) return cached.value;
  const value = (async () => {
    if (format === 'epub') {
      try { const scanned = await scanEpub(uri); return { title: scanned.title || fallback.title, author: scanned.author }; } catch { return fallback; }
    }
    return extractMetadata(uri, filename, format);
  })();
  metadataCache.set(key, { fingerprint, value });
  while (metadataCache.size > MAX_METADATA_CACHE_ENTRIES) metadataCache.delete(metadataCache.keys().next().value as string);
  try { return await value; } catch (error) { if (metadataCache.get(key)?.value === value) metadataCache.delete(key); throw error; }
}

export async function listChapters(seriesId: number): Promise<StoredChapter[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>('SELECT * FROM chapters WHERE series_id = ? ORDER BY chapter_number, original_name', seriesId);
  return rows.map(row => ({ id: row.id, seriesId: row.series_id, chapterNumber: row.chapter_number, chapterTitle: row.chapter_title,
    title: row.chapter_title, author: '', format: row.format, localUri: row.local_uri, originalName: row.original_name, fileSize: row.file_size,
    coverUri: null, progress: row.progress, currentLocation: row.current_location, addedAt: row.added_at, updatedAt: row.updated_at,
    sourceId: row.remote_path ? Number(row.source_id ?? 0) || undefined : undefined, remotePath: row.remote_path ?? undefined,
    remoteLocator: row.remote_locator ?? undefined, remoteSize: row.remote_size ?? undefined, remoteModifiedAt: row.remote_modified_at ?? undefined,
    contentFingerprint: row.content_fingerprint ?? undefined, pageCount: row.page_count ?? undefined,
    scanStatus: row.scan_status ?? undefined, lastOpenedAt: row.last_opened_at ?? undefined }));
}

export async function updateChapterProgress(chapter: StoredChapter, progress: number, location: string) {
  const db = await getDatabase(); const safe = Math.max(0, Math.min(1, progress)); const now = Date.now();
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE chapters SET progress = ?, current_location = ?, last_opened_at = ?, updated_at = ? WHERE id = ?', safe, location, now, now, chapter.id);
    await db.runAsync('UPDATE series SET progress = ?, current_chapter_id = ?, updated_at = ? WHERE id = ?', safe, chapter.id, now, chapter.seriesId);
  });
}

export async function clearSeriesHistory(seriesId: number) {
  const db = await getDatabase(); const now = Date.now();
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE chapters SET progress = 0, current_location = NULL, last_opened_at = NULL, updated_at = ? WHERE series_id = ?', now, seriesId);
    await db.runAsync('UPDATE series SET progress = 0, current_chapter_id = NULL, updated_at = ? WHERE id = ?', now, seriesId);
  });
}

export async function recordChapterContentInfo(chapterId: number, pageCount: number, status: 'ready' | 'error' = 'ready') {
  const db = await getDatabase();
  await db.runAsync('UPDATE chapters SET page_count = ?, scan_status = ?, updated_at = ? WHERE id = ?', Math.max(0, Math.floor(pageCount)), status, Date.now(), chapterId);
}

export async function setSeriesCover(seriesId: number, coverUri: string) {
  const db = await getDatabase();
  const persistentUri = await persistCoverUri(seriesId, coverUri);
  await db.runAsync('UPDATE series SET cover_uri = ?, updated_at = ? WHERE id = ?', persistentUri, Date.now(), seriesId);
  return persistentUri;
}

async function persistCoverUri(seriesId: number, coverUri: string) {
  const root = `${FileSystem.documentDirectory}covers/`;
  if (coverUri.startsWith(root)) return coverUri;
  await FileSystem.makeDirectoryAsync(root, { intermediates: true });
  const extension = coverUri.split('?')[0]?.split('.').pop()?.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'jpg';
  const target = `${root}series-${seriesId}-${Date.now()}.${extension}`;
  await FileSystem.copyAsync({ from: coverUri, to: target });
  return target;
}

async function restoreSeriesCover(row: any, db: SQLite.SQLiteDatabase) {
  if (row.cover_uri && FileSystem.documentDirectory && String(row.cover_uri).startsWith(FileSystem.documentDirectory)) return;
  const first = await db.getFirstAsync<any>('SELECT local_uri, format FROM chapters WHERE series_id = ? ORDER BY chapter_number, original_name LIMIT 1', row.id);
  if (!first) return;
  if (row.cover_uri) {
    try {
      const info = await FileSystem.getInfoAsync(row.cover_uri);
      if (info.exists) return;
    } catch { /* Regenerate a missing cover below. */ }
  }
  try {
    const firstPage = await firstPageUri(first.local_uri, first.format as BookFormat, row.id);
    if (!firstPage) return;
    const coverUri = await persistCoverUri(row.id, firstPage);
    row.cover_uri = coverUri;
    await db.runAsync('UPDATE series SET cover_uri = ?, updated_at = ? WHERE id = ?', coverUri, Date.now(), row.id);
  } catch { /* A source may be temporarily unavailable; keep the library usable. */ }
}

export async function chooseSeriesCover(seriesId: number): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true });
  if (result.canceled) return null;
  const asset = result.assets[0]!; const root = `${FileSystem.documentDirectory}covers/`;
  await FileSystem.makeDirectoryAsync(root, { intermediates: true });
  const extension = asset.name.split('.').pop() || 'jpg'; const localUri = `${root}${seriesId}-${Date.now()}.${extension}`;
  await FileSystem.copyAsync({ from: asset.uri, to: localUri }); await setSeriesCover(seriesId, localUri); return localUri;
}

type FolderSelection = { directoryUri: string; files: { name: string; uri: string; path?: string; size?: number }[] };

async function syncIosFolderSelection(selection: FolderSelection, sourceName?: string) {
  const grouped = new Map<string, { name: string; uri: string; path?: string; size?: number }[]>();
  for (const file of selection.files ?? []) {
    const pathParts = (file.path ?? file.name).split('/').filter(Boolean);
    const seriesName = pathParts.length > 1 ? pathParts[0]! : displayName(selection.directoryUri);
    const items = grouped.get(seriesName) ?? [];
    items.push(file);
    grouped.set(seriesName, items);
  }
  const db = await getDatabase(); const now = Date.now(); const seenSeriesUris = new Set<string>(); const seenChapterUris = new Set<string>();
  for (const [seriesName, files] of grouped) {
    const sourceUri = `${selection.directoryUri}#series=${encodeURIComponent(seriesName)}`;
    seenSeriesUris.add(sourceUri);
    const existing = await db.getFirstAsync<any>('SELECT id, cover_uri FROM series WHERE source_uri = ?', sourceUri);
    const seriesId = existing ? Number(existing.id) : Number((await db.runAsync('INSERT INTO series(title, source_uri, created_at, updated_at) VALUES(?, ?, ?, ?)', cleanSeriesTitle(seriesName), sourceUri, now, now)).lastInsertRowId);
    if (existing) await db.runAsync('UPDATE series SET title = ?, updated_at = ? WHERE id = ?', cleanSeriesTitle(seriesName), now, seriesId);
    let chapterNumber = 1;
    for (const file of files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))) {
      const format = formatFromName(file.name); if (!format) continue;
      seenChapterUris.add(file.uri);
      await importChapter(file.uri, file.name, format, seriesId, chapterNumber++);
    }
    if (!existing?.cover_uri) {
      const first = await db.getFirstAsync<any>('SELECT local_uri, format FROM chapters WHERE series_id = ? ORDER BY chapter_number LIMIT 1', seriesId);
      if (first?.format) { const cover = await firstPageUri(first.local_uri, first.format as BookFormat, seriesId); if (cover) await setSeriesCover(seriesId, cover); }
    }
  }
  const oldChapters = await db.getAllAsync<any>('SELECT c.id, c.local_uri, s.source_uri FROM chapters c JOIN series s ON s.id = c.series_id');
  for (const item of oldChapters) if (typeof item.source_uri === 'string' && item.source_uri.startsWith(`${selection.directoryUri}#series=`) && !seenChapterUris.has(item.local_uri)) await db.runAsync('DELETE FROM chapters WHERE id = ?', item.id);
  const oldSeries = await db.getAllAsync<any>('SELECT id, source_uri FROM series');
  for (const item of oldSeries) if (typeof item.source_uri === 'string' && item.source_uri.startsWith(`${selection.directoryUri}#series=`) && !seenSeriesUris.has(item.source_uri)) await db.runAsync('DELETE FROM series WHERE id = ?', item.id);
  const existingSource = await db.getFirstAsync<any>('SELECT name FROM sources WHERE type = ? AND endpoint = ?', 'local', selection.directoryUri);
  const sourceCount = await db.getFirstAsync<any>('SELECT COUNT(*) AS total FROM sources WHERE type = ?', 'local');
  await saveSource('local', sourceName || existingSource?.name || `漫画源${Number(sourceCount?.total || 0) + 1}`, selection.directoryUri, grouped.size);
  return listSeries({ refreshMetadata: true });
}

// The selected directory is the library root. Its direct children are series; files below each child are chapters.
export async function configureLibraryRoot(): Promise<LibrarySeries[]> {
  await initializeLibrary();
  if (Platform.OS !== 'android') {
    const picker = getFolderPicker();
    if (!picker?.pickFolder) throw new Error('iOS 文件夹选择模块未安装，请使用文件导入或重新构建开发版');
    const selection = await picker.pickFolder() as { directoryUri: string; files: { name: string; uri: string; path?: string; size?: number }[] } | null;
    if (!selection?.directoryUri) return listSeries();
    return syncIosFolderSelection(selection);
  }
  const scanner = getSafScanner();
  if (!scanner?.scan) throw new Error('Android 文件扫描模块未加载，请重新安装当前 APK。');
  const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!permission.granted) return [];
  const nativeSeries = await scanner.scan(permission.directoryUri) as { name: string; uri: string; chapters: { name: string; uri: string }[] }[];
  const db = await getDatabase(); const now = Date.now(); let seriesCount = 0; const seenSeriesUris = new Set<string>(); const seenChapterUris = new Set<string>();
  for (const native of nativeSeries) {
    const child = native.uri; const folderName = native.name; seenSeriesUris.add(child);
    const candidates = native.chapters;
    if (!candidates.length) continue;
    const existing = await db.getFirstAsync<any>('SELECT id, cover_uri FROM series WHERE source_uri = ?', child);
    let seriesId: number;
    if (existing) { seriesId = existing.id; await db.runAsync('UPDATE series SET title = ?, updated_at = ? WHERE id = ?', cleanSeriesTitle(folderName), now, seriesId); }
    else { const created = await db.runAsync('INSERT INTO series(title, source_uri, created_at, updated_at) VALUES(?, ?, ?, ?)', cleanSeriesTitle(folderName), child, now, now); seriesId = Number(created.lastInsertRowId); }
    let chapterNumber = 1;
    for (const candidate of candidates.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))) {
      const format = formatFromName(candidate.name)!; seenChapterUris.add(candidate.uri);
      let chapter: StoredChapter;
      try { chapter = await importChapter(candidate.uri, candidate.name, format, seriesId, chapterNumber++); } catch { continue; }
      if (!existing?.cover_uri && chapterNumber === 2) {
        const firstPage = await firstPageUri(chapter.localUri, format, seriesId); if (firstPage) await setSeriesCover(seriesId, firstPage);
      }
    }
    seriesCount++;
  }
  const storedChapters = await db.getAllAsync<any>('SELECT id, local_uri FROM chapters');
  for (const chapter of storedChapters) if (typeof chapter.local_uri === 'string' && isWithinSource(chapter.local_uri, permission.directoryUri) && !seenChapterUris.has(chapter.local_uri)) await db.runAsync('DELETE FROM chapters WHERE id = ?', chapter.id);
  const storedSeries = await db.getAllAsync<any>('SELECT id, source_uri FROM series');
  for (const item of storedSeries) if (typeof item.source_uri === 'string' && isWithinSource(item.source_uri, permission.directoryUri) && !seenSeriesUris.has(item.source_uri)) await db.runAsync('DELETE FROM series WHERE id = ?', item.id);
  const existingSource = await db.getFirstAsync<any>('SELECT name FROM sources WHERE type = ? AND endpoint = ?', 'local', permission.directoryUri);
  const sourceCount = await db.getFirstAsync<any>('SELECT COUNT(*) AS total FROM sources WHERE type = ?', 'local');
  await saveSource('local', existingSource?.name || `漫画源${Number(sourceCount?.total || 0) + 1}`, permission.directoryUri, seriesCount);
  return listSeries({ refreshMetadata: true });
}

export async function refreshAllLibraries(): Promise<LibrarySeries[]> {
  await initializeLibrary();
  if (Platform.OS !== 'android') {
    const picker = getFolderPicker();
    if (!picker?.refreshFolder) return listSeries();
    const sources = await listSources();
    for (const source of sources.filter(item => item.type === 'local' && item.enabled)) {
      try {
        const selection = await picker.refreshFolder(source.endpoint) as FolderSelection | null;
        if (selection?.directoryUri) await syncIosFolderSelection(selection, source.name);
      } catch (error) {
        console.warn('iOS 漫画源刷新失败', source.endpoint, error);
      }
    }
    return listSeries({ refreshMetadata: true });
  }
  const scanner = getSafScanner();
  if (!scanner?.scan) throw new Error('Android 文件扫描模块未加载，请重新安装当前 APK。');
  const sources = await listSources();
  for (const source of sources.filter(item => item.type === 'local' && item.enabled)) {
    try {
      const nativeSeries = await scanner.scan(source.endpoint) as { name: string; uri: string; chapters: { name: string; uri: string }[] }[];
      const db = await getDatabase(); const now = Date.now(); let seriesCount = 0;
      const seenSeriesUris = new Set<string>();
      const seenChapterUris = new Set<string>();
      for (const native of nativeSeries) {
        seenSeriesUris.add(native.uri);
        if (!native.chapters.length) continue;
        const existing = await db.getFirstAsync<any>('SELECT id, cover_uri FROM series WHERE source_uri = ?', native.uri);
        let seriesId: number;
        if (existing) { seriesId = existing.id; await db.runAsync('UPDATE series SET title = ?, updated_at = ? WHERE id = ?', cleanSeriesTitle(native.name), now, seriesId); }
        else { const created = await db.runAsync('INSERT INTO series(title, source_uri, created_at, updated_at) VALUES(?, ?, ?, ?)', cleanSeriesTitle(native.name), now, now); seriesId = Number(created.lastInsertRowId); }
        let chapterNumber = 1;
        for (const candidate of native.chapters.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))) {
          const format = formatFromName(candidate.name);
          if (!format) continue;
          seenChapterUris.add(candidate.uri);
          let chapter: StoredChapter;
          try { chapter = await importChapter(candidate.uri, candidate.name, format, seriesId, chapterNumber++); } catch { continue; }
          if (!existing?.cover_uri && chapterNumber === 2) {
            const firstPage = await firstPageUri(chapter.localUri, format, seriesId); if (firstPage) await setSeriesCover(seriesId, firstPage);
          }
        }
        seriesCount++;
      }
      // A refresh must remove database rows for files/folders that no longer
      // exist under this granted source. Keep progress for entries still seen.
      const storedChapters = await db.getAllAsync<any>('SELECT id, local_uri FROM chapters');
      for (const chapter of storedChapters) {
        if (typeof chapter.local_uri === 'string' && isWithinSource(chapter.local_uri, source.endpoint) && !seenChapterUris.has(chapter.local_uri)) {
          await db.runAsync('DELETE FROM chapters WHERE id = ?', chapter.id);
        }
      }
      const storedSeries = await db.getAllAsync<any>('SELECT id, source_uri FROM series');
      for (const item of storedSeries) {
        if (typeof item.source_uri === 'string' && isWithinSource(item.source_uri, source.endpoint) && !seenSeriesUris.has(item.source_uri)) {
          await db.runAsync('DELETE FROM series WHERE id = ?', item.id);
        }
      }
      await saveSource('local', source.name, source.endpoint, seriesCount);
    } catch (error) { console.warn('漫画源刷新失败', source.endpoint, error); }
  }
  {
    for (const source of sources.filter(item => (item.type === 'ftp' || item.type === 'smb') && item.enabled)) {
      const adapter = createRemoteSourceAdapter(source.type as 'ftp' | 'smb');
      try {
        await adapter.connect({ endpoint: source.endpoint });
        const entries = await adapter.list('');
        const grouped = new Map<string, { name: string; path: string; size?: number; modifiedAt?: number }[]>();
        for (const entry of entries) {
          if (entry.directory || !formatFromName(entry.name)) continue;
          const parts = entry.path.replace(/\\/g, '/').split('/').filter(Boolean);
          const seriesName = parts.length > 1 ? parts[parts.length - 2]! : source.name;
          const items = grouped.get(seriesName) ?? []; items.push(entry); grouped.set(seriesName, items);
        }
        const db = await getDatabase(); const now = Date.now(); const seenSeriesUris = new Set<string>(); const seenChapterUris = new Set<string>(); let seriesCount = 0;
        for (const [seriesName, items] of grouped) {
          const sourceUri = `${source.endpoint}#series=${encodeURIComponent(seriesName)}`; seenSeriesUris.add(sourceUri);
          const existing = await db.getFirstAsync<any>('SELECT id, cover_uri FROM series WHERE source_uri = ?', sourceUri);
          const seriesId = existing ? Number(existing.id) : Number((await db.runAsync('INSERT INTO series(title, source_uri, created_at, updated_at) VALUES(?, ?, ?, ?)', cleanSeriesTitle(seriesName), sourceUri, now, now)).lastInsertRowId);
          if (existing) await db.runAsync('UPDATE series SET title = ?, updated_at = ? WHERE id = ?', cleanSeriesTitle(seriesName), now, seriesId);
          let chapterNumber = 1;
          for (const entry of items.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))) {
            const format = formatFromName(entry.name)!;
            const locator = remoteChapterLocator(source.id, entry.path);
            seenChapterUris.add(locator);
            await importRemoteChapter(source, locator, entry, format, seriesId, chapterNumber++);
          }
          seriesCount++;
        }
        const oldChapters = await db.getAllAsync<any>('SELECT c.id, c.local_uri, s.source_uri FROM chapters c JOIN series s ON s.id = c.series_id');
        for (const item of oldChapters) if (typeof item.source_uri === 'string' && item.source_uri.startsWith(`${source.endpoint}#series=`) && !seenChapterUris.has(item.local_uri)) await db.runAsync('DELETE FROM chapters WHERE id = ?', item.id);
        const oldSeries = await db.getAllAsync<any>('SELECT id, source_uri FROM series');
        for (const item of oldSeries) if (typeof item.source_uri === 'string' && item.source_uri.startsWith(`${source.endpoint}#series=`) && !seenSeriesUris.has(item.source_uri)) await db.runAsync('DELETE FROM series WHERE id = ?', item.id);
        await saveSource(source.type, source.name, source.endpoint, seriesCount);
      } catch (error) { console.warn('远程漫画源刷新失败', source.endpoint, error); }
      finally { await adapter.disconnect().catch(() => undefined); }
    }
  }
  return listSeries({ refreshMetadata: true });
}

async function remoteCacheTarget(sourceId: number, remotePath: string, format: BookFormat) {
  const cacheRoot = FileSystem.cacheDirectory;
  if (!cacheRoot) throw new Error('应用缓存目录不可用');
  const root = `${cacheRoot}remote-books/`; await FileSystem.makeDirectoryAsync(root, { intermediates: true });
  return `${root}${sourceId}-${encodeURIComponent(remotePath).replace(/%/g, '_')}.${format}`;
}

async function remoteCacheTargetForFingerprint(sourceId: number, remotePath: string, format: BookFormat, fingerprint: string) {
  const base = await remoteCacheTarget(sourceId, remotePath, format);
  const suffix = '.' + format;
  const safeFingerprint = encodeURIComponent(fingerprint).replace(/%/g, '_');
  return base.slice(0, -suffix.length) + '-' + safeFingerprint + suffix;
}

async function downloadWithAdapter(adapter: ReturnType<typeof createRemoteSourceAdapter>, endpoint: string, remotePath: string, localUri: string) {
  await adapter.connect({ endpoint });
  try {
    return await adapter.download({ remotePath, localUri });
  } finally {
    await adapter.disconnect().catch(() => undefined);
  }
}

function remoteChapterLocator(sourceId: number, remotePath: string) {
  return `veader-remote://${sourceId}/${encodeURIComponent(remotePath.replace(/\\/g, '/'))}`;
}

async function importRemoteChapter(source: StoredSource, locator: string, entry: { name: string; path: string; size?: number; modifiedAt?: number }, format: BookFormat, seriesId: number, chapterNumber: number): Promise<StoredChapter> {
  const db = await getDatabase();
  const existing = await db.getFirstAsync<any>('SELECT * FROM chapters WHERE series_id = ? AND remote_path = ?', seriesId, entry.path);
  const now = Date.now();
  const title = entry.name.replace(/\.(epub|mobi|pdf)$/i, '');
  const fingerprint = String(entry.size ?? 0) + ':' + String(entry.modifiedAt ?? 0);
  if (existing) {
    await db.runAsync("UPDATE chapters SET source_id = ?, chapter_number = ?, chapter_title = ?, format = ?, local_uri = ?, remote_locator = ?, remote_size = ?, remote_modified_at = ?, content_fingerprint = ?, scan_status = 'indexed', updated_at = ? WHERE id = ?", source.id, chapterNumber, title, format, locator, locator, entry.size ?? null, entry.modifiedAt ?? null, fingerprint, now, existing.id);
    return (await listChapters(seriesId)).find(chapter => chapter.id === existing.id)!;
  }
  const result = await db.runAsync("INSERT INTO chapters(series_id, source_id, chapter_number, chapter_title, format, local_uri, remote_locator, remote_path, remote_size, remote_modified_at, content_fingerprint, scan_status, original_name, file_size, added_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'indexed', ?, 0, ?, ?)", seriesId, source.id, chapterNumber, title, format, locator, locator, entry.path, entry.size ?? null, entry.modifiedAt ?? null, fingerprint, entry.name, now, now);
  return {
    id: Number(result.lastInsertRowId), seriesId, chapterNumber, chapterTitle: title, title, author: '', format,
    localUri: locator, originalName: entry.name, fileSize: 0, coverUri: null, progress: 0, currentLocation: null,
    addedAt: now, updatedAt: now, sourceId: source.id, remotePath: entry.path, remoteLocator: locator, remoteSize: entry.size, remoteModifiedAt: entry.modifiedAt,
    contentFingerprint: fingerprint, scanStatus: 'indexed',
  };
}

export async function ensureChapterLocal(chapter: StoredChapter): Promise<StoredChapter> {
  if (!chapter.remotePath || !chapter.sourceId) return chapter;
  const db = await getDatabase();
  const source = await db.getFirstAsync<any>('SELECT * FROM sources WHERE id = ?', chapter.sourceId);
  if (!source || (source.type !== 'ftp' && source.type !== 'smb')) throw new Error('远程来源不存在');
  const adapter = createRemoteSourceAdapter(source.type as 'ftp' | 'smb');
  const fingerprint = chapter.contentFingerprint || String(chapter.remoteSize ?? 0) + ':' + String(chapter.remoteModifiedAt ?? 0);
  const target = await remoteCacheTargetForFingerprint(chapter.sourceId, chapter.remotePath, chapter.format, fingerprint);
  const info = await FileSystem.getInfoAsync(target, { size: true });
  const validCache = info.exists && (chapter.remoteSize === undefined || Number((info as any).size ?? -1) === Number(chapter.remoteSize));
  if (!validCache) {
    const temporary = `${target}.part`;
    await FileSystem.deleteAsync(temporary, { idempotent: true });
    await downloadWithAdapter(adapter, source.endpoint, chapter.remotePath, temporary);
    const downloaded = await FileSystem.getInfoAsync(temporary, { size: true });
    if (!downloaded.exists || Number((downloaded as any).size ?? 0) <= 0) throw new Error('远程文件下载为空');
    await FileSystem.deleteAsync(target, { idempotent: true });
    await FileSystem.moveAsync({ from: temporary, to: target });
    await trimSourceCacheToLimit();
  }
  const localInfo = await FileSystem.getInfoAsync(target, { size: true });
  const fileSize = Number((localInfo as any).size ?? chapter.remoteSize ?? 0);
  await db.runAsync("UPDATE chapters SET local_uri = ?, file_size = ?, content_fingerprint = ?, scan_status = 'cached', updated_at = ? WHERE id = ?", target, fileSize, fingerprint, Date.now(), chapter.id);
  return { ...chapter, localUri: target, fileSize, contentFingerprint: fingerprint, scanStatus: 'cached' };
}

async function importChapter(uri: string, name: string, format: BookFormat, seriesId: number, chapterNumber: number): Promise<StoredChapter> {
  const db = await getDatabase(); const existing = await db.getFirstAsync<any>('SELECT * FROM chapters WHERE original_name = ? AND series_id = ?', name, seriesId);
  if (existing) {
    if (existing.local_uri !== uri || existing.format !== format || existing.chapter_number !== chapterNumber) {
      await db.runAsync('UPDATE chapters SET chapter_number = ?, format = ?, local_uri = ?, updated_at = ? WHERE id = ?', chapterNumber, format, uri, Date.now(), existing.id);
    }
    return (await listChapters(seriesId)).find(chapter => chapter.id === existing.id)!;
  }
  const now = Date.now(); const title = name.replace(/\.(epub|mobi|pdf)$/i, '');
  // `uri` is an Android SAF content URI. It remains the authoritative source; no original book is copied here.
  const result = await db.runAsync(`INSERT INTO chapters(series_id, chapter_number, chapter_title, format, local_uri, original_name, file_size, added_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`, seriesId, chapterNumber, title, format, uri, name, 0, now, now);
  return { id: Number(result.lastInsertRowId), seriesId, chapterNumber, chapterTitle: title, title, author: '', format, localUri: uri, originalName: name, fileSize: 0, coverUri: null, progress: 0, currentLocation: null, addedAt: now, updatedAt: now };
}

function displayName(uri: string) { return decodeURIComponent(uri).split('/').filter(Boolean).pop() ?? uri; }
function cleanSeriesTitle(value: string) { return value.replace(/^\[[^\]]+\]\s*/, '').trim(); }
function isWithinSource(value: string, endpoint: string) {
  const base = endpoint.endsWith('/') ? endpoint.slice(0, -1) : endpoint;
  return value === base || value.startsWith(`${base}/`) || value.startsWith(`${base}#`);
}
async function epubFirstPageUri(uri: string, seriesId: number): Promise<string | null> {
  try {
    const scanned = await scanEpub(uri); const page = scanned.pages[0]; if (!page) return null;
    return extractEpubPage(uri, epubEntryFromUri(page.imageUri), `cover-${seriesId}`);
  } catch { return null; }
}

async function firstPageUri(uri: string, format: BookFormat, seriesId: number): Promise<string | null> {
  if (format === 'epub') return epubFirstPageUri(uri, seriesId);
  const native = getDocumentReader();
  if (!native) return null;
  try {
    if (format === 'pdf' && native?.renderPdfPage) return String(await native.renderPdfPage(uri, 0, 720));
    if (format === 'mobi' && native?.getMobiInfo && native?.renderMobiPage) {
      const info = await native.getMobiInfo(uri);
      const firstRecord = Array.isArray(info?.imageRecords) ? Number(info.imageRecords[0]) : NaN;
      if (Number.isFinite(firstRecord)) return String(await native.renderMobiPage(uri, firstRecord, 720));
    }
  } catch { /* The source may be temporarily unavailable; restore will retry later. */ }
  return null;
}

export async function listSources(): Promise<StoredSource[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>('SELECT * FROM sources ORDER BY created_at DESC');
  return rows.map(row => ({ id: row.id, type: row.type, name: row.name, endpoint: row.endpoint, enabled: Boolean(row.enabled), bookCount: row.book_count ?? 0, createdAt: row.created_at, updatedAt: row.updated_at ?? row.created_at }));
}

export async function saveSource(type: StoredSource['type'], name: string, endpoint: string, bookCount = 0) {
  const db = await getDatabase();
  const existing = await db.getFirstAsync<any>('SELECT id FROM sources WHERE type = ? AND endpoint = ?', type, endpoint);
  const now = Date.now();
  if (existing) await db.runAsync('UPDATE sources SET name = ?, book_count = ?, enabled = 1, updated_at = ? WHERE id = ?', name, bookCount, now, existing.id);
  else await db.runAsync('INSERT INTO sources(type, name, endpoint, enabled, book_count, created_at, updated_at) VALUES(?, ?, ?, 1, ?, ?, ?)', type, name, endpoint, bookCount, now, now);
}

export async function setSourceEnabled(id: number, enabled: boolean) {
  const db = await getDatabase(); await db.runAsync('UPDATE sources SET enabled = ?, updated_at = ? WHERE id = ?', enabled ? 1 : 0, Date.now(), id);
}

export async function renameSource(id: number, name: string) {
  const db = await getDatabase();
  await db.runAsync('UPDATE sources SET name = ?, updated_at = ? WHERE id = ?', name.trim(), Date.now(), id);
}

export async function deleteSource(id: number) {
  const db = await getDatabase();
  const source = await db.getFirstAsync<any>('SELECT type, endpoint FROM sources WHERE id = ?', id);
  if (source) {
    const rows = await db.getAllAsync<any>('SELECT id, source_uri FROM series');
    for (const row of rows) {
      if (typeof row.source_uri !== 'string') continue;
      const owned = source.type === 'local'
        ? isWithinSource(row.source_uri, source.endpoint)
        : row.source_uri.startsWith(`${source.endpoint}#series=`);
      if (owned) await db.runAsync('DELETE FROM series WHERE id = ?', row.id);
    }
  }
  if (source && (source.type === 'ftp' || source.type === 'smb') && FileSystem.cacheDirectory) {
    const root = `${FileSystem.cacheDirectory}remote-books/`;
    try {
      const files = await FileSystem.readDirectoryAsync(root);
      await Promise.all(files.filter(file => file.startsWith(`${id}-`)).map(file => FileSystem.deleteAsync(`${root}${file}`, { idempotent: true }).catch(() => undefined)));
    } catch { /* The remote source may not have downloaded anything. */ }
  }
  if (source?.type === 'local' && Platform.OS === 'ios') await getFolderPicker()?.releaseFolder?.(source.endpoint);
  await db.runAsync('DELETE FROM sources WHERE id = ?', id);
}

function formatFromName(name: string): BookFormat | null {
  const extension = name.split('.').pop()?.toLowerCase();
  return extension === 'epub' || extension === 'mobi' || extension === 'pdf' ? extension : null;
}

async function extractMetadata(uri: string, filename: string, format: BookFormat) {
  const fallback = { title: filename.replace(/\.(epub|mobi|pdf)$/i, ''), author: '' };
  try {
    if (format === 'epub') return await readEpubMetadata(uri, fallback);
    if (format === 'mobi' && Platform.OS === 'android') {
      const native = getDocumentReader();
      if (native?.getMobiInfo) {
        const result = await native.getMobiInfo(uri);
        return { title: String(result?.title || fallback.title), author: String(result?.author || fallback.author) };
      }
    }
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    const bytes = base64ToBytes(base64);
    if (format === 'mobi') return readMobiMetadata(bytes, fallback);
    return readPdfMetadata(bytes, fallback);
  } catch {
    return fallback;
  }
}

async function readEpubMetadata(uri: string, fallback: { title: string; author: string }) {
  const scanned = await scanEpub(uri);
  return { title: scanned.title || fallback.title, author: scanned.author || fallback.author };
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
  let author = '';
  const headerLength = readU32(bytes, mobi + 4);
  const exth = mobi + headerLength;
  if (ascii(bytes, exth, 4) === 'EXTH') {
    const count = readU32(bytes, exth + 8);
    let offset = exth + 12;
    for (let index = 0; index < count && offset + 8 <= bytes.length; index++) {
      const type = readU32(bytes, offset); const size = readU32(bytes, offset + 4);
      if (size < 8 || offset + size > bytes.length) break;
      if (type === 100) author = decodeText(bytes.slice(offset + 8, offset + size)).replace(/\0/g, '').trim();
      offset += size;
    }
  }
  return { title: title || fallback.title, author: author || fallback.author };
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
