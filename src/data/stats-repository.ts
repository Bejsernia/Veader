import { getLibraryDatabase } from './database';
import type { PageViewedEvent, ReadingStatsRange, ReadingStatsSummary, StartReadingSession } from '../domain/models';
import type { StatsRepository } from '../domain/repositories';

function rangeStart(range: ReadingStatsRange, now = Date.now()) {
  if (range === 'all') return 0;
  const current = new Date(now);
  current.setHours(0, 0, 0, 0);
  current.setDate(current.getDate() - (range === '7d' ? 6 : 29));
  return current.getTime();
}

function localDateLabel(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : `${date.getMonth() + 1}/${date.getDate()}`;
}

async function recoverOpenSessions(now = Date.now()) {
  const db = await getLibraryDatabase();
  await db.runAsync(`UPDATE reading_sessions
    SET active_duration_ms = active_duration_ms + MIN(60000, MAX(0, ? - last_active_at)),
        ended_at = last_active_at + MIN(60000, MAX(0, ? - last_active_at)),
        last_active_at = last_active_at + MIN(60000, MAX(0, ? - last_active_at))
    WHERE ended_at IS NULL`, now, now, now);
}

async function startSession(input: StartReadingSession) {
  const db = await getLibraryDatabase();
  const now = input.now ?? Date.now();
  const result = await db.runAsync('INSERT INTO reading_sessions(book_id, series_id, started_at, last_active_at) VALUES(?, ?, ?, ?)', input.bookId, input.seriesId, now, now);
  return Number(result.lastInsertRowId);
}

async function recordPageViewed(input: PageViewedEvent) {
  const db = await getLibraryDatabase();
  const now = input.now ?? Date.now();
  const latest = await db.getFirstAsync<any>('SELECT page_index FROM reading_page_events WHERE session_id = ? ORDER BY id DESC LIMIT 1', input.sessionId);
  if (latest && Number(latest.page_index) === Math.round(input.pageIndex)) {
    await db.runAsync('UPDATE reading_sessions SET last_active_at = ? WHERE id = ? AND ended_at IS NULL', now, input.sessionId);
    return;
  }
  await db.withTransactionAsync(async () => {
    await db.runAsync('INSERT INTO reading_page_events(session_id, book_id, page_index, occurred_at) VALUES(?, ?, ?, ?)', input.sessionId, input.bookId, Math.max(0, Math.round(input.pageIndex)), now);
    await db.runAsync('UPDATE reading_sessions SET pages_viewed = pages_viewed + 1, last_active_at = ? WHERE id = ? AND ended_at IS NULL', now, input.sessionId);
  });
}

async function pauseSession(sessionId: number, now = Date.now()) {
  const db = await getLibraryDatabase();
  await db.runAsync(`UPDATE reading_sessions SET active_duration_ms = active_duration_ms + MIN(60000, MAX(0, ? - last_active_at)), last_active_at = ? WHERE id = ? AND ended_at IS NULL`, now, now, sessionId);
}

async function resumeSession(sessionId: number, now = Date.now()) {
  const db = await getLibraryDatabase();
  await db.runAsync('UPDATE reading_sessions SET last_active_at = ? WHERE id = ? AND ended_at IS NULL', now, sessionId);
}

async function finishSession(sessionId: number, now = Date.now()) {
  const db = await getLibraryDatabase();
  await db.runAsync(`UPDATE reading_sessions SET active_duration_ms = active_duration_ms + MIN(60000, MAX(0, ? - last_active_at)), ended_at = ?, last_active_at = ? WHERE id = ? AND ended_at IS NULL`, now, now, now, sessionId);
}

