/** Writes src/testing/fixtures/<name>.json from the fixture builders. Run: npm run fixtures -w @fcm/engine */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FIXTURES } from '../src/testing/fixtures/index.js';

const dir = fileURLToPath(new URL('../src/testing/fixtures/', import.meta.url));
for (const [name, make] of Object.entries(FIXTURES)) {
  const json = `${JSON.stringify(make(), null, 2)}\n`;
  writeFileSync(`${dir}${name}.json`, json);
  console.log(`wrote fixtures/${name}.json (${(json.length / 1024).toFixed(1)} KB)`);
}
