import type { RemoteSourceAdapter } from '../protocols';
import { downloadRemoteFile } from './remote-download';

function adapter(download: (uri: string) => Promise<void>): RemoteSourceAdapter {
  return {
    id: 'test',
    scheme: 'ftp',
    capabilities: { list: true, download: true, modifiedTime: true },
    connect: jest.fn(async () => undefined),
    list: jest.fn(async () => []),
    download: jest.fn(async input => {
      await download(input.localUri);
      return { localUri: input.localUri };
    }),
    disconnect: jest.fn(async () => undefined),
  };
}

class FakeFileSystem {
  files = new Map<string, number>();
  moves: Array<{ from: string; to: string }> = [];
  async makeDirectoryAsync() {}
  async getInfoAsync(uri: string) { return { exists: this.files.has(uri), size: this.files.get(uri) }; }
  async deleteAsync(uri: string) { this.files.delete(uri); }
  async moveAsync(input: { from: string; to: string }) { this.moves.push(input); this.files.set(input.to, this.files.get(input.from)!); this.files.delete(input.from); }
}

describe('atomic remote download', () => {
  it('shares one transfer between a reader and a prefetcher', async () => {
    const fs = new FakeFileSystem();
    let finish!: () => void;
    const gate = new Promise<void>(resolve => { finish = resolve; });
    const source = adapter(async uri => { fs.files.set(uri, 4); await gate; fs.files.set(uri, 12); });
    const input = { adapter: source, endpoint: 'ftp://test', remotePath: '/book.epub', targetUri: 'file:///cache/book.epub', expectedSize: 12, fileSystem: fs };
    const first = downloadRemoteFile(input);
    const second = downloadRemoteFile({ ...input, adapter: adapter(async () => { throw new Error('duplicate transfer'); }) });
    expect(second).toBe(first);
    finish();
    await expect(Promise.all([first, second])).resolves.toEqual([input.targetUri, input.targetUri]);
    expect(source.download).toHaveBeenCalledTimes(1);
    expect(fs.moves).toHaveLength(1);
  });

  it('cleans a failed transfer and lets a subsequent request retry', async () => {
    const fs = new FakeFileSystem();
    fs.files.set('file:///cache/book.epub', 12);
    const source = adapter(async uri => { fs.files.set(uri, 4); throw new Error('network lost'); });
    const input = { adapter: source, endpoint: 'ftp://test', remotePath: '/book.epub', targetUri: 'file:///cache/book.epub', expectedSize: 12, fileSystem: fs };
    await expect(downloadRemoteFile(input)).rejects.toThrow('network lost');
    expect(fs.files.get(input.targetUri)).toBe(12);
    expect(fs.files.has(input.targetUri + '.part')).toBe(false);
    expect(source.disconnect).toHaveBeenCalledTimes(1);
    await expect(downloadRemoteFile({ ...input, adapter: adapter(async uri => { fs.files.set(uri, 12); }) })).resolves.toBe(input.targetUri);
  });

  it('cleans a failed publication and propagates the original failure', async () => {
    const fs = new FakeFileSystem();
    fs.moveAsync = async () => { throw new Error('disk full'); };
    await expect(downloadRemoteFile({ adapter: adapter(async uri => { fs.files.set(uri, 12); }), endpoint: 'ftp://test', remotePath: '/book.epub', targetUri: 'file:///cache/book.epub', fileSystem: fs })).rejects.toThrow('disk full');
    expect(fs.files.size).toBe(0);
  });

  it('publishes a complete temporary download and disconnects', async () => {
    const fs = new FakeFileSystem();
    const source = adapter(async uri => { fs.files.set(uri, 12); });
    await expect(downloadRemoteFile({ adapter: source, endpoint: 'ftp://test', remotePath: '/book.epub', targetUri: 'file:///cache/book.epub', expectedSize: 12, fileSystem: fs })).resolves.toBe('file:///cache/book.epub');
    expect(fs.moves).toEqual([{ from: 'file:///cache/book.epub.part', to: 'file:///cache/book.epub' }]);
    expect(source.connect).toHaveBeenCalledTimes(1);
    expect(source.disconnect).toHaveBeenCalledTimes(1);
  });

  it('rejects a size mismatch and removes the partial file', async () => {
    const fs = new FakeFileSystem();
    const source = adapter(async uri => { fs.files.set(uri, 2); });
    await expect(downloadRemoteFile({ adapter: source, endpoint: 'ftp://test', remotePath: '/book.epub', targetUri: 'file:///cache/book.epub', expectedSize: 12, fileSystem: fs })).rejects.toThrow('不完整');
    expect(fs.files.size).toBe(0);
    expect(fs.moves).toHaveLength(0);
  });
});
