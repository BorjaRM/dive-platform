import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/bff.clerk.sandbox.e2e-spec.ts'],
    testTimeout: 360_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
