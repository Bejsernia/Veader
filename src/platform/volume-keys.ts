import { NativeModules, Platform } from 'react-native';

type VolumeKeysNativeModule = {
  setPageTurningEnabled: (enabled: boolean) => void;
};

export function setVolumeKeyPagingEnabled(enabled: boolean) {
  if (Platform.OS !== 'android') return;
  const native = NativeModules.VolumeKeys as VolumeKeysNativeModule | undefined;
  native?.setPageTurningEnabled(enabled);
}
