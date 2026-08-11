const mockScan = jest.fn(async () => [
  { name: 'chapter.epub', path: '/series/chapter.epub', size: 12, directory: false, modifiedAt: 100 },
  { name: 'cover.jpg', path: '/covers/cover.jpg', size: 3, directory: false },
]);
const mockDownload = jest.fn(async () => undefined);

jest.mock('../platform/nativeContracts', () => ({
  getRemoteSource: () => ({ scan: mockScan, download: mockDownload }),
}));

import { FtpAdapter } from '../protocols';

describe('RemoteSourceAdapter', () => {
  it('keeps listing and downloading behind the source boundary', async () => {
    const adapter = new FtpAdapter();
    await adapter.connect({ endpoint: 'ftp://example.test/library' });
    expect(mockScan).not.toHaveBeenCalled();

    await expect(adapter.list('/series')).resolves.toEqual([
      { name: 'chapter.epub', path: '/series/chapter.epub', size: 12, directory: false, modifiedAt: 100 },
    ]);
    await adapter.download({ remotePath: '/series/chapter.epub', localUri: 'file:///tmp/chapter.epub' });
    expect(mockDownload).toHaveBeenCalledWith('ftp', 'ftp://example.test/library', '/series/chapter.epub', undefined, undefined, 'file:///tmp/chapter.epub');
    await adapter.disconnect();
  });
});
