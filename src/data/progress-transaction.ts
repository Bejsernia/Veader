export type ProgressTransactionDb = {
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
  runAsync(sql: string, ...params: unknown[]): Promise<unknown>;
};

export type ProgressTransactionInput = {
  chapterId: number;
  seriesId: number;
  progress: number;
  location: string;
  now?: number;
};

export function clampProgress(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

/** Chapter and series progress are one state transition, never two writes. */
export async function saveProgressTransaction(db: ProgressTransactionDb, input: ProgressTransactionInput) {
  const progress = clampProgress(input.progress);
  const now = input.now ?? Date.now();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'UPDATE chapters SET progress = ?, current_location = ?, last_opened_at = ?, updated_at = ? WHERE id = ?',
      progress,
      input.location,
      now,
      now,
      input.chapterId,
    );
    await db.runAsync(
      'UPDATE series SET progress = ?, current_chapter_id = ?, updated_at = ? WHERE id = ?',
      progress,
      input.chapterId,
      now,
      input.seriesId,
    );
  });
  return { progress, now };
}
