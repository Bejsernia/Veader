import type { ReadingStatsSummary } from '../../domain/models';

export type DailyStatsRow = ReadingStatsSummary['daily'][number];

function dayKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dayLabel(date: Date) {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export function normalizeDailyRows(summary: ReadingStatsSummary, now = new Date()): DailyStatsRow[] {
  if (summary.range === 'all') return [...summary.daily].sort((left, right) => left.key.localeCompare(right.key));

  const count = summary.range === '7d' ? 7 : 30;
  const existing = new Map(summary.daily.map(row => [row.key, row]));
  const end = new Date(now);
  end.setHours(0, 0, 0, 0);

  return Array.from({ length: count }, (_, index) => {
    const date = new Date(end);
    date.setDate(end.getDate() - count + index + 1);
    const key = dayKey(date);
    return existing.get(key) ?? { key, label: dayLabel(date), durationMs: 0, pages: 0 };
  });
}
