import { describe, expect, it } from 'vitest';
import { contentFor, listModules } from '@fcm/engine';
import { portraitIds } from '../src/ui/portraits/index.js';

describe('employee portraits', () => {
  it('every employee in every module has its own portrait', () => {
    const ids = new Set<string>();
    for (const m of listModules()) for (const id of Object.keys(contentFor([m.id]).employees)) ids.add(id);
    const drawn = new Set<string>(portraitIds());
    expect([...ids].filter((id) => !drawn.has(id))).toEqual([]);
    expect(ids.size).toBeGreaterThanOrEqual(50);
  });
});
