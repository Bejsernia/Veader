import { contentMaxWidth, getGridLayout, isCompactWidth } from './layout';

describe('responsive UI layout', () => {
  test.each([
    [320, 2],
    [375, 2],
    [600, 3],
    [768, 3],
    [1024, 4],
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
