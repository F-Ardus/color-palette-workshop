import test from 'node:test';
import assert from 'node:assert/strict';
import { bandIndex } from '../public/js/sphere.js';

test('each color gets an equal slice of the brightness range', () => {
  assert.equal(bandIndex(1, 5), 0);
  assert.equal(bandIndex(0.81, 5), 0);
  assert.equal(bandIndex(0.79, 5), 1);
  assert.equal(bandIndex(0.5, 5), 2);
  assert.equal(bandIndex(0, 5), 4);
});

test('out-of-range brightness is clamped', () => {
  assert.equal(bandIndex(1.4, 5), 0, 'specular highlight');
  assert.equal(bandIndex(-0.2, 5), 4);
});

test('every color of the palette shows up', () => {
  for (const n of [3, 5, 9]) {
    const seen = new Set();
    for (let k = 0; k <= 255; k++) seen.add(bandIndex(k / 255, n));
    assert.equal(seen.size, n, `n=${n}`);
  }
});
