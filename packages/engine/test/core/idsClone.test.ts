import { describe, expect, it } from 'vitest';
import { allocId, idKind } from '../../src/core/ids.js';
import { clone } from '../../src/core/clone.js';

describe('ids and clone', () => {
  it('allocates sequential kind-prefixed ids', () => {
    const s = { nextId: 5 };
    expect(allocId(s, 'card')).toBe('card-5');
    expect(allocId(s, 'house')).toBe('house-6');
    expect(s.nextId).toBe(7);
    expect(idKind('campaign-12')).toBe('campaign');
  });

  it('deep clones without sharing references', () => {
    const a = { x: [1, { y: 2 }] };
    const b = clone(a);
    expect(b).toEqual(a);
    expect(b.x).not.toBe(a.x);
  });
});
