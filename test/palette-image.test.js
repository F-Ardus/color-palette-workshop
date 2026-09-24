import test from 'node:test';
import assert from 'node:assert/strict';
import { imageLayout } from '../public/js/palette-image.js';

const W = 1200, H = 566;
const covers = cells => {
  const area = cells.reduce((s, c) => s + c.w * c.h, 0);
  return area === W * H;
};

test('up to 8 colors: one row of equal columns filling the image', () => {
  for (const n of [1, 3, 5, 8]) {
    const cells = imageLayout(n, W, H);
    assert.equal(cells.length, n);
    assert.ok(cells.every(c => c.y === 0 && c.h === H), `n=${n} one row`);
    assert.ok(covers(cells), `n=${n} no gaps`);
    assert.ok(Math.max(...cells.map(c => c.w)) - Math.min(...cells.map(c => c.w)) <= 1);
  }
});

test('more colors wrap into balanced rows, still filling the image', () => {
  const cells = imageLayout(12, W, H);
  assert.equal(cells.length, 12);
  assert.deepEqual([...new Set(cells.map(c => c.y))].length, 2);
  assert.equal(cells.filter(c => c.y === 0).length, 6, 'balanced: 6 + 6, not 8 + 4');
  assert.ok(covers(cells));
  const many = imageLayout(24, W, H);
  assert.equal([...new Set(many.map(c => c.y))].length, 3);
  assert.ok(covers(many));
});

test('an uneven last row stretches to the full width', () => {
  const cells = imageLayout(11, W, H);
  const last = cells.filter(c => c.y === Math.max(...cells.map(k => k.y)));
  assert.equal(last.reduce((s, c) => s + c.w, 0), W);
  assert.ok(covers(cells));
});

test('no colors, no cells', () => {
  assert.deepEqual(imageLayout(0), []);
});
