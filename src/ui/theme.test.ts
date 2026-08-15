import { darkTokens, lightTokens } from './theme';

describe('theme tokens', () => {
  test('dark mode is cinematic and has readable contrast tokens', () => {
    expect(darkTokens.colors.background).toBe('#0F0E14');
    expect(darkTokens.colors.text).not.toBe(darkTokens.colors.background);
    expect(darkTokens.spacing).toEqual({ xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 });
    expect(darkTokens.motion.fast).toBe(160);
  });

  test('light mode keeps the same structural scale', () => {
    expect(lightTokens.spacing).toEqual(darkTokens.spacing);
    expect(lightTokens.radius).toEqual(darkTokens.radius);
    expect(lightTokens.colors.background).not.toBe(darkTokens.colors.background);
  });
});
