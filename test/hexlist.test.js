import test from 'node:test';
import assert from 'node:assert/strict';
import { colorsFromParam, hexListParam, LIST_MAX, parseHexList } from '../public/js/hexlist.js';

test('reads the output of "Copiar hex" from the other tools', () => {
  assert.deepEqual(parseHexList('#F2E3B3\n#D98E73\n#4F7A6B'), ['#F2E3B3', '#D98E73', '#4F7A6B']);
});

test('finds hex colors in any text, normalizing them', () => {
  const text = 'fondo: #fff; piel #d98e73, sombra 1E1B3A y rgba #4F7A6BCC — ojo: "cafe" y "bad" no son colores';
  assert.deepEqual(parseHexList(text), ['#FFFFFF', '#D98E73', '#1E1B3A', '#4F7A6B']);
});

test('reads a palette link', () => {
  assert.deepEqual(parseHexList('https://palettekit.fardus.dev/crear/?colors=F2E3B3,D98E73'), ['#F2E3B3', '#D98E73']);
});

test('caps the list and handles nothing', () => {
  assert.equal(parseHexList(Array(40).fill('#123456').join(' ')).length, LIST_MAX);
  assert.deepEqual(parseHexList(''), []);
  assert.deepEqual(parseHexList(null), []);
  assert.deepEqual(parseHexList('sin colores acá'), []);
});

test('URL parameter round-trips; anything malformed is rejected whole', () => {
  const cols = ['#F2E3B3', '#D98E73', '#1E1B3A'];
  const raw = new URLSearchParams(hexListParam(cols)).get('colors');
  assert.deepEqual(colorsFromParam(raw), cols);
  assert.deepEqual(colorsFromParam('f2e3b3'), ['#F2E3B3'], 'one color is fine here');
  for (const bad of ['', null, 'F2E3B3,nope', 'F2E3B3,<b>', 'FFF'])
    assert.deepEqual(colorsFromParam(bad), [], String(bad));
  assert.equal(colorsFromParam(Array(30).fill('000000').join(',')).length, LIST_MAX);
});
