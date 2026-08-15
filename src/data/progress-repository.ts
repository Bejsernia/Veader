import { clearSeriesHistory, updateChapterProgress } from '../library';
import type { ProgressRepository } from '../domain/repositories';
import type { ProgressUpdate } from '../domain/models';

export const progressRepository: ProgressRepository = {
  saveProgress({ chapter, progress, location }: ProgressUpdate) {
    return updateChapterProgress(chapter, progress, location);
  },
  clearHistory(seriesId) {
    return clearSeriesHistory(seriesId);
  },
};
