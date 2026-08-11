jest.mock('react-native', () => ({
  NativeModules: {},
  Platform: { OS: 'android' },
}));

import { NativeCapabilityError, requireNativeMethod } from './nativeContracts';

describe('native capability contracts', () => {
  it('reports a missing method with a stable error code', () => {
    expect(() => requireNativeMethod({}, 'DocumentReader', 'renderPage' as never)).toThrow(NativeCapabilityError);
    try {
      requireNativeMethod({}, 'DocumentReader', 'renderPage' as never);
    } catch (error) {
      expect(error).toMatchObject({ code: 'METHOD_UNAVAILABLE', moduleName: 'DocumentReader' });
    }
  });
});
