import test from 'node:test';
import assert from 'node:assert/strict';
import { valueOfHex } from '../public/js/color.js';
import { applyTemperature, generatePalette, hues, minGap, roleFor, targetValues } from '../public/js/palette.js';
import { SETTINGS, seeded } from './helpers.js';

const gaps = vs => vs.slice(1).map((v, i) => vs[i] - v);
const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('targetValues spans hi to lo', () => {
  for (const dist of ['linear', 'dark', 'light']) {
    const vs = targetValues(5, 9, 1, dist);
    assert.equal(vs[0], 9);
    assert.equal(vs.at(-1), 1);
    assert.ok(gaps(vs).every(g => g > 0), dist);
  }
  assert.deepEqual(targetValues(5, 9, 1, 'linear'), [9, 7, 5, 3, 1]);
});

test('high key is the mirror of low key', () => {
  for (const n of [3, 5, 9]) {
    const dark = gaps(targetValues(n, 9, 1, 'dark')), light = gaps(targetValues(n, 9, 1, 'light'));
    dark.reverse().forEach((g, i) => assert.ok(close(g, light[i]), `n=${n} step ${i}`));
  }
  // With the defaults, high key no longer trips the "too close" warning.
  assert.ok(minGap(targetValues(5, 9, 1, 'light')) > 0.9);
});

test('generatePalette hits the targets and comes out sorted light to dark', () => {
  for (const dist of ['linear', 'dark', 'light']) {
    const { colors, locked } = generatePalette({ ...SETTINGS, dist }, undefined, seeded(7));
    const vs = colors.map(valueOfHex);
    targetValues(5, 9, 1, dist).forEach((t, i) => assert.ok(Math.abs(vs[i] - t) < 0.03, `${dist} step ${i}`));
    assert.deepEqual(locked, [false, false, false, false, false]);
  }
});

test('generatePalette is deterministic for a given rng', () => {
  const a = generatePalette(SETTINGS, undefined, seeded(3));
  const b = generatePalette(SETTINGS, undefined, seeded(3));
  assert.deepEqual(a, b);
});

test('locked colors survive a change in the count and stay in value order', () => {
  const first = generatePalette(SETTINGS, undefined, seeded(1));
  const prev = { colors: first.colors, locked: [true, false, true, false, false] };
  const next = generatePalette({ ...SETTINGS, count: 7 }, prev, seeded(2));
  assert.equal(next.colors.length, 7);
  for (const hex of [first.colors[0], first.colors[2]]) {
    const i = next.colors.indexOf(hex);
    assert.ok(i >= 0, `${hex} kept`);
    assert.equal(next.locked[i], true);
  }
  assert.equal(next.locked.filter(Boolean).length, 2);
  const vs = next.colors.map(valueOfHex);
  assert.ok(gaps(vs).every(g => g >= 0), 'sorted');
});

test('a locked color from another value range is placed by its value', () => {
  // A value-9 highlight locked at the bottom slot must not stay below the darks.
  const first = generatePalette(SETTINGS, undefined, seeded(4));
  const prev = { colors: [...first.colors].reverse(), locked: [false, false, false, false, true] };
  const next = generatePalette({ ...SETTINGS, vHi: 7, vLo: 0 }, prev, seeded(5));
  assert.equal(next.colors[0], first.colors[0]);
  assert.equal(next.locked[0], true);
});

test('locks that do not fit are reported', () => {
  const first = generatePalette({ ...SETTINGS, count: 7 }, undefined, seeded(1));
  const prev = { colors: first.colors, locked: first.colors.map(() => true) };
  const next = generatePalette({ ...SETTINGS, count: 4 }, prev, seeded(2));
  assert.equal(next.colors.length, 4);
  assert.equal(next.dropped, 3);
  assert.ok(next.locked.every(Boolean));
});

test('temperature keeps a monochrome harmony close to one hue', () => {
  const hs = hues(7, 'mono', 180, seeded(9));
  for (const temp of ['warmLight', 'coolLight']) {
    const out = applyTemperature(hs, temp, 'mono');
    out.forEach((h, i) => {
      const d = Math.abs(((h - hs[i] + 540) % 360) - 180);
      assert.ok(d <= 35 + 1e-9, `${temp} drifted ${d}°`);
    });
  }
});

test('temperature ramps sweep through reds, not greens', () => {
  // With free harmony, a hue already on the ramp stays put.
  const warm = applyTemperature([75, 32.5, 350, 307.5, 265], 'warmLight', 'random');
  [75, 32.5, 350, 307.5, 265].forEach((h, i) => assert.ok(close(warm[i], h), `warm ${i}`));
  const cool = applyTemperature([230, 270, 310, 350, 30], 'coolLight', 'random');
  [230, 270, 310, 350, 30].forEach((h, i) => assert.ok(close(cool[i], h), `cool ${i}`));
});

test('minGap compares every pair, not only neighbours', () => {
  assert.ok(close(minGap([9, 5, 8.9]), 0.1));
  assert.equal(minGap([5]), Infinity);
});

test('roles follow the actual value', () => {
  const lin = [9, 7, 5, 3, 1].map((v, i) => roleFor(i, 5, v));
  assert.deepEqual(lin, ['Luz alta', 'Medio claro', 'Medio', 'Medio oscuro', 'Oscuro profundo']);
  const low = targetValues(5, 9, 1, 'dark').map((v, i) => roleFor(i, 5, v));
  assert.deepEqual(low, ['Luz alta', 'Medio', 'Medio oscuro', 'Sombra', 'Oscuro profundo']);
});
