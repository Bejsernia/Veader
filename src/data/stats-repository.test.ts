import { statsRepository } from './stats-repository';
const mockAll = jest.fn(async (sql: string) => sql.includes('c.chapter_title AS chapter_title') ? [
  { id: 1, title: '作品甲', chapter_title: '卷01', duration_ms: 60000, pages: 3, progress: 0.2 },
  { id: 2, title: '作品乙', chapter_title: '卷01', duration_ms: 30000, pages: 1, progress: 0.1 },
] : []);
jest.mock('./database', () => ({ getLibraryDatabase: async () => ({
  runAsync: async () => ({}), getFirstAsync: async () => ({}), getAllAsync: (...args: [string]) => mockAll(...args),
}) }));
it('retains series and chapter titles separately for identically named chapters', async () => {
  const summary = await statsRepository.getSummary('7d');
  expect(summary.byBook.map(row => [row.id, row.title, row.chapterTitle])).toEqual([[1, '作品甲', '卷01'], [2, '作品乙', '卷01']]);
  expect(mockAll.mock.calls.find(([sql]) => sql.includes('c.chapter_title AS chapter_title'))?.[0]).toContain('JOIN series s ON s.id = c.series_id');
});
