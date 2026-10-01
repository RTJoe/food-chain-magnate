/**
 * Deep clone for plain-JSON state. Uses the platform `structuredClone` (browsers, Node ≥17);
 * the engine has no DOM/Node type deps, so it is declared here.
 */
declare const structuredClone: (<T>(value: T) => T) | undefined;

export function clone<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}
