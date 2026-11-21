import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const swSource = readFileSync(join(ROOT, 'sw.js'), 'utf8');

const assets = [...swSource.match(/const ASSETS = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
const swVersion = swSource.match(/const VERSION = '([^']+)';/)[1];

function filesIn(dir) {
  return readdirSync(join(ROOT, dir)).flatMap((name) => {
    const path = join(ROOT, dir, name);
    return statSync(path).isDirectory() ? filesIn(relative(ROOT, path)) : [relative(ROOT, path)];
  });
}

test('every file cached by the service worker exists', () => {
  for (const asset of assets) {
    if (asset === './') continue;
    assert.ok(existsSync(join(ROOT, asset)), `sw.js caches a missing file: ${asset}`);
  }
});

test('every app file is cached by the service worker (otherwise it breaks offline)', () => {
  const appFiles = ['index.html', 'manifest.webmanifest', ...filesIn('css'), ...filesIn('js'), ...filesIn('icons')]
    .filter((file) => !file.endsWith('.DS_Store'));
  for (const file of appFiles) {
    assert.ok(assets.includes(`./${file}`), `add './${file}' to ASSETS in sw.js`);
  }
});

test('service worker version matches package.json', () => {
  const { version } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.equal(swVersion, version, 'bump VERSION in sw.js together with package.json');
});
