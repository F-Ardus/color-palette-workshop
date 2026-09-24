import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pagePath, pages, ROOT } from '../scripts/partials.mjs';

const sw = fs.readFileSync(path.join(ROOT, 'public', 'sw.js'), 'utf8');
const precache = [...sw.slice(sw.indexOf('const PRECACHE'), sw.indexOf('];')).matchAll(/'([^']+)'/g)].map(m => m[1]);

// Every published file, as the URL it's served at (pages by their folder).
function published() {
  const out = [];
  const walk = dir => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else out.push('/' + path.relative(path.join(ROOT, 'public'), full).replace(/\\/g, '/'));
    }
  };
  walk(path.join(ROOT, 'public'));
  return out.map(f => (f.endsWith('/index.html') ? f.replace(/index\.html$/, '') : f));
}

test('the service worker precaches every published file (so every tool works offline)', () => {
  const missing = published().filter(f => f !== '/sw.js' && !precache.includes(f));
  assert.deepEqual(missing, []);
});

test('and nothing that no longer exists', () => {
  const files = new Set(published());
  assert.deepEqual(precache.filter(f => !files.has(f)), []);
});

test('every page is in the manifest shortcuts', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'manifest.webmanifest'), 'utf8'));
  const urls = manifest.shortcuts.map(s => s.url).sort();
  assert.deepEqual(urls, pages().map(pagePath).sort());
  for (const icon of manifest.icons) assert.ok(fs.existsSync(path.join(ROOT, 'public', icon.src)), icon.src);
});
