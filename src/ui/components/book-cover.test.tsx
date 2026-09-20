import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { Image } from 'expo-image';
import { BookCover } from './book-cover';

jest.mock('../theme', () => ({ useTheme: () => ({ tokens: jest.requireActual('../theme').lightTokens }) }));

it('shows the title for failed covers and retries when the URI changes', () => {
  const title = '伊藤润二系列恐怖漫画富江《复仇》篇';
  const screen = render(<BookCover title={title} uri="file:///old.jpg" style={{ width: 40 }} />);
  fireEvent(screen.UNSAFE_getByType(Image), 'error');
  expect(screen.getByText(title)).toBeTruthy();
  screen.rerender(<BookCover title={title} uri="file:///replacement.jpg" style={{ width: 40 }} />);
  expect(screen.queryByText(title)).toBeNull();
  expect(screen.UNSAFE_getByType(Image).props.source).toBe('file:///replacement.jpg');
  screen.rerender(<BookCover title={title} style={{ width: 40 }} />);
  expect(screen.getByText(title)).toBeTruthy();
});

it('uses the actual cover ratio and resets it when a recycled cell changes books', () => {
  const screen = render(<BookCover natural uri="file:///wide.jpg" title="横幅封面" style={{ width: 160 }} />);
  const ratio = () => require('react-native').StyleSheet.flatten((screen.toJSON() as any).props.style).aspectRatio;
  fireEvent(screen.UNSAFE_getByType(Image), 'load', { source: { width: 1200, height: 800 } });
  expect(ratio()).toBe(1.5);
  screen.rerender(<BookCover natural uri="file:///tall.jpg" title="长封面" style={{ width: 160 }} />);
  expect(ratio()).toBe(2 / 3);
  fireEvent(screen.UNSAFE_getByType(Image), 'load', { source: { width: 600, height: 1400 } });
  expect(ratio()).toBe(600 / 1400);
  fireEvent(screen.UNSAFE_getByType(Image), 'error');
  expect(ratio()).toBe(2 / 3);
  expect(screen.getByText('长封面')).toBeTruthy();
});
