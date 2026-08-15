import type { BookFormat, StoredSource } from '../domain/models';

export type RemoteCatalogEntry = {
  name: string;
  path: string;
  size?: number;
  modifiedAt?: number;
  directory?: boolean;
};

export type RemoteChapterCandidate = {
  key: string;
  seriesName: string;
  name: string;
  path: string;
  format: BookFormat;
  size?: number;
  modifiedAt?: number;
  fingerprint: string;
  locator: string;
};

export type RemoteSeriesCandidate = {
  key: string;
  name: string;
  chapters: RemoteChapterCandidate[];
};

export type RemoteCatalog = {
  sourceId: number;
  series: RemoteSeriesCandidate[];
  chapters: RemoteChapterCandidate[];
};

export function remoteFormatFromName(name: string): BookFormat | undefined {
  const extension = name.split('.').pop()?.toLowerCase();
  return extension === 'epub' || extension === 'mobi' || extension === 'pdf' ? extension : undefined;
}

export function normalizeRemotePath(path: string) {
  return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/+/, '/');
}

export function remoteChapterLocator(sourceId: number, remotePath: string) {
  return `veader-remote://${sourceId}/${encodeURIComponent(normalizeRemotePath(remotePath))}`;
}

export function remoteFingerprint(entry: Pick<RemoteCatalogEntry, 'size' | 'modifiedAt'>) {
  return `${entry.size ?? 0}:${entry.modifiedAt ?? 0}`;
}

function seriesNameFor(source: StoredSource, path: string) {
  const parts = normalizeRemotePath(path).split('/').filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 2]! : source.name;
}

export function buildRemoteCatalog(source: StoredSource, entries: RemoteCatalogEntry[]): RemoteCatalog {
  const groups = new Map<string, RemoteChapterCandidate[]>();
  for (const entry of entries) {
    if (entry.directory) continue;
    const format = remoteFormatFromName(entry.name);
    if (!format) continue;
    const path = normalizeRemotePath(entry.path);
    const seriesName = seriesNameFor(source, path);
    const candidate: RemoteChapterCandidate = {
      key: `${source.id}:${path}`,
      seriesName,
      name: entry.name,
      path,
      format,
      size: entry.size,
      modifiedAt: entry.modifiedAt,
      fingerprint: remoteFingerprint(entry),
      locator: remoteChapterLocator(source.id, path),
    };
    const group = groups.get(seriesName) ?? [];
    group.push(candidate);
    groups.set(seriesName, group);
  }

  const series = [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true }))
    .map(([name, chapters]) => ({
      key: `${source.id}:${name}`,
      name,
      chapters: chapters.sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true })),
    }));
  return { sourceId: source.id, series, chapters: series.flatMap(item => item.chapters) };
}

export type RemoteCatalogDiff = {
  added: RemoteChapterCandidate[];
  updated: RemoteChapterCandidate[];
  unchanged: RemoteChapterCandidate[];
  removed: string[];
};

export function diffRemoteCatalog(previous: RemoteCatalog, next: RemoteCatalog): RemoteCatalogDiff {
  const previousByKey = new Map(previous.chapters.map(item => [item.key, item]));
  const nextByKey = new Map(next.chapters.map(item => [item.key, item]));
  const added: RemoteChapterCandidate[] = [];
  const updated: RemoteChapterCandidate[] = [];
  const unchanged: RemoteChapterCandidate[] = [];
  for (const chapter of next.chapters) {
    const prior = previousByKey.get(chapter.key);
    if (!prior) added.push(chapter);
    else if (prior.fingerprint !== chapter.fingerprint) updated.push(chapter);
    else unchanged.push(chapter);
  }
  const removed = [...previousByKey.keys()].filter(key => !nextByKey.has(key));
  return { added, updated, unchanged, removed };
}
