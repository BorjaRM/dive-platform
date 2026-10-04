import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    globals: true,
    root: './',
    setupFiles: ['./test/bff-test-fixture.ts'],
    include: ['**/*.e2e-spec.ts'],
    exclude: [
      '**/node_modules/**',
      '**/.git/**',
      '**/dist/**',
      '**/coverage/**',
      '**/*.clerk.sandbox.e2e-spec.ts',
    ],
  },
});
