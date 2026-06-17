import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    environmentMatchGlobs: [['src/ui/**', 'jsdom']],
    setupFiles: ['./src/ui/test-setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/rules/**', 'src/engine/**', 'src/background/**', 'src/ui/shared/**'],
      exclude: [
        '**/*.test.{ts,tsx}',
        'src/background/index.ts',
        'src/rules/model.ts',
        'src/engine/RequestEngine.ts',
        'src/engine/chrome/dnrTypes.ts',
        'src/engine/firefox/types.ts',
        'src/ui/shared/gateway.ts',
        'src/ui/shared/createGateway.ts',
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
