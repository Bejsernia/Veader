import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Button } from './button';
import { IconButton } from './icon-button';
import { ThemeProvider } from '../theme';

jest.mock('../../preferences', () => ({
  loadThemeMode: jest.fn(async () => 'dark'),
  saveThemeMode: jest.fn(async () => undefined),
}));

function renderWithTheme(element: React.ReactElement) {
  return render(<ThemeProvider>{element}</ThemeProvider>);
}

describe('UI interaction primitives', () => {
  test('button fires once and exposes loading/disabled state', async () => {
    const onPress = jest.fn();
    const { getByRole, rerender } = renderWithTheme(<Button label="打开书籍" onPress={onPress} />);
    await waitFor(() => expect(getByRole('button', { name: '打开书籍' })).toBeTruthy());
    fireEvent.press(getByRole('button', { name: '打开书籍' }));
    expect(onPress).toHaveBeenCalledTimes(1);

    rerender(<ThemeProvider><Button label="打开书籍" onPress={onPress} loading /></ThemeProvider>);
    expect(getByRole('button', { name: '打开书籍' }).props.accessibilityState).toEqual(expect.objectContaining({ disabled: true, busy: true }));
  });

  test('icon button keeps an accessible 44dp target', async () => {
    const { getByRole } = renderWithTheme(<IconButton name="search" label="搜索作品" />);
    await waitFor(() => expect(getByRole('button', { name: '搜索作品' })).toBeTruthy());
    const button = getByRole('button', { name: '搜索作品' });
    expect(button).toBeTruthy();
    expect(button.props.style[0][0]).toEqual(expect.objectContaining({ width: 44, height: 44 }));
  });
});
