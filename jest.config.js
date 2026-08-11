module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.[jt]sx?$': ['babel-jest', { presets: ['babel-preset-expo'] }],
  },
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  testPathIgnorePatterns: ['/node_modules/', '/android/'],
  modulePathIgnorePatterns: ['<rootDir>/.tools/'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@unimodules/.*|unimodules|sentry-expo|react-navigation|@react-navigation/.*))',
  ],
  clearMocks: true,
};
