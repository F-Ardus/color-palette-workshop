import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadPartials, pagePath, pages, ROOT, syncPage } from '../scripts/partials.mjs';

test('every page carries the current shared markup (run "npm run sync" if this fails)', () => {
  const partials = loadPartials();
  for (const rel of pages()) {
    const html = fs.readFileSync(path.join(ROOT, 'public', rel), 'utf8');
    assert.ok(html === syncPage(html, pagePath(rel), partials), `public/${rel} is out of date`);
  }
});

test('each page marks its own tool as current, and only that one', () => {
  for (const rel of pages()) {
    const html = fs.readFileSync(path.join(ROOT, 'public', rel), 'utf8');
    const current = [...html.matchAll(/<a href="([^"]+)" aria-current="page">/g)].map(m => m[1]);
    assert.deepEqual(current, [pagePath(rel)], rel);
  }
});

test('every page is linked from the sidebar', () => {
  const sidebar = loadPartials().sidebar;
  for (const rel of pages()) assert.ok(sidebar.includes(`<a href="${pagePath(rel)}">`), pagePath(rel));
});

test('syncPage replaces only what is between the markers', () => {
  const partials = { head: 'HEAD', sidebar: '<a href="/x/">X</a>', topbar: 'TOP' };
  const html = 'a<!-- shared:head -->old<!-- /shared:head -->b<!-- shared:sidebar --><!-- /shared:sidebar -->c<!-- shared:topbar -->\n<!-- /shared:topbar -->d';
  assert.equal(syncPage(html, '/x/', partials),
    'a<!-- shared:head -->\nHEAD\n<!-- /shared:head -->b<!-- shared:sidebar -->\n<a href="/x/" aria-current="page">X</a>\n<!-- /shared:sidebar -->c<!-- shared:topbar -->\nTOP\n<!-- /shared:topbar -->d');
  assert.throws(() => syncPage('no markers', '/', partials));
});
