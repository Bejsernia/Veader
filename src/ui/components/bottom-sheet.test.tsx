import React from 'react';
import { Modal, Text } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { BottomSheet } from './bottom-sheet';
let mockReducedMotion = false;
const mockCompletions: Array<(finished: boolean) => void> = [];
jest.mock('../theme', () => ({ useTheme: () => ({ tokens: jest.requireActual('../theme').lightTokens, reducedMotion: mockReducedMotion }) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }) }));
jest.mock('react-native-reanimated', () => ({
  ...require('react-native-reanimated/mock'),
  runOnJS: (fn: Function) => fn,
  withTiming: (value: number, _config: unknown, complete?: (finished: boolean) => void) => {
    if (complete) mockCompletions.push(complete);
    return value;
  },
}));
beforeEach(() => { mockReducedMotion = false; mockCompletions.length = 0; });
const content = <Text>外观选项</Text>;
it('retains the modal until exit completes and ignores an outdated exit after reopening', () => {
  const close = jest.fn();
  const screen = render(<BottomSheet visible onClose={close}>{content}</BottomSheet>);
  expect(screen.UNSAFE_getByType(Modal).props.animationType).toBe('none');
  fireEvent(screen.UNSAFE_getByType(Modal), 'show');
  fireEvent.press(screen.getByLabelText('关闭面板'));
  expect(close).toHaveBeenCalledTimes(1);
  screen.rerender(<BottomSheet visible={false} onClose={close}>{content}</BottomSheet>);
  expect(screen.UNSAFE_getByType(Modal).props.visible).toBe(true);
  const oldExit = mockCompletions[0]!;
  screen.rerender(<BottomSheet visible onClose={close}>{content}</BottomSheet>);
  act(() => oldExit(true));
  expect(screen.UNSAFE_getByType(Modal).props.visible).toBe(true);
  screen.rerender(<BottomSheet visible={false} onClose={close}>{content}</BottomSheet>);
  act(() => mockCompletions[mockCompletions.length - 1]!(true));
  expect(screen.UNSAFE_getByType(Modal).props.visible).toBe(false);
});
it('closes immediately with reduced motion and preserves native back handling', () => {
  mockReducedMotion = true;
  const close = jest.fn();
  const screen = render(<BottomSheet visible onClose={close}>{content}</BottomSheet>);
  fireEvent(screen.UNSAFE_getByType(Modal), 'requestClose');
  expect(close).toHaveBeenCalledTimes(1);
  screen.rerender(<BottomSheet visible={false} onClose={close}>{content}</BottomSheet>);
  expect(screen.UNSAFE_getByType(Modal).props.visible).toBe(false);
  expect(mockCompletions).toHaveLength(0);
});
