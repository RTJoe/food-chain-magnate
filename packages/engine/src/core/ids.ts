/** Deterministic id allocation from `state.nextId` (architecture §3.2): ids are `${kind}-${n}`. */

export type IdKind =
  | 'card'
  | 'house'
  | 'restaurant'
  | 'campaign'
  | 'source'
  | 'entity'
  | 'tile'
  | 'choice'
  | (string & {});

/** Allocate the next id and advance the counter. Mutates `state`. */
export function allocId(state: { nextId: number }, kind: IdKind): string {
  const id = `${kind}-${state.nextId}`;
  state.nextId += 1;
  return id;
}

/** The kind prefix of an id (`card-12` → `card`). */
export function idKind(id: string): string {
  const i = id.lastIndexOf('-');
  return i < 0 ? id : id.slice(0, i);
}
