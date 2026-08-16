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
