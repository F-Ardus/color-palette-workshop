import test from 'node:test';
import assert from 'node:assert/strict';
import { valueOfHex } from '../public/js/color.js';
import { adjustPalette, applyTemperature, generatePalette, hues, minGap, rankOf, recipeFromHex, resampleRecipes, rerollColor, roleFor, setColorValue, sortPalette, targetValues } from '../public/js/palette.js';
import { hueOfHex, satOfHex } from '../public/js/color.js';
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
  assert.deepEqual(lin, ['highlight', 'midLight', 'mid', 'midDark', 'deepDark']);
  const low = targetValues(5, 9, 1, 'dark').map((v, i) => roleFor(i, 5, v));
  assert.deepEqual(low, ['highlight', 'mid', 'midDark', 'shadow', 'deepDark']);
});

const hueDist = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
const huesOf = cols => cols.map(hueOfHex);
// Hue read back from an 8-bit hex drifts a few degrees near black.
const HUE_TOL = 6;

test('adjustPalette keeps the hues when the saturation changes', () => {
  const first = generatePalette({ ...SETTINGS, sat: 40, jit: 0 }, undefined, seeded(11));
  const next = adjustPalette({ ...SETTINGS, sat: 90, jit: 0 }, first);
  huesOf(next.colors).forEach((h, i) => assert.ok(hueDist(h, huesOf(first.colors)[i]) < HUE_TOL, `step ${i}`));
  next.colors.forEach((hex, i) => assert.ok(satOfHex(hex) > satOfHex(first.colors[i]), `step ${i} more saturated`));
  assert.deepEqual(next.recipes.map(r => r.hue), first.recipes.map(r => r.hue));
});

test('adjustPalette keeps the hues when the value range changes', () => {
  const first = generatePalette(SETTINGS, undefined, seeded(12));
  const next = adjustPalette({ ...SETTINGS, vHi: 8, vLo: 2 }, first);
  const vs = next.colors.map(valueOfHex);
  targetValues(5, 8, 2, 'linear').forEach((t, i) => assert.ok(Math.abs(vs[i] - t) < 0.03, `step ${i}`));
  huesOf(next.colors).forEach((h, i) => assert.ok(hueDist(h, huesOf(first.colors)[i]) < HUE_TOL, `step ${i}`));
});

test('adjustPalette stretches the palette to a new count', () => {
  const first = generatePalette({ ...SETTINGS, harmony: 'analogous' }, undefined, seeded(13));
  const next = adjustPalette({ ...SETTINGS, harmony: 'analogous', count: 9 }, first);
  assert.equal(next.colors.length, 9);
  assert.ok(hueDist(next.recipes[0].hue, first.recipes[0].hue) < 1e-9, 'lightest hue kept');
  assert.ok(hueDist(next.recipes[8].hue, first.recipes[4].hue) < 1e-9, 'darkest hue kept');
  assert.ok(hueDist(next.recipes[2].hue, first.recipes[1].hue) < 1e-9, 'every other step is an original one');
});

test('adjustPalette keeps locked colors untouched', () => {
  const first = generatePalette(SETTINGS, undefined, seeded(14));
  const prev = { ...first, locked: [false, false, true, false, false] };
  const next = adjustPalette({ ...SETTINGS, sat: 10 }, prev);
  assert.equal(next.colors[2], first.colors[2]);
  assert.equal(next.locked[2], true);
});

test('adjustPalette works on palettes without recipes (saved or from the history)', () => {
  const first = generatePalette({ ...SETTINGS, jit: 0 }, undefined, seeded(15));
  const bare = { colors: first.colors, locked: first.locked };
  const same = adjustPalette({ ...SETTINGS, jit: 0 }, bare);
  same.colors.forEach((hex, i) => {
    assert.ok(Math.abs(valueOfHex(hex) - valueOfHex(first.colors[i])) < 0.05, `value ${i}`);
    assert.ok(hueDist(hueOfHex(hex), hueOfHex(first.colors[i])) < HUE_TOL, `hue ${i}`);
  });
});

test('recipeFromHex reproduces a color under the same settings', () => {
  const s = { ...SETTINGS, sat: 60, jit: 40 };
  const hex = generatePalette(s, undefined, seeded(16)).colors[1];
  const r = recipeFromHex(hex, s);
  assert.ok(hueDist(r.hue, hueOfHex(hex)) < 1e-9);
  assert.ok(r.jitter >= -1 && r.jitter <= 1 && r.pick >= 0 && r.pick <= 1);
});

test('resampleRecipes interpolates hues the short way round', () => {
  const out = resampleRecipes([{ hue: 350, jitter: 0, pick: 1 }, { hue: 10, jitter: 1, pick: 0 }], 3);
  assert.ok(hueDist(out[1].hue, 0) < 1e-9);
  assert.equal(out[1].jitter, 0.5);
});

test('unscaled palettes take random values inside the range, light to dark', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const { colors } = generatePalette({ ...SETTINGS, scale: false, vHi: 8, vLo: 2 }, undefined, seeded(seed));
    const vs = colors.map(valueOfHex);
    assert.ok(vs.every(v => v >= 1.97 && v <= 8.03), vs.join(' '));
    assert.ok(gaps(vs).every(g => g >= 0), 'sorted');
  }
  const a = generatePalette({ ...SETTINGS, scale: false }, undefined, seeded(3)).colors.map(valueOfHex);
  const b = targetValues(5, 9, 1, 'linear');
  assert.ok(a.some((v, i) => Math.abs(v - b[i]) > 0.3), 'not the even steps');
});