async function getSummary(range: ReadingStatsRange): Promise<ReadingStatsSummary> {
  await recoverOpenSessions();
  const db = await getLibraryDatabase();
  const start = rangeStart(range);
  const where = start > 0 ? 'WHERE started_at >= ?' : '';
  const params = start > 0 ? [start] : [];
  const total = await db.getFirstAsync<any>(`SELECT COALESCE(SUM(active_duration_ms), 0) AS duration_ms, COALESCE(SUM(pages_viewed), 0) AS pages, COUNT(*) AS sessions, COUNT(DISTINCT book_id) AS books FROM reading_sessions ${where}`, ...params);
  const dailyRows = await db.getAllAsync<any>(`SELECT strftime('%Y-%m-%d', started_at / 1000, 'unixepoch', 'localtime') AS day, SUM(active_duration_ms) AS duration_ms, SUM(pages_viewed) AS pages FROM reading_sessions ${where} GROUP BY day ORDER BY day`, ...params);
  const formatRows = await db.getAllAsync<any>(`SELECT c.format, SUM(rs.active_duration_ms) AS duration_ms, SUM(rs.pages_viewed) AS pages FROM reading_sessions rs JOIN chapters c ON c.id = rs.book_id ${where} GROUP BY c.format ORDER BY duration_ms DESC`, ...params);
  const bookRows = await db.getAllAsync<any>(`SELECT c.id, s.title AS title, c.chapter_title AS chapter_title, SUM(rs.active_duration_ms) AS duration_ms, SUM(rs.pages_viewed) AS pages, c.progress FROM reading_sessions rs JOIN chapters c ON c.id = rs.book_id JOIN series s ON s.id = c.series_id ${where} GROUP BY c.id ORDER BY duration_ms DESC LIMIT 20`, ...params);
  const authorRows = await db.getAllAsync<any>(`SELECT COALESCE(NULLIF(s.author, ''), '未知作者') AS name, SUM(rs.active_duration_ms) AS duration_ms, SUM(rs.pages_viewed) AS pages FROM reading_sessions rs JOIN series s ON s.id = rs.series_id ${where} GROUP BY name ORDER BY duration_ms DESC LIMIT 20`, ...params);
  const tagRows = await db.getAllAsync<any>(`SELECT t.id, t.name, SUM(rs.active_duration_ms) AS duration_ms, SUM(rs.pages_viewed) AS pages FROM reading_sessions rs JOIN (SELECT DISTINCT series_id, tag_id FROM series_tags) st ON st.series_id = rs.series_id JOIN tags t ON t.id = st.tag_id ${where} GROUP BY t.id ORDER BY duration_ms DESC LIMIT 30`, ...params);
  const completedChapters = await db.getFirstAsync<any>('SELECT COUNT(*) AS count FROM chapters WHERE progress >= 0.98');
  const completedSeries = await db.getFirstAsync<any>(`SELECT COUNT(*) AS count FROM series s WHERE EXISTS (SELECT 1 FROM chapters c WHERE c.series_id = s.id) AND NOT EXISTS (SELECT 1 FROM chapters c WHERE c.series_id = s.id AND c.progress < 0.98)`);
  return {
    range,
    totalDurationMs: Number(total?.duration_ms ?? 0),
    totalPages: Number(total?.pages ?? 0),
    sessionCount: Number(total?.sessions ?? 0),
    bookCount: Number(total?.books ?? 0),
    completedChapterCount: Number(completedChapters?.count ?? 0),
    completedSeriesCount: Number(completedSeries?.count ?? 0),
    daily: dailyRows.map(row => ({ key: String(row.day), label: localDateLabel(String(row.day)), durationMs: Number(row.duration_ms ?? 0), pages: Number(row.pages ?? 0) })),
    byFormat: formatRows.map(row => ({ format: row.format, durationMs: Number(row.duration_ms ?? 0), pages: Number(row.pages ?? 0) })),
    byBook: bookRows.map(row => ({ id: Number(row.id), title: String(row.title), chapterTitle: String(row.chapter_title), durationMs: Number(row.duration_ms ?? 0), pages: Number(row.pages ?? 0), progress: Number(row.progress ?? 0) })),
    byAuthor: authorRows.map(row => ({ name: String(row.name), durationMs: Number(row.duration_ms ?? 0), pages: Number(row.pages ?? 0) })),
    byTag: tagRows.map(row => ({ id: Number(row.id), name: String(row.name), durationMs: Number(row.duration_ms ?? 0), pages: Number(row.pages ?? 0) })),
  };
}

export const statsRepository: StatsRepository = { recoverOpenSessions, startSession, recordPageViewed, pauseSession, resumeSession, finishSession, getSummary };
