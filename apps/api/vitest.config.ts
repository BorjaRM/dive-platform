import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts'],
    exclude: ['node_modules', 'dist', 'coverage', 'src/**/*.e2e-spec.ts'],
  },
});
