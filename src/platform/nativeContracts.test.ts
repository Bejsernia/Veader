jest.mock('react-native', () => ({
  NativeModules: {},
  Platform: { OS: 'android' },
}));

import { NativeModules } from 'react-native';
import { getDocumentReader, NativeCapabilityError, requireNativeMethod } from './nativeContracts';

describe('native capability contracts', () => {
  it('reports a missing method with a stable error code', () => {
    expect(() => requireNativeMethod({}, 'DocumentReader', 'renderPage' as never)).toThrow(NativeCapabilityError);
    try {
      requireNativeMethod({}, 'DocumentReader', 'renderPage' as never);
    } catch (error) {
      expect(error).toMatchObject({ code: 'METHOD_UNAVAILABLE', moduleName: 'DocumentReader' });
    }
  });

  it('adapts legacy Android methods to the stable session/page contract', async () => {
    const renderPdfPage = jest.fn(async () => 'file:///cache/page.png');
    (NativeModules as { DocumentReader?: unknown }).DocumentReader = { renderPdfPage };
    const reader = getDocumentReader();

    await expect(reader?.renderPage?.({ uri: 'file:///book.pdf', format: 'pdf', pageIndex: 2, targetWidth: 900 })).resolves.toBe('file:///cache/page.png');
    await expect(reader?.openSession?.({ uri: 'file:///book.pdf', format: 'pdf', sessionId: 's1' })).resolves.toBe('s1');
    await expect(reader?.prefetch?.({ uri: 'file:///book.pdf', format: 'pdf', pageIndex: 0, targetWidth: 900, pageIndexes: [0, 1] })).resolves.toBeUndefined();
    await expect(reader?.closeSession?.('s1')).resolves.toBeUndefined();
    expect(renderPdfPage).toHaveBeenCalledTimes(3);
    delete (NativeModules as { DocumentReader?: unknown }).DocumentReader;
  });
});
