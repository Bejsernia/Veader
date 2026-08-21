export type ReaderDirection = 'ltr' | 'rtl' | 'vertical';

/**
 * Converts a finger movement at a chapter edge into a chapter transition.
 * This intentionally uses finger coordinates only; FlatList content offsets
 * have the opposite sign in RTL mode and must not be mixed into this rule.
 */
export function chapterBoundaryDelta(
  movement: number,
  direction: ReaderDirection,
  currentPage: number,
  pageCount: number,
  threshold = 24,
): -1 | 0 | 1 {
  if (!Number.isFinite(movement) || Math.abs(movement) < threshold || pageCount <= 0) return 0;
  const next = direction === 'vertical' ? movement < 0 : direction === 'rtl' ? movement > 0 : movement < 0;
  const previous = direction === 'vertical' ? movement > 0 : direction === 'rtl' ? movement < 0 : movement > 0;
  if (next && currentPage >= pageCount - 1) return 1;
  if (previous && currentPage <= 0) return -1;
  return 0;
}
