import { chapterBoundaryDelta } from './chapter-boundary';

describe('chapter boundary gestures', () => {
  it('keeps RTL edge decisions based on finger direction', () => {
    expect(chapterBoundaryDelta(-80, 'rtl', 0, 10)).toBe(-1);
    expect(chapterBoundaryDelta(80, 'rtl', 0, 10)).toBe(0);
    expect(chapterBoundaryDelta(80, 'rtl', 9, 10)).toBe(1);
    expect(chapterBoundaryDelta(-80, 'rtl', 9, 10)).toBe(0);
  });

  it('does not leave the chapter from an inward swipe', () => {
    expect(chapterBoundaryDelta(-80, 'ltr', 0, 10)).toBe(0);
    expect(chapterBoundaryDelta(80, 'ltr', 9, 10)).toBe(0);
    expect(chapterBoundaryDelta(80, 'ltr', 0, 10)).toBe(-1);
    expect(chapterBoundaryDelta(-80, 'ltr', 9, 10)).toBe(1);
  });
});
