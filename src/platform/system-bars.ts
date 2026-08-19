import { NativeModules, Platform } from 'react-native';

type SystemBarsNativeModule = {
  setNavigationBarAppearance: (backgroundColor: string, lightIcons: boolean) => void;
};

export function setNavigationBarAppearance(backgroundColor: string, lightIcons: boolean) {
  if (Platform.OS !== 'android') return;
  const native = NativeModules.SystemBars as SystemBarsNativeModule | undefined;
  native?.setNavigationBarAppearance(backgroundColor, lightIcons);
}
