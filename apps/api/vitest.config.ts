import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    globals: true,
    root: './',
    setupFiles: ['./test/bff-test-fixture.ts'],
    include: [
      'src/**/*.spec.ts',
      'test/clerk.sandbox-config.spec.ts',
      'test/clerk.browser-session.spec.ts',
    ],
    exclude: ['node_modules', 'dist', 'coverage', 'src/**/*.e2e-spec.ts'],
  },
});
