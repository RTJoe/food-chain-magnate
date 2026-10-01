import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

const pkg = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));

export default defineConfig({
  plugins: [preact()],
  resolve: {
    // Workspace packages resolve to TypeScript sources: no engine/protocol build needed for dev.
    alias: [
      { find: /^@fcm\/engine\/testing$/, replacement: pkg('engine/src/testing/index.ts') },
      { find: /^@fcm\/engine$/, replacement: pkg('engine/src/index.ts') },
      { find: /^@fcm\/protocol$/, replacement: pkg('protocol/src/index.ts') },
    ],
  },
  server: {
    port: 5173,
    host: true,
    proxy: { '/ws': { target: 'ws://localhost:3000', ws: true } },
  },
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: true },
});
