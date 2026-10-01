import { networkInterfaces } from 'node:os';

/** Non-internal IPv4 addresses, for printing LAN join URLs. */
export function lanAddresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  }
  return out;
}

/** Startup banner lines: `http://localhost:PORT` and `http://<lan-ip>:PORT` for each interface. */
export function joinUrls(port: number, host = '0.0.0.0'): string[] {
  const lines = [`  local:   http://localhost:${port}`];
  if (host === '0.0.0.0' || host === '::') for (const ip of lanAddresses()) lines.push(`  network: http://${ip}:${port}`);
  else if (host !== 'localhost' && host !== '127.0.0.1') lines.push(`  network: http://${host}:${port}`);
  return lines;
}
