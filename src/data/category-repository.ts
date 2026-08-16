import { getLibraryDatabase } from './database';
import { listSeries } from '../library';
import type { Category, LibraryTag } from '../domain/models';
import type { CategoryRepository } from '../domain/repositories';
import { mapCategoryTagRows } from './category-utils';

async function listCategories(): Promise<Category[]> {
  const db = await getLibraryDatabase();
  const rows = await db.getAllAsync<any>(`SELECT c.id, c.name, c.created_at, c.updated_at, COUNT(DISTINCT s.id) AS book_count
    FROM categories c
    LEFT JOIN category_tags ct ON ct.category_id = c.id
    LEFT JOIN series_tags st ON st.tag_id = ct.tag_id
    LEFT JOIN series s ON s.id = st.series_id
    GROUP BY c.id ORDER BY c.updated_at DESC, c.name COLLATE NOCASE`);
  const tags = await db.getAllAsync<any>(`SELECT ct.category_id, t.id, t.name, t.kind, GROUP_CONCAT(DISTINCT st.source) AS sources
    FROM category_tags ct JOIN tags t ON t.id = ct.tag_id
    LEFT JOIN series_tags st ON st.tag_id = t.id
    GROUP BY ct.category_id, t.id ORDER BY t.kind DESC, t.name COLLATE NOCASE`);
  const tagMap = mapCategoryTagRows(tags);
  return rows.map(row => ({ id: Number(row.id), name: String(row.name), tags: tagMap.get(Number(row.id)) ?? [], bookCount: Number(row.book_count ?? 0), createdAt: Number(row.created_at), updatedAt: Number(row.updated_at) }));
}

async function saveCategory(id: number | undefined, name: string, tagIds: number[]) {
  const clean = name.normalize('NFKC').trim();
  if (!clean) throw new Error('分类名称不能为空');
  const db = await getLibraryDatabase();
  let categoryId = id;
  await db.withTransactionAsync(async () => {
    const now = Date.now();
    if (categoryId === undefined) {
      const result = await db.runAsync('INSERT INTO categories(name, created_at, updated_at) VALUES(?, ?, ?)', clean, now, now);
      categoryId = Number(result.lastInsertRowId);
    } else {
      await db.runAsync('UPDATE categories SET name = ?, updated_at = ? WHERE id = ?', clean, now, categoryId);
      await db.runAsync('DELETE FROM category_tags WHERE category_id = ?', categoryId);
    }
    for (const tagId of [...new Set(tagIds)]) await db.runAsync('INSERT OR IGNORE INTO category_tags(category_id, tag_id) VALUES(?, ?)', categoryId, tagId);
  });
  return categoryId!;
}

const categoryRepository: CategoryRepository = {
  listCategories,
  createCategory: (name, tagIds) => saveCategory(undefined, name, tagIds),
  updateCategory: async (id, name, tagIds) => { await saveCategory(id, name, tagIds); },
  async deleteCategory(id) {
    const db = await getLibraryDatabase();
    await db.runAsync('DELETE FROM categories WHERE id = ?', id);
  },
  async listSeriesByCategory(categoryId) {
    const db = await getLibraryDatabase();
    const rows = await db.getAllAsync<{ id: number }>(`SELECT DISTINCT s.id FROM series s JOIN series_tags st ON st.series_id = s.id JOIN category_tags ct ON ct.tag_id = st.tag_id WHERE ct.category_id = ?`, categoryId);
    const ids = new Set(rows.map(row => Number(row.id)));
    return (await listSeries({ fast: true })).filter(series => ids.has(series.id));
  },
};

export { categoryRepository };
