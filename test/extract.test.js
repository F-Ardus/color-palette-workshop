import test from 'node:test';
import assert from 'node:assert/strict';
import { AUTO_MAX, DETAIL_DEFAULT, extractAuto, extractPalette, kmeans, mapPixels, mergeClusters, mergeDistance, paletteFromHexes, posterize, sharesOf, toOklab, topByShare } from '../public/js/extract.js';
import { greyHex, hexToRgb, valueOfHex } from '../public/js/color.js';

// An RGBA image made of solid blocks: [[hex, pixelCount, alpha?], ...]
function image(blocks) {
  const px = [];
  for (const [hex, count, alpha = 255] of blocks)
    for (let i = 0; i < count; i++) px.push(...hexToRgb(hex), alpha);
  return Uint8ClampedArray.from(px);
}

test('finds the exact colors of a flat image, with their shares, light to dark', () => {
  const img = image([['#1E1B3A', 500], ['#F2E3B3', 300], ['#D98E73', 200]]);
  const pal = extractPalette(img, 3);
  assert.deepEqual(pal.map(c => c.hex), ['#F2E3B3', '#D98E73', '#1E1B3A']);
  assert.deepEqual(pal.map(c => +c.share.toFixed(2)), [0.3, 0.2, 0.5]);
});

test('returns fewer colors when the image has fewer than asked', () => {
  const pal = extractPalette(image([['#000000', 50], ['#FFFFFF', 50]]), 6);
  assert.deepEqual(pal.map(c => c.hex), ['#FFFFFF', '#000000']);
});

test('ignores transparent pixels', () => {
  const pal = extractPalette(image([['#FF0000', 100, 0], ['#3366AA', 40]]), 3);
  assert.deepEqual(pal.map(c => c.hex), ['#3366AA']);
  assert.equal(pal[0].share, 1);
  assert.deepEqual(extractPalette(image([['#FF0000', 10, 0]]), 3), []);
});

test('is deterministic for the same image', () => {
  const px = [];
  for (let i = 0; i < 2000; i++) px.push((i * 37) % 256, (i * 91) % 256, (i * 13) % 256, 255);
  const img = Uint8ClampedArray.from(px);
  assert.deepEqual(extractPalette(img, 5), extractPalette(img, 5));
  const pal = extractPalette(img, 5);
  assert.equal(pal.length, 5);
  assert.ok(Math.abs(pal.reduce((s, c) => s + c.share, 0) - 1) < 1e-9);
  const vs = pal.map(c => valueOfHex(c.hex));
  assert.ok(vs.every((v, i) => !i || vs[i - 1] >= v), 'sorted by value');
});

test('similar shades fall in the same cluster', () => {
  const img = image([['#202020', 100], ['#222222', 100], ['#E0E0E0', 100], ['#E2E2E2', 100]]);
  const { counts } = kmeans(toOklab(img), 2, () => 0.5);
  assert.deepEqual([...counts].sort(), [200, 200]);
});

test('posterize repaints every pixel with the nearest palette color, keeping alpha', () => {
  const img = image([['#F0E0B0', 2], ['#1A1A40', 2, 128]]);
  const pal = extractPalette(image([['#F2E3B3', 10], ['#1E1B3A', 10]]), 2);
  const out = posterize(img, pal);
  assert.deepEqual([...out.slice(0, 4)], [...hexToRgb('#F2E3B3'), 255]);
  assert.deepEqual([...out.slice(8, 12)], [...hexToRgb('#1E1B3A'), 128]);
});

test('automatic mode finds the distinct colors of a flat image, ignoring edge blends', () => {
  // Five flat colors plus a sprinkle of in-between pixels, like anti-aliased edges.
  const img = image([
    ['#FEFEFE', 4000], ['#F7E6D0', 300], ['#E68677', 500], ['#809080', 500], ['#1F1D36', 400],
    ['#EEB6A4', 6], ['#B38B7C', 5], ['#50566B', 7],
  ]);
  const pal = extractAuto(img, DETAIL_DEFAULT);
  // Edge pixels fold into their nearest color, nudging it by a unit or so.
  const near = (a, b) => [1, 3, 5].every(i => Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)) <= 3);
  const expected = ['#FEFEFE', '#F7E6D0', '#E68677', '#809080', '#1F1D36'];
  assert.equal(pal.length, expected.length, pal.map(c => c.hex).join(' '));
  expected.forEach((e, i) => assert.ok(near(pal[i].hex, e), `${pal[i].hex} ~ ${e}`));
});

