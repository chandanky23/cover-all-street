import path from 'node:path';

import { defineConfig } from 'vitest/config';

// Mirrors tsconfig.json's path aliases so test files can import sibling
// modules the same way app code does. Only src/lib's pure-logic modules
// (geoMath, matcher, heatmapSettings, streetGraph's non-RN parts) are
// expected to run under this — anything touching React Native/Expo
// native modules isn't unit-testable this way and isn't what these
// tests are for.
export default defineConfig({
  test: {
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
