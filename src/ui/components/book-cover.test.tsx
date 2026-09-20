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
