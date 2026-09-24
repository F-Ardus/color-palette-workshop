import test from 'node:test';
import assert from 'node:assert/strict';
import { contrast, greyHex, isHex, makeColor, textOn, TEXT_DARK, TEXT_LIGHT, valueOfHex } from '../public/js/color.js';

test('makeColor lands on the requested value across hues and saturations', () => {
  let worst = 0;
  for (let v = 0; v <= 10; v += 0.5)
    for (let h = 0; h < 360; h += 15)
      for (const s of [0, 0.3, 0.55, 1]) {
        const hex = makeColor(v, h, s);
        assert.ok(isHex(hex), `${hex} is not a hex color`);
        worst = Math.max(worst, Math.abs(valueOfHex(hex) - v));
      }
  assert.ok(worst < 0.03, `worst value error ${worst}`);
});

test('greyHex round-trips through valueOfHex', () => {
  for (let v = 0; v <= 10; v += 0.25) assert.ok(Math.abs(valueOfHex(greyHex(v)) - v) < 0.03, `value ${v}`);
  assert.equal(greyHex(0), '#000000');
  assert.equal(greyHex(10), '#FFFFFF');
});

test('saturation 0 gives a neutral grey', () => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(makeColor(5, 40, 0).slice(i, i + 2), 16));
  assert.ok(Math.max(r, g, b) - Math.min(r, g, b) <= 1);
});

test('isHex only accepts #RRGGBB', () => {
  assert.ok(isHex('#1e1b3a'));
  for (const bad of ['1E1B3A', '#FFF', '#GGGGGG', '<img>', null, 42]) assert.ok(!isHex(bad), String(bad));
});

test('textOn picks the text color with the higher contrast', () => {
  for (let v = 0; v <= 10; v += 0.1) {
    const bg = greyHex(v), pick = textOn(bg), other = pick === TEXT_DARK ? TEXT_LIGHT : TEXT_DARK;
    assert.ok(contrast(bg, pick) >= contrast(bg, other), `value ${v.toFixed(1)}`);
  }
  // Mid greys around value 5.3 used to get light text at ~3.7:1.
  assert.equal(textOn(greyHex(5.3)), TEXT_DARK);
});
