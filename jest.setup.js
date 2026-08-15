global.__DEV__ = true;

jest.mock('expo-file-system', () => ({
  documentDirectory: 'file:///test/',
  cacheDirectory: 'file:///test-cache/',
  getInfoAsync: jest.fn(async () => ({ exists: false })),
  readAsStringAsync: jest.fn(async () => '{}'),
  writeAsStringAsync: jest.fn(async () => undefined),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  impactAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('react-native-gesture-handler', () => {
  const React = require('react');
  const ReactNative = require('react-native');
  const chain = () => ({ onUpdate() { return this; }, onEnd() { return this; } });
  return {
    GestureHandlerRootView: ReactNative.View,
    GestureDetector: ({ children }) => React.createElement(ReactNative.View, null, children),
    Gesture: { Pan: chain },
  };
});
