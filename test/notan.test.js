import test from 'node:test';
import assert from 'node:assert/strict';
import { balancedThresholds, bandOf, bandShares, bandTones, blurValues, evenThresholds, greys, histogram, notan, setThreshold, valueMap } from '../public/js/notan.js';
import { greyHex, hexToRgb } from '../public/js/color.js';

const pixels = hexes => Uint8ClampedArray.from(hexes.flatMap(h => [...hexToRgb(h), 255]));
const close = (a, b, eps = 0.05) => Math.abs(a - b) < eps;

test('valueMap gives the value of each pixel; transparent counts as white', () => {
  const vs = valueMap(pixels(['#000000', '#FFFFFF', greyHex(3), greyHex(7.5)]));
  assert.ok(close(vs[0], 0) && close(vs[1], 10) && close(vs[2], 3) && close(vs[3], 7.5), [...vs].join(' '));
  assert.ok(close(valueMap(Uint8ClampedArray.from([0, 0, 0, 0]))[0], 10));
});

test('bands: 0 is the lightest; thresholds are the lower edges', () => {
  const t = [3, 6];
  assert.deepEqual([9, 6, 5.9, 3, 2.9, 0].map(v => bandOf(v, t)), [0, 0, 1, 1, 2, 2]);
});

test('even thresholds split 0..10 into equal ranges', () => {
  assert.deepEqual(evenThresholds(2), [5]);
  assert.deepEqual(evenThresholds(4), [2.5, 5, 7.5]);
  assert.deepEqual(evenThresholds(5), [2, 4, 6, 8]);
});

test('balanced thresholds split the image into equal areas', () => {
  const vs = Float32Array.from({ length: 1000 }, (_, i) => 1 + (i % 100) * 0.05); // values 1..5.95
  const t = balancedThresholds(vs, 2);
  assert.ok(close(t[0], 3.5, 0.11), String(t));
  const shares = bandShares(vs, t);
  assert.ok(Math.abs(shares[0] - 0.5) < 0.03, shares.join(' '));
});

test('balanced thresholds stay ascending on a flat image', () => {
  const t = balancedThresholds(new Float32Array(500).fill(4), 4);
  assert.equal(t.length, 3);
  assert.ok(t.every((v, i) => !i || v > t[i - 1]), t.join(' '));
});

test('moving a threshold pushes its neighbours to keep the order', () => {
  assert.deepEqual(setThreshold([3, 5, 7], 1, 7.5), [3, 7.5, 7.7]);
  assert.deepEqual(setThreshold([3, 5, 7], 1, 2), [1.8, 2, 7]);
  assert.deepEqual(setThreshold([3, 5, 7], 2, 12), [3, 5, 10]);
  assert.deepEqual(setThreshold([3, 5, 7], 0, -1), [0, 5, 7]);
});

test('notan paints each band with its tone, lightest to darkest', () => {
  const vs = Float32Array.from([9, 4, 1]);
  const out = notan(vs, [2, 6]);
  const tones = bandTones(3).map(v => hexToRgb(greyHex(v))[0]);
  assert.deepEqual([out[0], out[4], out[8]], tones);
  assert.ok(tones[0] > tones[1] && tones[1] > tones[2]);
  assert.equal(out[3], 255);
  assert.equal(greys(Float32Array.from([5]))[0], hexToRgb(greyHex(5))[0]);
});

test('blur melts a thin line into its surroundings but keeps big masses', () => {
  const w = 40, h = 40;
  const vs = new Float32Array(w * h).fill(9);
  for (let y = 0; y < h; y++) vs[y * w + 20] = 1;           // a 1px dark line
  for (let y = 0; y < h; y++) for (let x = 0; x < 10; x++) vs[y * w + x] = 1; // a dark mass on the left
  const b = blurValues(vs, w, h, 2);
  assert.ok(b[20 * w + 20] > 7, `line fades: ${b[20 * w + 20]}`);
  assert.ok(b[20 * w + 3] < 2, `mass stays dark: ${b[20 * w + 3]}`);
  assert.equal(blurValues(vs, w, h, 0), vs);
});

test('histogram counts values in slices from dark to light', () => {
  const hist = histogram(Float32Array.from([0, 0.1, 5, 9.99, 10]), 10);
  assert.deepEqual(hist, [2, 0, 0, 0, 0, 1, 0, 0, 0, 2]);
});
