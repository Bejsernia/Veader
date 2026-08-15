import type { StoredSource } from '../domain/models';
import { buildRemoteCatalog, diffRemoteCatalog, remoteChapterLocator } from './remote-catalog';

const source: StoredSource = {
  id: 4,
  type: 'ftp',
  name: '远程漫画',
  endpoint: 'ftp://example.test/library',
  enabled: true,
  bookCount: 0,
  createdAt: 0,
};

describe('remote catalog', () => {
  it('indexes supported remote files without downloading them', () => {
    const catalog = buildRemoteCatalog(source, [
      { name: '卷02.epub', path: '/one-piece/卷02.epub', size: 20, modifiedAt: 200 },
      { name: '卷01.pdf', path: '/one-piece/卷01.pdf', size: 10, modifiedAt: 100 },
      { name: '封面.jpg', path: '/one-piece/封面.jpg', size: 1 },
      { name: '卷03.mobi', path: '/death-note/卷03.mobi', size: 30, modifiedAt: 300 },
    ]);

    expect(catalog.series.map(item => item.name)).toEqual(['death-note', 'one-piece']);
    expect(catalog.series[1]?.chapters.map(item => item.name)).toEqual(['卷01.pdf', '卷02.epub']);
    expect(catalog.chapters.every(item => item.locator.startsWith('veader-remote://'))).toBe(true);
    expect(catalog.chapters.find(item => item.name === '卷02.epub')?.fingerprint).toBe('20:200');
    expect(remoteChapterLocator(4, '/one-piece/卷02.epub')).toContain('4');
  });

  it('detects additions, remote modifications, unchanged entries, and removals', () => {
    const previous = buildRemoteCatalog(source, [
      { name: '卷01.epub', path: '/one/卷01.epub', size: 10, modifiedAt: 1 },
      { name: '卷02.epub', path: '/one/卷02.epub', size: 20, modifiedAt: 2 },
      { name: '卷03.epub', path: '/one/卷03.epub', size: 30, modifiedAt: 3 },
    ]);
    const next = buildRemoteCatalog(source, [
      { name: '卷01.epub', path: '/one/卷01.epub', size: 11, modifiedAt: 4 },
      { name: '卷02.epub', path: '/one/卷02.epub', size: 20, modifiedAt: 2 },
      { name: '卷04.epub', path: '/one/卷04.epub', size: 40, modifiedAt: 4 },
    ]);

    const diff = diffRemoteCatalog(previous, next);
    expect(diff.added.map(item => item.name)).toEqual(['卷04.epub']);
    expect(diff.updated.map(item => item.name)).toEqual(['卷01.epub']);
    expect(diff.unchanged.map(item => item.name)).toEqual(['卷02.epub']);
    expect(diff.removed).toHaveLength(1);
  });
});
