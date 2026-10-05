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
      { find: /^@fcm\/ai$/, replacement: pkg('ai/src/index.ts') },
      { find: /^@fcm\/protocol$/, replacement: pkg('protocol/src/index.ts') },
    ],
  },
  // Hot-seat bots run in a module Web Worker that imports the engine (code-split chunks).
  worker: { format: 'es' },
  server: {
    port: 5173,
    host: true,
    proxy: { '/ws': { target: 'ws://localhost:3000', ws: true } },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    // The three.js library is one lazy chunk of ~600 kB minified (~150 kB gzip), loaded only once a
    // game view exists (main.tsx). Everything on the first screen stays well under this limit.
    chunkSizeWarningLimit: 700,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            // Lazy: only reachable from the dynamic import of three/index.ts (the scene code itself is split
            // automatically; a group for it would also pull in the shared state/ modules and make it eager).
            { name: 'three-vendor', test: /[\\/]node_modules[\\/]three[\\/]/, priority: 40 },
            // Eager, but cached separately from the app code.
            { name: 'engine', test: /[\\/]packages[\\/]engine[\\/]src[\\/]/, priority: 20 },
            { name: 'vendor', test: /[\\/]node_modules[\\/]/, priority: 10 },
          ],
        },
      },
    },
  },
});
