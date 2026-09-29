import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    globals: true,
    root: './',
    include: ['test/iam.clerk-invitations.sandbox.e2e-spec.ts'],
    testTimeout: 360_000,
    hookTimeout: 360_000,
    fileParallelism: false,
  },
});
