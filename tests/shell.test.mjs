import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
// index.html does not exist until task-01 finishes; read inside the test so the
// suite reports a clean assertion failure instead of a module-load crash.
const html = () => readFileSync(join(root, 'index.html'), 'utf8');

test('package.json: ESM + portable quoted-glob test script', () => {
  assert.equal(pkg.type, 'module', 'package.json must set "type": "module"');
  const s = pkg.scripts?.test || '';
  assert.match(s, /node --test/, 'scripts.test must run node --test');
  assert.match(s, /tests[\/"'\w.*]/, 'scripts.test must target the tests/ dir');
});

test('index.html: canvas, hud, single module script, no inline JS', () => {
  const htmlText = html();
  assert.match(htmlText, /<canvas[^>]*id="game"/, 'missing <canvas id="game">');
  assert.match(htmlText, /id="hud"/, 'missing #hud container');
  assert.match(
    htmlText,
    /type="module"[^>]*src="js\/main\.js"|src="js\/main\.js"[^>]*type="module"/,
    'missing <script type="module" src="js/main.js">',
  );
  const scriptTags = htmlText.match(/<script[\s>]/g) || [];
  assert.equal(scriptTags.length, 1, `exactly one <script> tag allowed, found ${scriptTags.length}`);
  assert.ok(!htmlText.includes('function ') && !htmlText.includes('=>'),
    'index.html must not contain inline JS');
});
