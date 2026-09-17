// Minimal static file server for the R-TEST-03 browser checklist (port 8000).
// Stand-in for `python -m http.server 8000` where Python is unavailable.
// Serves the repo root so that both ./js/* and ./node_modules/three/* resolve.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, normalize, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.argv[2] || 8000);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${port}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/') pathname = '/index.html';
    const file = normalize(join(root, pathname));
    // Resolve-only guard: reject traversal outside the root.
    const full = path.resolve(file);
    if (!full.startsWith(path.resolve(root))) {
      res.writeHead(403); res.end('forbidden'); return;
    }
    const data = await readFile(full);
    res.writeHead(200, { 'Content-Type': MIME[extname(full)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('not found');
  }
});

server.listen(port, () => {
  console.log(`[serve] http://localhost:${port} -> ${root}`);
});
