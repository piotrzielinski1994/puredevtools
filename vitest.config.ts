import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    environmentMatchGlobs: [['src/ui/**', 'jsdom']],
    setupFiles: [],
    coverage: {
      provider: 'v8',
      include: ['src/rules/**', 'src/engine/**', 'src/background/**'],
      exclude: [
        '**/*.test.{ts,tsx}',
        'src/background/index.ts',
        'src/rules/model.ts',
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
      },
    },
  },
});
