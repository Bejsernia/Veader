export type CacheCandidate = { uri: string; size: number; modified: number };

/** Returns the oldest files that must be removed to stay under the byte limit. */
export function selectLruFilesToTrim(files: CacheCandidate[], limitBytes: number) {
  const safeLimit = Math.max(0, limitBytes);
  let total = files.reduce((sum, file) => sum + Math.max(0, file.size), 0);
  const removed: CacheCandidate[] = [];
  for (const file of [...files].sort((left, right) => left.modified - right.modified)) {
    if (total <= safeLimit) break;
    removed.push(file);
    total -= Math.max(0, file.size);
  }
  return removed;
}
