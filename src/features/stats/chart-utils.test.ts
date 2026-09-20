import type { ReadingStatsSummary } from '../../domain/models';
import { normalizeDailyRows } from './chart-utils';

const summary = (range: ReadingStatsSummary['range'], daily: ReadingStatsSummary['daily']): ReadingStatsSummary => ({
  range,
  daily,
  totalDurationMs: 0,
  totalPages: 0,
  sessionCount: 0,
  bookCount: 0,
  completedChapterCount: 0,
  completedSeriesCount: 0,
  byFormat: [],
  byBook: [],
  byAuthor: [],
  byTag: [],
});

describe('normalizeDailyRows', () => {
  const now = new Date(2026, 7, 17, 15, 30);

  it('fills the seven-day range with zero-value dates', () => {
    const rows = normalizeDailyRows(summary('7d', [{ key: '2026-08-16', label: '8/16', durationMs: 60000, pages: 1 }]), now);
    expect(rows).toHaveLength(7);
    expect(rows[5]!).toEqual({ key: '2026-08-16', label: '8/16', durationMs: 60000, pages: 1 });
    expect(rows[0]!.durationMs).toBe(0);
    expect(rows[6]!.key).toBe('2026-08-17');
  });

  it('keeps a fixed thirty-day axis', () => {
    expect(normalizeDailyRows(summary('30d', []), now)).toHaveLength(30);
  });

  it('does not manufacture dates for the all-time range', () => {
    const rows = normalizeDailyRows(summary('all', [{ key: '2026-01-01', label: '1/1', durationMs: 60000, pages: 1 }]), now);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.key).toBe('2026-01-01');
  });
});
import { currentWeekRows } from './chart-utils';

it('starts the weekly preview on Monday and excludes the preceding week', () => {
  const rows = currentWeekRows([
    { key: '2026-09-13', label: '9/13', durationMs: 120000, pages: 2 },
    { key: '2026-09-14', label: '9/14', durationMs: 60000, pages: 1 },
  ], new Date(2026, 8, 16));
  expect(rows.map(row => row.key)).toEqual(['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20']);
  expect(rows.reduce((sum, row) => sum + row.durationMs, 0)).toBe(60000);
  expect(rows[6]).toMatchObject({ label: '周日', durationMs: 0 });
});
it('keeps Sunday in the current week and handles a year boundary', () => {
  expect(currentWeekRows([], new Date(2026, 8, 20))[0]!.key).toBe('2026-09-14');
  expect(currentWeekRows([], new Date(2026, 0, 1))[0]!.key).toBe('2025-12-29');
});
