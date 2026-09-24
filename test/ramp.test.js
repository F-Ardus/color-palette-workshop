import test from 'node:test';
import assert from 'node:assert/strict';
import { chromaOf, mixRgb, ramp } from '../public/js/ramp.js';
import { hexToRgb, hueOfHex, isHex, valueOfHex } from '../public/js/color.js';

const LIGHT = '#F2E3B3', DARK = '#1E1B3A';
const hueDist = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

test('a ramp has the asked number of steps and keeps both ends exactly', () => {
  for (const space of ['oklab', 'oklch', 'rgb']) {
    for (const n of [3, 7, 15]) {
      const r = ramp(LIGHT, DARK, n, { space });
      assert.equal(r.length, n);
      assert.equal(r[0], LIGHT);
      assert.equal(r.at(-1), DARK);
      assert.ok(r.every(isHex));
    }
  }
});

test('values go steadily from one end to the other', () => {
  const vs = ramp(LIGHT, DARK, 9).map(valueOfHex);
  assert.ok(vs.every((v, i) => !i || v < vs[i - 1]), vs.map(v => v.toFixed(2)).join(' '));
});

test('"even value steps" spaces the values evenly', () => {
  for (const space of ['oklab', 'oklch', 'rgb']) {
    const vs = ramp('#FFE9A8', '#0E1A40', 7, { space, evenValues: true }).map(valueOfHex);
    const gaps = vs.slice(1).map((v, i) => vs[i] - v);
    assert.ok(Math.max(...gaps) - Math.min(...gaps) < 0.1, `${space}: ${gaps.map(g => g.toFixed(2)).join(' ')}`);
  }
});

test('black to white in OKLab stays neutral grey', () => {
  for (const hex of ramp('#FFFFFF', '#000000', 5).slice(1, -1)) {
    const [r, g, b] = hexToRgb(hex);
    assert.ok(Math.max(r, g, b) - Math.min(r, g, b) <= 1, hex);
  }
});

test('the plain RGB mix of red and green sinks darker than OKLab (the muddy middle)', () => {
  const rgbMid = ramp('#FF0000', '#00FF00', 3, { space: 'rgb' })[1];
  const labMid = ramp('#FF0000', '#00FF00', 3, { space: 'oklab' })[1];
  assert.equal(rgbMid, '#808000');
  assert.equal(mixRgb('#FF0000', '#00FF00', 0.5), '#808000');
  assert.ok(valueOfHex(labMid) > valueOfHex(rgbMid) + 1, `${labMid} vs ${rgbMid}`);
});

test('OKLCH keeps the middle vivid by walking round the hue wheel', () => {
  const lch = ramp('#E04040', '#4050E0', 3, { space: 'oklch' })[1];
  const lab = ramp('#E04040', '#4050E0', 3, { space: 'oklab' })[1];
  assert.ok(chromaOf(lch) > chromaOf(lab) * 1.5, `${lch} ${chromaOf(lch)} vs ${lab} ${chromaOf(lab)}`);
});

test('a grey end takes the other end\'s hue in OKLCH', () => {
  const r = ramp('#FFFFFF', '#2040C0', 5, { space: 'oklch' });
  r.slice(1, -1).forEach(h => assert.ok(hueDist(hueOfHex(h), hueOfHex('#2040C0')) < 10, h));
});

test('hue shift bends the middle, not the ends', () => {
  const plain = ramp(LIGHT, DARK, 5);
  const shifted = ramp(LIGHT, DARK, 5, { hueShift: 60 });
  assert.equal(shifted[0], LIGHT);
  assert.equal(shifted.at(-1), DARK);
  assert.ok(hueDist(hueOfHex(shifted[2]), hueOfHex(plain[2])) > 30, `${plain[2]} → ${shifted[2]}`);
  shifted.forEach((h, i) => assert.ok(Math.abs(valueOfHex(h) - valueOfHex(plain[i])) < 0.05, `value kept at ${i}`));
});

test('more chroma in the middle makes it more vivid; less makes it greyer', () => {
  const plain = ramp('#E8C070', '#3A2050', 5)[2];
  const more = ramp('#E8C070', '#3A2050', 5, { midChroma: 0.8 })[2];
  const less = ramp('#E8C070', '#3A2050', 5, { midChroma: -1 })[2];
  assert.ok(chromaOf(more) > chromaOf(plain), `${more} vs ${plain}`);
  assert.ok(chromaOf(less) < 0.01, less);
});

test('bending keeps even value steps', () => {
  const vs = ramp('#FFE9A8', '#0E1A40', 7, { evenValues: true, hueShift: -40, midChroma: 0.5 }).map(valueOfHex);
  const gaps = vs.slice(1).map((v, i) => vs[i] - v);
  assert.ok(Math.max(...gaps) - Math.min(...gaps) < 0.1, gaps.map(g => g.toFixed(2)).join(' '));
});
