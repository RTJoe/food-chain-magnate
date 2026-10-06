import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const src = (p: string) => fileURLToPath(new URL(`./packages/${p}`, import.meta.url));

/** Workspace packages resolve to their TypeScript sources in tests (no build needed). */
export const workspaceAliases = [
  { find: /^@fcm\/engine\/testing$/, replacement: src('engine/src/testing/index.ts') },
  { find: /^@fcm\/engine$/, replacement: src('engine/src/index.ts') },
  { find: /^@fcm\/ai$/, replacement: src('ai/src/index.ts') },
  { find: /^@fcm\/protocol$/, replacement: src('protocol/src/index.ts') },
  { find: /^@fcm\/session$/, replacement: src('session/src/index.ts') },
];

export default defineConfig({
  resolve: { alias: workspaceAliases },
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    environment: 'node',
    // Bot and full-game specs are CPU-bound; leave headroom when the suite runs under load.
    testTimeout: 15_000,
  },
});
