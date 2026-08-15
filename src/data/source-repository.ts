import { deleteSource, listSources, renameSource, saveSource, setSourceEnabled } from '../library';
import type { SourceRepository } from '../domain/repositories';
import type { StoredSource } from '../domain/models';

export const sourceRepository: SourceRepository = {
  list: listSources,
  save: (type: StoredSource['type'], name: string, endpoint: string, bookCount?: number) => saveSource(type, name, endpoint, bookCount),
  rename: renameSource,
  remove: deleteSource,
  setEnabled: setSourceEnabled,
};
