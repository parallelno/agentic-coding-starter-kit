// Dependency-free dev server: static files from repo root on :8123
// + POST /save writing base64 PNGs to results/screenshots/{file}.
import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const PORT = 8123;
const ROOT = path.resolve(process.cwd(), '.');
const SHOT_DIR = path.join(ROOT, 'results', 'screenshots');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
};

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/save') {
    handleSave(req, res);
  } else if (req.method === 'GET' || req.method === 'HEAD') {
    serveStatic(req, res);
  } else {
    res.writeHead(405, { 'Content-Type': 'text/plain', 'Allow': 'GET, HEAD, POST' });
    res.end('Method not allowed');
  }
});

function serveStatic(req, res) {
  // NOTE: do NOT route req.url through `new URL()` — the WHATWG parser collapses
  // `/../` and `/%2e%2e/` dot segments, which would hide traversal attempts.
  const raw = req.url || '/';
  const queryAt = raw.indexOf('?');
  const rawPath = queryAt === -1 ? raw : raw.slice(0, queryAt);

  let pathname;
  try {
    pathname = decodeURIComponent(rawPath);
  } catch {
    reply(res, 400, 'text/plain', 'Bad request');
    return;
  }
  if (pathname.includes('..') || pathname.includes('\\') || pathname.includes('\0')) {
    reply(res, 403, 'text/plain', 'Forbidden');
    return;
  }
  if (pathname === '' || pathname === '/') pathname = '/index.html';

  const filePath = path.resolve(ROOT, '.' + (pathname.startsWith('/') ? pathname : `/${pathname}`));
  // Reject anything escaping the repo root.
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
    reply(res, 403, 'text/plain', 'Forbidden');
    return;
  }

  // `fs` is the promises API — readFile has no callback form.
  fs.readFile(filePath)
    .then((data) => {
      const type = MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type });
      res.end(req.method === 'HEAD' ? undefined : data);
    })
    .catch(() => {
      reply(res, 404, 'text/plain', 'Not found');
    });
}

function handleSave(req, res) {
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
    if (body.length > 50 * 1024 * 1024) { // sanity cap: ~50MB
      req.destroy();
    }
  });
  req.on('end', async () => {
    try {
      const { file, dataUrl } = JSON.parse(body);
      if (typeof file !== 'string' || typeof dataUrl !== 'string') {
        reply(res, 400, 'text/plain', 'Expected JSON {file, dataUrl}');
        return;
      }
      // Reject traversal outright (do not silently sanitize the name).
      const name = file;
      if (name.includes('..') || name.includes('/') || name.includes('\\') || name.includes('\0') || name === '' || name === '.' || name === '..') {
        reply(res, 400, 'text/plain', 'Invalid file name');
        return;
      }
      const prefix = 'data:image/png;base64,';
      if (!dataUrl.startsWith(prefix) && dataUrl.startsWith('data:image/')) {
        reply(res, 400, 'text/plain', 'Only PNG data URLs accepted');
        return;
      }
      const b64 = dataUrl.startsWith(prefix) ? dataUrl.slice(prefix.length) : dataUrl;
      const bytes = Buffer.from(b64, 'base64');

      await fs.mkdir(SHOT_DIR, { recursive: true });
      const dest = path.join(SHOT_DIR, name);
      await fs.writeFile(dest, bytes);

      reply(res, 200, 'application/json', JSON.stringify({ ok: true, path: path.relative(ROOT, dest), bytes: bytes.length }));
    } catch (err) {
      reply(res, 400, 'text/plain', 'Bad request: ' + err.message);
    }
  });
}

function reply(res, code, type, body) {
  res.writeHead(code, { 'Content-Type': type });
  res.end(body);
}

// Bind IPv4 explicitly: on this machine a bare listen() yields an IPv6 (::)
// socket that accepts connections but never fires the request handler.
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Cloth simulator dev server: http://localhost:${PORT}/`);
});
