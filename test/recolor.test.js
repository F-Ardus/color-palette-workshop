import test from 'node:test';
import assert from 'node:assert/strict';
import { groupHues, recolor, rerollOne } from '../public/js/recolor.js';
import { hueOfHex, makeColor, satOfHex, valueOfHex } from '../public/js/color.js';
import { seeded } from './helpers.js';

const hueDist = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
// Two families, as in a portrait: warm skin tones and a blue background, plus a grey.
const PHOTO = [
  [8.5, 40, 0.5], [7.2, 35, 0.6], [6.0, 25, 0.55], [4.5, 240, 0.5], [3.0, 250, 0.6], [2.0, 60, 0.02],
].map(([v, h, s]) => ({ hex: makeColor(v, h, s), lab: [v, h, s], share: 1 / 6 }));

test('recolor keeps every value, saturation, share and lab', () => {
  for (const harmony of ['random', 'mono', 'analogous', 'complementary', 'split', 'triad']) {
    const out = recolor(PHOTO, { harmony }, seeded(3));
    out.forEach((c, i) => {
      assert.ok(Math.abs(valueOfHex(c.hex) - valueOfHex(PHOTO[i].hex)) < 0.03, `${harmony} value ${i}`);
      assert.ok(Math.abs(satOfHex(c.hex) - satOfHex(PHOTO[i].hex)) < 0.06, `${harmony} sat ${i}`);
      assert.equal(c.share, PHOTO[i].share);
      assert.equal(c.lab, PHOTO[i].lab);
    });
  }
});

test('recolor actually changes the hues', () => {
  const out = recolor(PHOTO, { harmony: 'triad' }, seeded(4));
  assert.ok(out.slice(0, 5).some((c, i) => hueDist(hueOfHex(c.hex), hueOfHex(PHOTO[i].hex)) > 20));
});

test('colors of one family stay together; families split across the harmony', () => {
  const out = recolor(PHOTO, { harmony: 'complementary' }, seeded(5)).map(c => hueOfHex(c.hex));
  assert.ok(hueDist(out[0], out[1]) < 20 && hueDist(out[1], out[2]) < 20, 'skin tones stay close');
  assert.ok(hueDist(out[3], out[4]) < 20, 'background stays close');
  assert.ok(hueDist(out[1], out[3]) > 140, 'the two families land on opposite hues');
});

test('monochrome puts every color in one family', () => {
  const out = recolor(PHOTO, { harmony: 'mono' }, seeded(6)).slice(0, 5).map(c => hueOfHex(c.hex));
  out.forEach(h => assert.ok(hueDist(h, out[0]) <= 42, out.map(x => x.toFixed(0)).join(' ')));
});

test('greys stay grey', () => {
  const out = recolor(PHOTO, { harmony: 'random' }, seeded(7));
  assert.ok(satOfHex(out[5].hex) < 0.1);
});

test('recolor is deterministic for a given rng and empty in, empty out', () => {
  assert.deepEqual(recolor(PHOTO, { harmony: 'split' }, seeded(8)), recolor(PHOTO, { harmony: 'split' }, seeded(8)));
  assert.deepEqual(recolor([], {}), []);
});

test('groupHues cuts the wheel at the widest gaps, wrapping around 0°', () => {
  const groups = groupHues([{ i: 0, h: 350 }, { i: 1, h: 10 }, { i: 2, h: 180 }, { i: 3, h: 190 }], 2);
  const sets = groups.map(g => g.map(x => x.i).sort().join(','));
  assert.deepEqual(sets.sort(), ['0,1', '2,3']);
});

test('rerollOne changes one hue, keeps its value and saturation, leaves the rest', () => {
  const out = rerollOne(PHOTO, 1, {}, seeded(9));
  assert.ok(hueDist(hueOfHex(out[1].hex), hueOfHex(PHOTO[1].hex)) >= 30);
  assert.ok(Math.abs(valueOfHex(out[1].hex) - valueOfHex(PHOTO[1].hex)) < 0.03);
  assert.ok(Math.abs(satOfHex(out[1].hex) - satOfHex(PHOTO[1].hex)) < 0.06);
  assert.equal(out[1].share, PHOTO[1].share);
  assert.equal(out[1].lab, PHOTO[1].lab);
  [0, 2, 3, 4, 5].forEach(i => assert.equal(out[i], PHOTO[i]));
});

test('rerollOne gives a grey some color so the change shows', () => {
  const out = rerollOne(PHOTO, 5, {}, seeded(10));
  assert.ok(satOfHex(out[5].hex) > 0.2);
  assert.ok(Math.abs(valueOfHex(out[5].hex) - valueOfHex(PHOTO[5].hex)) < 0.03);
});
