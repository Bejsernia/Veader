import type { LibraryTag, TagRelationSource } from '../domain/models';

export function mapCategoryTagRows(rows: any[]) {
  const result = new Map<number, LibraryTag[]>();
  for (const row of rows) {
    const categoryId = Number(row.category_id);
    const list = result.get(categoryId) ?? [];
    list.push({ id: Number(row.id), name: String(row.name), kind: row.kind === 'author' ? 'author' : 'general', sources: String(row.sources ?? '').split(',').filter(Boolean) as TagRelationSource[] });
    result.set(categoryId, list);
  }
  return result;
}
