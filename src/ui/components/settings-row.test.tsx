import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { SettingsRow } from './settings-row';
jest.mock('../theme', () => ({ useTheme: () => ({ tokens: jest.requireActual('../theme').lightTokens }) }));

it('activates a settings destination and leaves informational rows noninteractive', () => {
  const onPress = jest.fn();
  const screen = render(<SettingsRow title="缓存" onPress={onPress} />);
  fireEvent.press(screen.getByRole('button'));
  expect(onPress).toHaveBeenCalledTimes(1);
  screen.rerender(<SettingsRow title="缓存" value="512 MB" />);
  expect(screen.queryByRole('button')).toBeNull();
});
