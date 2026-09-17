import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = async (p) => readFile(path.join(root, p), 'utf8');

test('package.json: type module + node test script', async () => {
  const pkg = JSON.parse(await read('package.json'));
  assert.equal(pkg.type, 'module');
  assert.equal(pkg.name, 'snake-cinematic');
  assert.equal(pkg.private, true);
  assert.equal(pkg.scripts.test, 'node --test "tests/*.test.mjs"');
  // test script must run node --test over the tests/ directory
  assert.match(pkg.scripts.test, /node --test/);
  assert.match(pkg.scripts.test, /tests\/\*\.test\.mjs|tests\//);
});

test('index.html: canvas, #hud, exactly one module script tag, no inline JS', async () => {
  const html = await read('index.html');
  assert.match(html, /<canvas[^>]*id="game"/, 'canvas #game present');
  assert.match(html, /<div[^>]*id="hud"[^>]*>/, 'hud container present');
  const scriptTags = html.match(/<script\b[^>]*>/g) || [];
  const moduleTags = scriptTags.filter((t) => /type="module"/.test(t));
  const importMapTags = scriptTags.filter((t) => /type="importmap"/.test(t));
  // Exactly one classic module script that loads js/main.js.
  assert.equal(moduleTags.length, 1, 'exactly one module <script> tag');
  assert.match(moduleTags[0], /src="js\/main\.js"/, 'module script loads js/main.js');
  // At most one import map. It lets the browser resolve bare `three` /
  // `three/addons/*` specifiers under a static server with no build step
  // (R-SCOPE-02). If present it must map to a LOCAL path (no CDN) and be JSON.
  assert.ok(importMapTags.length <= 1, 'at most one import map');
  if (importMapTags.length === 1) {
    const mapBlock = html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1];
    assert.ok(!/https?:\/\//.test(mapBlock), 'import map must not reference a CDN');
    assert.match(mapBlock, /"three"\s*:/, 'import map resolves bare `three`');
  }
  // no inline JS logic in any script body (a module script carries src, an
  // import map is JSON — neither contains real JS statements).
  const inline = html.match(/<script[^>]*>\s*[\s\S]*?<\/script>/g) || [];
  const hasInlineLogic = inline.some(
    (m) => m.includes('function') || m.includes('=>') || /\bvar\s/.test(m) || /\bconst\s/.test(m)
  );
  assert.equal(hasInlineLogic, false, 'no inline JS bodies');
});
