import { networkInterfaces } from 'node:os';

/** Non-internal IPv4 addresses, for printing LAN join URLs. */
export function lanAddresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  }
  return out;
}
