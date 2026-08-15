jest.mock('../content', () => ({
  clearMobiSession: jest.fn(async () => undefined),
  loadEpubComic: jest.fn(async () => ({ title: 'EPUB', author: 'Author', direction: 'rtl', pages: [{ index: 0, imageUri: 'epub://page-0' }] })),
  loadEpubPage: jest.fn(async () => 'file:///cache/epub-page.png'),
  loadMobiComic: jest.fn(async () => ({ title: 'MOBI', author: 'Author', direction: 'ltr', pages: [{ index: 0, imageUri: 'mobi://page-0' }] })),
  loadMobiPage: jest.fn(async () => 'file:///cache/mobi-page.jpg'),
  loadPdfComic: jest.fn(async () => ({ title: 'PDF', author: 'Author', direction: 'ltr', pages: [{ index: 0, imageUri: 'pdf://page-0' }] })),
  loadPdfPage: jest.fn(async () => 'file:///cache/pdf-page.png'),
}));

jest.mock('../epub-native', () => ({
  clearEpubSession: jest.fn(async () => undefined),
}));

const mockOpenSession = jest.fn(async (input: { sessionId: string }) => input.sessionId);
const mockCloseSession = jest.fn(async () => undefined);

jest.mock('../platform/nativeContracts', () => ({
  getDocumentReader: () => ({ openSession: mockOpenSession, closeSession: mockCloseSession }),
}));

import { contentLoader } from './content-loader';
import { loadMobiPage } from '../content';

const locator = (format: 'epub' | 'pdf' | 'mobi') => ({
  uri: `file:///books/sample.${format}`,
  format,
  title: 'Sample',
  author: 'Author',
});

describe('content loader boundary', () => {
  beforeEach(() => jest.clearAllMocks());

  it('accepts all supported formats and returns normalized metadata', async () => {
    for (const format of ['epub', 'pdf', 'mobi'] as const) {
      expect(contentLoader.canHandle(format)).toBe(true);
      await expect(contentLoader.scan(locator(format))).resolves.toMatchObject({ pageCount: 1 });
    }
  });

  it('opens a session, renders pages through the format adapter and closes it', async () => {
    const session = await contentLoader.open(locator('mobi'), { sessionId: 'reader-1', targetWidth: 1440 });

    await expect(session.getPage(0, { targetWidth: 900 })).resolves.toEqual({ index: 0, uri: 'file:///cache/mobi-page.jpg' });
    await session.prefetch([0], { targetWidth: 900 });
    await session.retry(0, { targetWidth: 900 });
    await session.close();

    expect(mockOpenSession).toHaveBeenCalledWith(expect.objectContaining({ format: 'mobi', sessionId: 'reader-1' }));
    expect(loadMobiPage).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'reader-1', 900);
    expect(mockCloseSession).toHaveBeenCalledWith('reader-1');
  });
});
