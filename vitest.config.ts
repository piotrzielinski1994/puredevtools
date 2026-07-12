import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    environmentMatchGlobs: [
      ['src/ui/**', 'jsdom'],
      ['src/engine/page/**', 'jsdom'],
    ],
    setupFiles: ['./src/ui/test-setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/rules/**', 'src/engine/**', 'src/background/**', 'src/ui/shared/**', 'src/devtools/**', 'src/ui/devtools/**', 'src/content/channel.ts'],
      exclude: [
        '**/*.test.{ts,tsx}',
        'src/background/index.ts',
        'src/rules/model.ts',
        'src/engine/RequestEngine.ts',
        'src/engine/chrome/dnrTypes.ts',
        'src/engine/firefox/types.ts',
        'src/ui/shared/gateway.ts',
        'src/ui/shared/createGateway.ts',
        'src/ui/shared/test-gateway.ts',
        'src/ui/components/**',
        'src/engine/page/types.ts',
        'src/content/page-main.ts',
        'src/content/bridge.ts',
        'src/devtools/types.ts',
        'src/devtools/devtools.ts',
        'src/ui/devtools/main.tsx',
        'src/ui/shared/useTheme.ts',
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
