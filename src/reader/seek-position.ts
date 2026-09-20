/** Resolve native offsets without allowing stale scroll callbacks to undo a seek. */
export function pageAtOffset({ offset, extent, pageCount, direction, doublePage, target, moving = false }: {
  offset: number; extent: number; pageCount: number; direction: string;
  doublePage: boolean; target?: number; moving?: boolean;
}): number | undefined {
  if (extent <= 0 || pageCount <= 0 || !Number.isFinite(offset)) return undefined;
  const size = doublePage ? 2 : 1;
  const displayIndex = (page: number) => direction === 'rtl' ? pageCount - 1 - page : page;
  if (target !== undefined) {
    const targetGroup = Math.floor(displayIndex(target) / size);
    // During an animation rounding to the destination group is not arrival.
    if (moving ? Math.abs(offset - targetGroup * extent) > 1 : Math.round(offset / extent) !== targetGroup) return undefined;
    return target; // Keep the requested page within a two-page spread.
  }
  const index = Math.min(pageCount - 1, Math.max(0, Math.round(offset / extent) * size));
  return direction === 'rtl' ? pageCount - 1 - index : index;
}
