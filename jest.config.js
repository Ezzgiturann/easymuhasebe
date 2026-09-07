/**
 * Tests cover the pure logic modules only — money conversion, Turkish text
 * folding, double-entry posting, debt ageing, search matching. Those are where
 * a silent wrong answer costs the user money, and they need no device.
 *
 * `jest-expo` is here rather than a bare jest so component tests can be added
 * later without redoing the setup.
 */
module.exports = {
  preset: 'jest-expo',
  // The app imports through the `@/*` alias declared in tsconfig.
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testMatch: ['<rootDir>/src/**/*.test.ts'],
};
