#!/usr/bin/env node
/**
 * Enforces package import boundaries (docs/architecture.md §2) until eslint is added:
 * - engine: no imports from other packages, no bare specifiers, no node: builtins.
 * - ai: engine only; pure TS (no DOM, no node: builtins). Exception: `ai/src/bench/` (tuning
 *   harness, Node only, excluded from the ai build) may also use node: builtins and
 *   @fcm/engine/testing; nothing else in ai may import from bench/, so it never reaches a bundle.
 * - protocol: engine types only (+ zod).
 * - session: engine + protocol + ai; no ws/fs/node builtins.
 * - client: engine + protocol + ai (+ its own deps); never server/session.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const rules = {
  engine: { allow: [], typeOnly: [] },
  ai: { allow: ['@fcm/engine'], typeOnly: [], nodeOnly: { dir: 'bench', allow: ['@fcm/engine', '@fcm/engine/testing', 'node:*'] } },
  protocol: { allow: ['zod'], typeOnly: ['@fcm/engine'] },
  session: { allow: ['@fcm/engine', '@fcm/protocol', '@fcm/ai'], typeOnly: [] },
  server: { allow: ['@fcm/engine', '@fcm/protocol', '@fcm/session', '@fcm/ai', 'ws', 'node:*'], typeOnly: [] },
  client: { allow: ['@fcm/engine', '@fcm/engine/*', '@fcm/protocol', '@fcm/ai', 'uqr', 'preact', 'preact/*', '@preact/*', 'three', 'three/*'], typeOnly: [] },
};

const files = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
  });
const matches = (spec, pattern) => (pattern.endsWith('/*') || pattern.endsWith(':*') ? spec.startsWith(pattern.slice(0, -1)) : spec === pattern);
const importRe = /^\s*(import|export)\s+(type\s+)?[^'"]*?from\s+['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]/gm;

let problems = 0;
for (const [pkg, rule] of Object.entries(rules)) {
  const srcDir = join(root, 'packages', pkg, 'src');
  const nodeOnlyDir = rule.nodeOnly ? join(srcDir, rule.nodeOnly.dir) + sep : null;
  for (const file of files(srcDir)) {
    const src = readFileSync(file, 'utf8');
    const inNodeOnly = nodeOnlyDir !== null && file.startsWith(nodeOnlyDir);
    const allow = inNodeOnly ? rule.nodeOnly.allow : rule.allow;
    for (const m of src.matchAll(importRe)) {
      const spec = m[3] ?? m[4];
      if (!spec) continue;
      if (spec.startsWith('.')) {
        if (nodeOnlyDir && !inNodeOnly && (join(dirname(file), spec) + sep).startsWith(nodeOnlyDir)) {
          problems++;
          console.error(`${relative(root, file)}: '${spec}' imports the Node-only ${pkg}/src/${rule.nodeOnly.dir}/`);
        }
        continue;
      }
      const typeOnly = Boolean(m[2]);
      const ok = allow.some((p) => matches(spec, p)) || (typeOnly && rule.typeOnly.some((p) => matches(spec, p)));
      if (!ok) {
        problems++;
        console.error(`${relative(root, file)}: '${spec}' not allowed in ${pkg}${rule.typeOnly.includes(spec) ? ' (type-only imports only)' : ''}`);
      }
    }
  }
}
if (problems) process.exit(1);
console.log('Package boundaries OK');
