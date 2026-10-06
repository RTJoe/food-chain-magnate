/**
 * The rules docs, bundled at build time as strings (Vite `?raw`) and arranged into the rules book.
 * Only the lazy rules chunk imports this module, so the markdown never weighs on the first screen.
 */
import base from '../../../../../docs/rules/base.md?raw';
import employees from '../../../../../docs/rules/employees.md?raw';
import ketchup from '../../../../../docs/rules/ketchup.md?raw';
import map from '../../../../../docs/rules/map.md?raw';
import milestones from '../../../../../docs/rules/milestones.md?raw';
import { buildBook, type Book } from './book.js';

let cached: Book | null = null;

export function rulesBook(): Book {
  cached ??= buildBook({ base, employees, milestones, map, ketchup });
  return cached;
}
