export function getGridLayout(width: number, fontScale = 1) {
  const contentWidth = Math.min(width, 1100);
  const gutter = width >= 600 ? 16 : 12;
  const baseInset = width >= 900 ? 32 : width >= 600 ? 24 : 16;
  const pageInset = baseInset + (width - contentWidth) / 2;
  const defaultColumns = width < 360 ? 2 : width < 600 ? 3 : Math.min(6, Math.floor((contentWidth - baseInset * 2 + gutter) / (120 + gutter)));
  const columns = Math.max(1, Math.floor(defaultColumns / Math.max(1, fontScale)));
  const available = Math.max(0, width - pageInset * 2 - gutter * (columns - 1));
  return { columns, gutter, pageInset, cardWidth: available / columns };
}
export function isCompactWidth(width: number) {
  return width < 380;
}

export function contentMaxWidth(width: number) {
  return Math.min(width - 32, 760);
}
