/**
 * Static file handler for the built client (`packages/client/dist`). Extension-less unknown paths
 * fall back to index.html (SPA / hash router); unknown files with an extension get 404.
 * Compressible responses are gzipped when the client accepts it.
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream';
import { createGzip } from 'node:zlib';

export const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
};

const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.map', '.webmanifest', '.txt', '.svg', '.gltf', '.wasm', '.ttf', '.otf']);
const GZIP_MIN_BYTES = 1024;

export interface StaticOptions {
  gzip?: boolean;
}

export function staticHandler(root: string, opts: StaticOptions = {}) {
  const base = resolve(root);
  const gzip = opts.gzip ?? true;
  return (req: IncomingMessage, res: ServerResponse): void => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD' }).end();
      return;
    }
    let pathname = '/';
    try {
      pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    } catch {
      res.writeHead(400).end();
      return;
    }
    let file = normalize(join(base, pathname));
    if (file !== base && !file.startsWith(base + sep)) {
      res.writeHead(403).end();
      return;
    }
    const isFile = existsSync(file) && statSync(file).isFile();
    if (!isFile) {
      if (extname(pathname) !== '' && !pathname.endsWith('.html')) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found\n');
        return;
      }
      file = join(base, 'index.html');
      if (!existsSync(file)) {
        res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' }).end('Client not built. Run `npm run build`.\n');
        return;
      }
    }
    const ext = extname(file).toLowerCase();
    const size = statSync(file).size;
    const immutable = pathname.startsWith('/assets/');
    const headers: Record<string, string | number> = {
      'content-type': MIME_TYPES[ext] ?? 'application/octet-stream',
      'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
      'x-content-type-options': 'nosniff',
    };
    const accepts = /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''));
    const compress = gzip && accepts && COMPRESSIBLE.has(ext) && size >= GZIP_MIN_BYTES;
    if (COMPRESSIBLE.has(ext)) headers.vary = 'accept-encoding';
    if (compress) headers['content-encoding'] = 'gzip';
    else headers['content-length'] = size;
    res.writeHead(200, headers);
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    const done = (err: NodeJS.ErrnoException | null) => {
      if (err) res.destroy();
    };
    if (compress) pipeline(createReadStream(file), createGzip(), res, done);
    else pipeline(createReadStream(file), res, done);
  };
}
