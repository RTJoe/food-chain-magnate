/** Minimal argv parser for the bench CLIs: `--key value`, `--key=value`, `--flag`, positionals. */
export interface Args {
  flags: Record<string, string | true>;
  positional: string[];
}

export function parseArgs(argv: string[], booleans: string[] = []): Args {
  const flags: Record<string, string | true> = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--') continue;
    if (!a.startsWith('--')) {
      positional.push(a);
      continue;
    }
    const eq = a.indexOf('=');
    const key = (eq > 0 ? a.slice(2, eq) : a.slice(2)).trim();
    if (eq > 0) flags[key] = a.slice(eq + 1);
    else if (booleans.includes(key) || i + 1 >= argv.length || argv[i + 1]!.startsWith('--')) flags[key] = true;
    else flags[key] = argv[++i]!;
  }
  return { flags, positional };
}

export function str(a: Args, key: string): string | undefined {
  const v = a.flags[key];
  return typeof v === 'string' ? v : undefined;
}

export function num(a: Args, key: string, fallback: number): number {
  const v = a.flags[key];
  if (v === undefined || v === true) return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`--${key} expects a number, got '${v}'`);
  return n;
}

export const bool = (a: Args, key: string): boolean => a.flags[key] === true || a.flags[key] === 'true';
