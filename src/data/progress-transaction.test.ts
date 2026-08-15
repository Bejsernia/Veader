import { clampProgress, saveProgressTransaction } from './progress-transaction';

class FakeDb {
  calls: string[] = [];
  transactions = 0;
  async withTransactionAsync(task: () => Promise<void>) {
    this.transactions += 1;
    await task();
  }
  async runAsync(sql: string) {
    this.calls.push(sql);
  }
}

describe('progress transaction', () => {
  it('clamps progress and updates chapter plus series in one transaction', async () => {
    const db = new FakeDb();
    await expect(saveProgressTransaction(db, { chapterId: 8, seriesId: 3, progress: 2, location: 'epub:12', now: 99 })).resolves.toEqual({ progress: 1, now: 99 });
    expect(db.transactions).toBe(1);
    expect(db.calls).toHaveLength(2);
    expect(db.calls[0]).toContain('UPDATE chapters');
    expect(db.calls[1]).toContain('UPDATE series');
  });

  it('normalizes non-finite progress to zero', () => {
    expect(clampProgress(Number.NaN)).toBe(0);
    expect(clampProgress(-1)).toBe(0);
    expect(clampProgress(0.5)).toBe(0.5);
    expect(clampProgress(2)).toBe(1);
  });
});
