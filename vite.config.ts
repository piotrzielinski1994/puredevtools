import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { crx } from '@crxjs/vite-plugin';
import { buildManifest } from './src/manifest';
import { isTarget } from './src/shared/types';

const rawTarget = process.env.TARGET ?? 'chrome';
if (!isTarget(rawTarget)) {
  throw new Error(`Unknown TARGET "${rawTarget}". Use "chrome" or "firefox".`);
}
const target = rawTarget;

export default defineConfig({
  plugins: [react(), tailwindcss(), crx({ manifest: buildManifest(target), browser: target === 'firefox' ? 'firefox' : 'chrome' })],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    outDir: `dist/${target}`,
    emptyOutDir: true,
  },
});
