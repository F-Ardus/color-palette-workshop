import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROLES } from '../public/js/palette.js';
import { pages } from '../scripts/partials.mjs';

const PUBLIC = new URL('../public/', import.meta.url);
const read = rel => fs.readFileSync(new URL(rel, PUBLIC), 'utf8');
const LANG_FILES = fs.readdirSync(new URL('i18n/', PUBLIC)).filter(f => f.endsWith('.json'));
const dicts = Object.fromEntries(LANG_FILES.map(f => [path.basename(f, '.json'), JSON.parse(read('i18n/' + f))]));
const PAGES = pages();
const SCRIPTS = fs.readdirSync(new URL('js/', PUBLIC)).filter(f => f.endsWith('.js'));

const placeholders = s => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();

// Every key the pages and scripts use. Dynamic ones are listed by hand.
function usedKeys() {
  const keys = new Set();
  const sources = [...PAGES.map(read), ...fs.readdirSync(new URL('../partials/', import.meta.url)).map(f => fs.readFileSync(new URL('../partials/' + f, import.meta.url), 'utf8'))];
  for (const html of sources) {
    for (const m of html.matchAll(/data-i18n="([^"]+)"/g)) keys.add(m[1]);
    for (const m of html.matchAll(/data-i18n-attr="([^"]+)"/g))
      for (const pair of m[1].split(',')) keys.add(pair.split(':')[1].trim());
  }
  for (const file of SCRIPTS) {
    const js = read('js/' + file);
    // A key ending in "." is a prefix completed at runtime (roles, listed below).
    for (const m of js.matchAll(/\bt\('([\w.]*\w)'/g)) keys.add(m[1]);
    // t(cond ? 'a' : 'b')
    for (const m of js.matchAll(/\bt\([^,;]*?\?\s*'(\w+\.[\w.]+)'\s*:\s*'(\w+\.[\w.]+)'/g)) { keys.add(m[1]); keys.add(m[2]); }
    for (const m of js.matchAll(/\btn\('([\w.]+)'/g)) { keys.add(m[1] + '_one'); keys.add(m[1] + '_other'); }
    // tn(cond ? 'a' : 'b', n)
    for (const m of js.matchAll(/\btn\([^,]*\?\s*'([\w.]+)'\s*:\s*'([\w.]+)'/g))
      for (const k of [m[1], m[2]]) { keys.add(k + '_one'); keys.add(k + '_other'); }
  }
  ROLES.forEach(r => keys.add('role.' + r));
  return keys;
}

test('there is a Spanish and an English dictionary', () => {
  assert.ok(dicts.es && dicts.en, Object.keys(dicts).join(','));
});

test('every language has exactly the same keys', () => {
  const base = Object.keys(dicts.es).sort();
  for (const [lang, d] of Object.entries(dicts))
    assert.deepEqual(Object.keys(d).sort(), base, `${lang} vs es`);
});

test('translations keep the same {placeholders}', () => {
  for (const [lang, d] of Object.entries(dicts))
    for (const key of Object.keys(dicts.es))
      assert.deepEqual(placeholders(d[key]), placeholders(dicts.es[key]), `${lang}: ${key}`);
});

test('no empty translations', () => {
  for (const [lang, d] of Object.entries(dicts))
    for (const [key, value] of Object.entries(d)) assert.ok(value.trim(), `${lang}: ${key}`);
});

test('every key used in the pages and scripts exists', () => {
  const missing = [...usedKeys()].filter(k => !(k in dicts.es));
  assert.deepEqual(missing, []);
});

test('no unused keys pile up in the dictionaries', () => {
  const used = usedKeys();
  const unused = Object.keys(dicts.es).filter(k => !used.has(k));
  assert.deepEqual(unused, []);
});

test('the Spanish markup matches es.json, so the page reads right before (or without) translation', () => {
  for (const page of PAGES) {
    const html = read(page);
    for (const m of html.matchAll(/data-i18n="([^"]+)"[^>]*>([^<]*)</g)) {
      const text = m[2].replace(/&amp;/g, '&').trim();
      if (text) assert.equal(text, dicts.es[m[1]], `${page}: ${m[1]}`);
    }
  }
});
