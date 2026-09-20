import { pageAtOffset } from './seek-position';

const base = { extent: 400, pageCount: 100, direction: 'ltr', doublePage: false };
it('ignores old and intermediate events before and after a seek settles', () => {
  const seek = { ...base, target: 70 };
  expect(pageAtOffset({ ...seek, offset: 400 })).toBeUndefined();
  expect(pageAtOffset({ ...seek, offset: 27900, moving: true })).toBeUndefined();
  expect(pageAtOffset({ ...seek, offset: 28000, moving: true })).toBe(70);
  expect(pageAtOffset({ ...seek, offset: 400 })).toBeUndefined();
  expect(pageAtOffset({ ...base, offset: 28400 })).toBe(71);
});
it('only accepts the newest destination when seeks overlap', () => {
  expect(pageAtOffset({ ...base, target: 20, offset: 28000 })).toBeUndefined();
  expect(pageAtOffset({ ...base, target: 20, offset: 8000 })).toBe(20);
});
it.each(['ltr', 'rtl', 'vertical'])('preserves the requested page in a %s spread', direction => {
  const target = 7;
  const group = Math.floor((direction === 'rtl' ? 99 - target : target) / 2);
  expect(pageAtOffset({ ...base, direction, doublePage: true, target, offset: group * 400 })).toBe(target);
});
