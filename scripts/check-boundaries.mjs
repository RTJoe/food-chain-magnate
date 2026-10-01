#!/usr/bin/env node
/**
 * Enforces package import boundaries (docs/architecture.md §2) until eslint is added:
 * - engine: no imports from other packages, no bare specifiers, no node: builtins.
 * - protocol: engine types only (+ zod).
 * - session: engine + protocol; no ws/fs/node builtins.
 * - client: engine + protocol (+ its own deps); never server/session.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const rules = {
  engine: { allow: [], typeOnly: [] },
  protocol: { allow: ['zod'], typeOnly: ['@fcm/engine'] },
  session: { allow: ['@fcm/engine', '@fcm/protocol'], typeOnly: [] },
  server: { allow: ['@fcm/engine', '@fcm/protocol', '@fcm/session', 'ws', 'node:*'], typeOnly: [] },
  client: { allow: ['@fcm/engine', '@fcm/protocol', 'preact', 'preact/*', '@preact/*', 'three', 'three/*'], typeOnly: [] },
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
  for (const file of files(join(root, 'packages', pkg, 'src'))) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(importRe)) {
      const spec = m[3] ?? m[4];
      if (!spec || spec.startsWith('.')) continue;
      const typeOnly = Boolean(m[2]);
      const ok = rule.allow.some((p) => matches(spec, p)) || (typeOnly && rule.typeOnly.some((p) => matches(spec, p)));
      if (!ok) {
        problems++;
        console.error(`${relative(root, file)}: '${spec}' not allowed in ${pkg}${rule.typeOnly.includes(spec) ? ' (type-only imports only)' : ''}`);
      }
    }
  }
}
if (problems) process.exit(1);
console.log('Package boundaries OK');
