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
