export function getGridLayout(width: number) {
  const columns = width >= 900 ? 4 : width >= 600 ? 3 : 2;
  const gutter = width >= 600 ? 24 : 16;
  const pageInset = width >= 900 ? 32 : width >= 600 ? 24 : 16;
  const available = Math.max(0, width - pageInset * 2 - gutter * (columns - 1));
  return { columns, gutter, pageInset, cardWidth: available / columns };
}
export function isCompactWidth(width: number) {
  return width < 380;
}

export function contentMaxWidth(width: number) {
  return Math.min(width - 32, 760);
}
