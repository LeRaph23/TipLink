import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    testTimeout: 30000,
    setupFiles: ['./__tests__/setup-env.ts'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
      // Next.js aliases these build-time markers internally; Vitest does not,
      // so resolve them to a no-op module instead of failing on a missing pkg.
      'server-only': resolve(__dirname, '__tests__/stubs/empty.ts'),
      'client-only': resolve(__dirname, '__tests__/stubs/empty.ts'),
    },
  },
});
