import type * as SQLite from 'expo-sqlite';
import { getLibraryDatabase } from './database';
import type { LibraryTag, TagKind, TagRelationSource } from '../domain/models';
import type { TagRepository } from '../domain/repositories';

export function normalizeTagName(value: string) {
  return value.normalize('NFKC').trim().toLocaleLowerCase();
}

function isUnknownAuthor(value: string | null | undefined) {
  const normalized = String(value ?? '').trim().toLocaleLowerCase();
  return !normalized || normalized === 'unknown' || normalized === 'unknown author' || normalized === '未知' || normalized === '未知作者';
}

function mapTag(row: any, sources: TagRelationSource[] = []): LibraryTag {
  return { id: Number(row.id), name: String(row.name), kind: row.kind === 'author' ? 'author' : 'general', sources: [...new Set(sources)] };
}

async function ensureTag(db: SQLite.SQLiteDatabase, name: string, kind: TagKind) {
  const clean = name.normalize('NFKC').trim();
  const normalized = normalizeTagName(clean);
  if (!normalized) throw new Error('标签名称不能为空');
  const existing = await db.getFirstAsync<any>('SELECT * FROM tags WHERE normalized_name = ?', normalized);
  if (existing) {
    if (kind === 'author' && existing.kind !== 'author') await db.runAsync('UPDATE tags SET kind = ?, updated_at = ? WHERE id = ?', 'author', Date.now(), existing.id);
    return { id: Number(existing.id), name: String(existing.name), kind: kind === 'author' ? 'author' : existing.kind } as const;
  }
  const now = Date.now();
  const result = await db.runAsync('INSERT INTO tags(name, normalized_name, kind, created_at, updated_at) VALUES(?, ?, ?, ?, ?)', clean, normalized, kind, now, now);
  return { id: Number(result.lastInsertRowId), name: clean, kind } as const;
}

export async function listSeriesTagsForIds(seriesIds: number[]) {
  const result = new Map<number, LibraryTag[]>();
  if (!seriesIds.length) return result;
  const placeholders = seriesIds.map(() => '?').join(',');
  const db = await getLibraryDatabase();
  const rows = await db.getAllAsync<any>(`SELECT st.series_id, t.id, t.name, t.kind, st.source FROM series_tags st JOIN tags t ON t.id = st.tag_id WHERE st.series_id IN (${placeholders}) ORDER BY t.kind DESC, t.name COLLATE NOCASE`, ...seriesIds);
  for (const row of rows) {
    const list = result.get(Number(row.series_id)) ?? [];
    const existing = list.find(tag => tag.id === Number(row.id));
    if (existing) existing.sources = [...new Set([...existing.sources, row.source as TagRelationSource])];
    else list.push(mapTag(row, [row.source as TagRelationSource]));
    result.set(Number(row.series_id), list);
  }
  return result;
}

export async function listTagsWithSources() {
  const db = await getLibraryDatabase();
  const rows = await db.getAllAsync<any>('SELECT t.id, t.name, t.kind, GROUP_CONCAT(DISTINCT st.source) AS sources FROM tags t LEFT JOIN series_tags st ON st.tag_id = t.id GROUP BY t.id ORDER BY t.kind DESC, t.name COLLATE NOCASE');
  return rows.map(row => mapTag(row, String(row.sources ?? '').split(',').filter(Boolean) as TagRelationSource[]));
}

export async function syncAuthorTag(seriesId: number, author: string) {
  const db = await getLibraryDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM series_tags WHERE series_id = ? AND source = 'metadata'", seriesId);
    if (isUnknownAuthor(author)) return;
    const tag = await ensureTag(db, author, 'author');
    await db.runAsync("INSERT OR IGNORE INTO series_tags(series_id, tag_id, source, created_at) VALUES(?, ?, 'metadata', ?)", seriesId, tag.id, Date.now());
    await db.runAsync("UPDATE series SET author = ?, author_source = 'metadata', updated_at = ? WHERE id = ?", author.trim(), Date.now(), seriesId);
  });
}

async function addSeriesTag(seriesId: number, name: string, kind: TagKind = 'general') {
  const db = await getLibraryDatabase();
  let result: LibraryTag | undefined;
  await db.withTransactionAsync(async () => {
    const tag = await ensureTag(db, name, kind);
    await db.runAsync("INSERT OR IGNORE INTO series_tags(series_id, tag_id, source, created_at) VALUES(?, ?, 'manual', ?)", seriesId, tag.id, Date.now());
    if (kind === 'author') {
      const series = await db.getFirstAsync<any>('SELECT author, author_source FROM series WHERE id = ?', seriesId);
      if (isUnknownAuthor(series?.author)) await db.runAsync("UPDATE series SET author = ?, author_source = 'manual', updated_at = ? WHERE id = ?", tag.name, Date.now(), seriesId);
    }
    result = mapTag(tag, ['manual']);
  });
  return result!;
}

async function removeSeriesTag(seriesId: number, tagId: number, source: 'manual' | 'metadata' = 'manual') {
  if (source === 'metadata') throw new Error('元数据作者标签不能手动删除');
  const db = await getLibraryDatabase();
  await db.withTransactionAsync(async () => {
    const tag = await db.getFirstAsync<any>('SELECT id, name, kind FROM tags WHERE id = ?', tagId);
    const series = await db.getFirstAsync<any>('SELECT author, author_source FROM series WHERE id = ?', seriesId);
    await db.runAsync('DELETE FROM series_tags WHERE series_id = ? AND tag_id = ? AND source = ?', seriesId, tagId, source);
    if (tag?.kind !== 'author' || series?.author_source !== 'manual' || normalizeTagName(series.author) !== normalizeTagName(tag.name)) return;
    const next = await db.getFirstAsync<any>("SELECT t.name FROM series_tags st JOIN tags t ON t.id = st.tag_id WHERE st.series_id = ? AND st.source = 'manual' AND t.kind = 'author' ORDER BY st.created_at, t.id LIMIT 1", seriesId);
    if (next) await db.runAsync("UPDATE series SET author = ?, author_source = 'manual', updated_at = ? WHERE id = ?", next.name, Date.now(), seriesId);
    else await db.runAsync("UPDATE series SET author = '', author_source = 'metadata', updated_at = ? WHERE id = ?", Date.now(), seriesId);
  });
}

export const tagRepository: TagRepository = {
  listTags: listTagsWithSources,
  async listSeriesTags(seriesId) { return (await listSeriesTagsForIds([seriesId])).get(seriesId) ?? []; },
  addSeriesTag,
  removeSeriesTag,
  syncAuthorTag,
};
