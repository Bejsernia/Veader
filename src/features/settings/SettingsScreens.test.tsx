import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { CacheSettings } from './SettingsScreens';
import { ReaderSettingsFields } from '../reader/ReaderSettingsFields';
import { cacheManager } from '../../data/cache-manager';
jest.mock('../../ui/theme', () => ({ useTheme: () => ({ tokens: jest.requireActual('../../ui/theme').lightTokens, reducedMotion: true }) }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '0.1.0' } } }));
jest.mock('../../data/reader-settings-repository', () => ({}));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View }));
jest.mock('../../data/cache-manager', () => ({ cacheManager: {
  getBreakdown: jest.fn(async () => ({ page: 0, source: 0, cover: 0, other: 0, session: 0, total: 0 })),
  getPageLimitMb: jest.fn(async () => 512), getSourceLimitMb: jest.fn(async () => 2048),
  setPageLimitMb: jest.fn(async () => 256), setSourceLimitMb: jest.fn(async () => 2048), clear: jest.fn(),
} }));

it('keeps cache edits as drafts, rejects invalid limits and saves only on explicit action', async () => {
  const screen = render(<CacheSettings back={jest.fn()} />);
  const field = screen.getByLabelText('页面缓存上限（MB）');
  await waitFor(() => expect(field.props.value).toBe('512'));
  fireEvent.changeText(field, '2');
  expect(cacheManager.setPageLimitMb).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('保存缓存上限'));
  expect(cacheManager.setPageLimitMb).not.toHaveBeenCalled();
  fireEvent.changeText(field, '256');
  fireEvent.press(screen.getByLabelText('保存缓存上限'));
  await waitFor(() => expect(cacheManager.setSourceLimitMb).toHaveBeenCalledWith(2048));
  expect(cacheManager.setPageLimitMb).toHaveBeenCalledWith(256);
});

it('emits a single preference patch and exposes the selected choice', () => {
  const change = jest.fn();
  const screen = render(<ReaderSettingsFields value={{ readingDirection: 'rtl', pageMode: 'single' }} onChange={change} />);
  expect(screen.getByLabelText('阅读方向：从右到左').props.accessibilityState.checked).toBe(true);
  fireEvent.press(screen.getByLabelText('页面布局：双页'));
  expect(change).toHaveBeenCalledWith({ pageMode: 'double' });
  expect(screen.queryByText('双页顺序')).toBeNull();
  screen.rerender(<ReaderSettingsFields value={{ pageMode: 'double' }} onChange={change} />);
  expect(screen.getByText('双页顺序')).toBeTruthy();
});
