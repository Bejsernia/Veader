import { contentMaxWidth, getGridLayout, isCompactWidth } from './layout';

describe('responsive UI layout', () => {
  test.each([
    [320, 2],
    [375, 2],
    [600, 4],
    [768, 5],
    [1024, 6],
  ])('uses stable grid columns at %ipx', (width, columns) => {
    const layout = getGridLayout(width);
    expect(layout.columns).toBe(columns);
    expect(layout.cardWidth).toBeGreaterThan(0);
    expect(layout.cardWidth * columns + layout.gutter * (columns - 1) + layout.pageInset * 2).toBe(width);
  });

  test('keeps compact layouts below 380px and caps readable content', () => {
    expect(isCompactWidth(375)).toBe(true);
    expect(isCompactWidth(411)).toBe(false);
    expect(contentMaxWidth(1200)).toBe(760);
  });
});

it('caps wide covers and reduces density for large text', () => {
  expect(getGridLayout(1400).columns).toBe(6);
  expect(getGridLayout(390, 2).columns).toBe(1);
  expect(getGridLayout(390, 1.3).columns).toBe(2);
  expect(getGridLayout(1400).cardWidth).toBe(getGridLayout(1100).cardWidth);
});