test('turning scaling back on returns to even steps with the same hues', () => {
  const free = generatePalette({ ...SETTINGS, scale: false }, undefined, seeded(17));
  const back = adjustPalette(SETTINGS, free);
  const vs = back.colors.map(valueOfHex);
  targetValues(5, 9, 1, 'linear').forEach((t, i) => assert.ok(Math.abs(vs[i] - t) < 0.03, `step ${i}`));
  assert.deepEqual(back.recipes.map(r => r.hue), free.recipes.map(r => r.hue));
});

test('rerollColor changes one hue and keeps its value', () => {
  for (const scale of [true, false]) {
    const s = { ...SETTINGS, scale };
    const first = generatePalette(s, undefined, seeded(21));
    const next = rerollColor(s, first, 2, seeded(22));
    assert.ok(Math.abs(valueOfHex(next.colors[2]) - valueOfHex(first.colors[2])) < 0.05, `scale=${scale} value kept`);
    assert.ok(hueDist(next.recipes[2].hue, first.recipes[2].hue) >= 30, `scale=${scale} hue changed`);
    [0, 1, 3, 4].forEach(i => assert.equal(next.colors[i], first.colors[i], `scale=${scale} step ${i} untouched`));
  }
});

test('repeated rerolls do not drift the value', () => {
  let p = generatePalette(SETTINGS, undefined, seeded(23));
  const rng = seeded(24);
  for (let k = 0; k < 40; k++) p = rerollColor(SETTINGS, p, 1, rng);
  assert.ok(Math.abs(valueOfHex(p.colors[1]) - 7) < 0.03, String(valueOfHex(p.colors[1])));
});

test('a rerolled color survives adjusting with "Mantener tonos"', () => {
  const first = generatePalette(SETTINGS, undefined, seeded(25));
  const rolled = rerollColor(SETTINGS, first, 3, seeded(26));
  const adjusted = adjustPalette({ ...SETTINGS, sat: 80 }, rolled);
  assert.equal(adjusted.recipes[3].hue, rolled.recipes[3].hue);
});

test('setColorValue moves one color to an exact value and keeps its hue', () => {
  const s = { ...SETTINGS, scale: false };
  const first = generatePalette(s, undefined, seeded(31));
  const next = setColorValue(s, first, 1, 3.4);
  assert.ok(Math.abs(valueOfHex(next.colors[1]) - 3.4) < 0.03);
  assert.ok(hueDist(hueOfHex(next.colors[1]), hueOfHex(first.colors[1])) < HUE_TOL);
  assert.equal(next.recipes[1].hue, first.recipes[1].hue);
  [0, 2, 3, 4].forEach(i => assert.equal(next.colors[i], first.colors[i]));
  // The new value is remembered: adjusting brings it back at the same place in the range.
  const adjusted = adjustPalette(s, next);
  assert.ok(adjusted.colors.map(valueOfHex).some(v => Math.abs(v - 3.4) < 0.03));
});

test('sortPalette orders light to dark and carries locks and recipes', () => {
  const s = { ...SETTINGS, scale: false };
  const first = generatePalette(s, undefined, seeded(32));
  const moved = setColorValue(s, { ...first, locked: [true, false, false, false, false] }, 0, 1.1);
  const sorted = sortPalette(moved);
  const vs = sorted.colors.map(valueOfHex);
  assert.ok(gaps(vs).every(g => g >= 0));
  const i = sorted.colors.indexOf(moved.colors[0]);
  assert.equal(sorted.locked[i], true);
  assert.equal(sorted.recipes[i], moved.recipes[0]);
});

test('rankOf gives the place in light-to-dark order, ties by position', () => {
  assert.deepEqual([3, 9, 5, 1].map((_, i, vs) => rankOf(vs, i)), [2, 0, 1, 3]);
  assert.deepEqual([5, 5].map((_, i, vs) => rankOf(vs, i)), [0, 1]);
});

test('with "Ordenar por value" off, an unscaled palette keeps its own order when adjusted', () => {
  const s = { ...SETTINGS, scale: false, order: false };
  const first = generatePalette(s, undefined, seeded(41));
  const shuffled = setColorValue(s, first, 0, 1.2); // lightest card becomes the darkest, stays first
  const adjusted = adjustPalette({ ...s, sat: 80 }, shuffled);
  assert.ok(Math.abs(valueOfHex(adjusted.colors[0]) - 1.2) < 0.03, 'first card still the one moved');
  assert.equal(adjusted.recipes[0].hue, shuffled.recipes[0].hue);
  const sortedToo = adjustPalette({ ...s, order: true }, shuffled);
  assert.ok(gaps(sortedToo.colors.map(valueOfHex)).every(g => g >= 0), 'order on sorts again');
});

test('scaled palettes are always sorted, whatever the order setting says', () => {
  const s = { ...SETTINGS, order: false };
  const p = generatePalette(s, undefined, seeded(42));
  assert.ok(gaps(p.colors.map(valueOfHex)).every(g => g >= 0));
});

test('"Apagar los extremos" follows value, not card position', () => {
  const s = { ...SETTINGS, scale: false, order: false, mute: true, jit: 0 };
  const first = generatePalette(s, undefined, seeded(43));
  // Move a middle card below everything: it is now the darkest, so it gets muted.
  const moved = setColorValue(s, first, 2, 0.5);
  const plain = setColorValue({ ...s, mute: false }, first, 2, 0.5);
  assert.ok(satOfHex(moved.colors[2]) < satOfHex(plain.colors[2]) - 0.2);
});
