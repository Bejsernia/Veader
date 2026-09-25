import React from 'react';
import { render } from '@testing-library/react-native';
import { ScreenHeader } from './screen-header';

jest.mock('../theme', () => ({ useTheme: () => ({ tokens: jest.requireActual('../theme').lightTokens }) }));

it('places the page title on a separate line below the back action', () => {
  const screen = render(<ScreenHeader title="全局阅读设置" back={jest.fn()} subtitle="默认设置" />);
  const root = screen.toJSON() as any;
  expect(screen.getByLabelText('返回')).toBeTruthy();
  expect(root.children[0].type).toBe('View');
  expect(root.children[1].type).toBe('Text');
  expect(root.children[1].children).toContain('全局阅读设置');
  expect(root.children[2].children).toContain('默认设置');
});