test('more detail keeps more colors; less detail merges close ones', () => {
  const img = image([['#FEFEFE', 500], ['#F7E6D0', 500], ['#20203A', 500], ['#28233C', 500]]);
  const low = extractAuto(img, 1), high = extractAuto(img, 10);
  assert.ok(low.length < high.length, `${low.length} < ${high.length}`);
  assert.ok(high.length <= AUTO_MAX);
  assert.ok(mergeDistance(1) > mergeDistance(DETAIL_DEFAULT) && mergeDistance(DETAIL_DEFAULT) > mergeDistance(10));
});

test('mergeClusters folds tiny clusters and keeps the total count', () => {
  const merged = mergeClusters([
    { lab: [0.9, 0, 0], count: 990 }, { lab: [0.2, 0, 0], count: 1000 }, { lab: [0.5, 0.1, 0], count: 2 },
  ], 0.01, 0.004);
  assert.equal(merged.length, 2);
  assert.equal(merged.reduce((s, c) => s + c.count, 0), 1992);
});

test('up to 24 colors can be asked for', () => {
  const px = [];
  for (let i = 0; i < 4000; i++) px.push((i * 37) % 256, (i * 91) % 256, (i * 13) % 256, 255);
  assert.equal(extractPalette(Uint8ClampedArray.from(px), 24).length, 24);
});

test('topByShare keeps the colors that cover most, in value order', () => {
  const cols = [
    { hex: '#FFFFFF', share: 0.05 }, { hex: '#CCCCCC', share: 0.4 }, { hex: '#888888', share: 0.1 },
    { hex: '#444444', share: 0.3 }, { hex: '#000000', share: 0.15 },
  ];
  assert.deepEqual(topByShare(cols, 3).map(c => c.hex), ['#CCCCCC', '#444444', '#000000']);
  assert.equal(topByShare(cols, 9).length, 5);
});

test('a pasted palette gets the extraction shape, light to dark', () => {
  const pal = paletteFromHexes(['#1E1B3A', '#F2E3B3', '#D98E73']);
  assert.deepEqual(pal.map(c => c.hex), ['#F2E3B3', '#D98E73', '#1E1B3A']);
  assert.ok(pal.every(c => c.lab.length === 3 && typeof c.keyValue === 'number' && c.share === 0));
});

test('by color, each pixel goes to the palette color that looks most like it', () => {
  const img = image([['#E07060', 3], ['#3050C0', 2]]);          // a red and a blue
  const pal = paletteFromHexes(['#F08070', '#2040B0', '#FFFFFF']);
  const idx = [...mapPixels(img, pal, 'color')];
  const red = pal.findIndex(c => c.hex === '#F08070'), blue = pal.findIndex(c => c.hex === '#2040B0');
  assert.deepEqual(idx, [red, red, red, blue, blue]);
  assert.deepEqual(sharesOf(mapPixels(img, pal, 'color'), pal.length).map(s => +s.toFixed(1)), pal.map((_, i) => (i === red ? 0.6 : i === blue ? 0.4 : 0)));
});

test('by value, each pixel goes to the palette color with the nearest value, whatever its hue', () => {
  const img = image([[greyHex(8.5), 2], [greyHex(5.2), 2], [greyHex(1.5), 1]]);
  const pal = paletteFromHexes(['#E8D06A', '#3E8F5A', '#2A1F5C']);  // light yellow, mid green, dark indigo
  const [v0, v1, v2] = pal.map(c => c.keyValue);
  assert.ok(v0 > v1 && v1 > v2);
  assert.deepEqual([...mapPixels(img, pal, 'value')], [0, 0, 1, 1, 2]);
  // Painted with the palette's hues, lights and shadows where the photo had them.
  const out = posterize(img, pal, 'value');
  assert.deepEqual([...out.slice(0, 3)], hexToRgb('#E8D06A'));
  assert.deepEqual([...out.slice(16, 19)], hexToRgb('#2A1F5C'));
});

test('zones follow the key, not the shown hex (so recoloring keeps them)', () => {
  const img = image([['#E07060', 1], ['#3050C0', 1]]);
  const pal = paletteFromHexes(['#F08070', '#2040B0']);
  const recolored = pal.map(c => ({ ...c, hex: c.hex === '#F08070' ? '#00FF00' : '#FF00FF' }));
  assert.deepEqual([...mapPixels(img, recolored, 'color')], [...mapPixels(img, pal, 'color')]);
});

test('transparent pixels count for no color', () => {
  const idx = mapPixels(image([['#FF0000', 2, 0], ['#FF0000', 2]]), paletteFromHexes(['#FF0000']));
  assert.deepEqual([...idx], [-1, -1, 0, 0]);
  assert.deepEqual(sharesOf(idx, 1), [1]);
});
