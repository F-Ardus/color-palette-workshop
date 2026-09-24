// Palette from an image: k-means in OKLab over the pixels of a downsampled copy.
// Pure functions on RGBA bytes, so they run the same in the browser and in tests.

import { linToHex, linToOklab, oklabToLin, valueOfHex } from './color.js';

const DECODE = Float64Array.from({ length: 256 }, (_, i) => {
  const v = i / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
});
const labOfBytes = (r, g, b) => linToOklab([DECODE[r], DECODE[g], DECODE[b]]);

// Pixels with less opacity than this are ignored (transparent backgrounds).
const MIN_ALPHA = 128;

// RGBA bytes → flat OKLab points [L, a, b, L, a, b, ...].
export function toOklab(rgba) {
  const out = [];
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] < MIN_ALPHA) continue;
    const [L, a, b] = labOfBytes(rgba[i], rgba[i + 1], rgba[i + 2]);
    out.push(L, a, b);
  }
  return Float64Array.from(out);
}

const dist2 = (p, i, c, j) => {
  const dL = p[i] - c[j], da = p[i + 1] - c[j + 1], db = p[i + 2] - c[j + 2];
  return dL * dL + da * da + db * db;
};

function nearest(p, i, cents, k) {
  let best = 0, bd = Infinity;
  for (let c = 0; c < k; c++) {
    const d = dist2(p, i, cents, c * 3);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

// k-means with k-means++ seeding. Returns fewer than k clusters when the image
// has fewer distinct colors. {centroids: Float64Array (3 per cluster), counts}
export function kmeans(points, k, rng, maxIter = 24) {
  const n = points.length / 3;
  if (!n) return { centroids: new Float64Array(0), counts: [] };
  const cents = [];
  const d2 = new Float64Array(n).fill(Infinity);
  let pick = Math.floor(rng() * n);
  while (cents.length / 3 < k) {
    cents.push(points[pick * 3], points[pick * 3 + 1], points[pick * 3 + 2]);
    const c = cents.length - 3;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      d2[i] = Math.min(d2[i], dist2(points, i * 3, cents, c));
      sum += d2[i];
    }
    if (sum === 0) break; // every pixel already matches a seed
    let r = rng() * sum;
    pick = n - 1;
    for (let i = 0; i < n; i++) { r -= d2[i]; if (r <= 0) { pick = i; break; } }
  }

  const K = cents.length / 3;
  const c = Float64Array.from(cents);
  const assign = new Int32Array(n).fill(-1);
  let counts = new Array(K).fill(0);
  for (let iter = 0; iter < maxIter; iter++) {
    let changed = 0;
    for (let i = 0; i < n; i++) {
      const a = nearest(points, i * 3, c, K);
      if (a !== assign[i]) { assign[i] = a; changed++; }
    }
    const sums = new Float64Array(K * 3);
    counts = new Array(K).fill(0);
    for (let i = 0; i < n; i++) {
      const a = assign[i];
      counts[a]++;
      sums[a * 3] += points[i * 3]; sums[a * 3 + 1] += points[i * 3 + 1]; sums[a * 3 + 2] += points[i * 3 + 2];
    }
    for (let a = 0; a < K; a++) {
      if (!counts[a]) continue; // keeps its old position; can't happen with ++ seeds on distinct points
      c[a * 3] = sums[a * 3] / counts[a]; c[a * 3 + 1] = sums[a * 3 + 1] / counts[a]; c[a * 3 + 2] = sums[a * 3 + 2] / counts[a];
    }
    if (!changed) break;
  }
  return { centroids: c, counts };
}

// Deterministic default so the same image always gives the same palette.
export function seededRng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clustersOf = ({ centroids, counts }) =>
  counts.map((count, i) => ({ lab: [centroids[i * 3], centroids[i * 3 + 1], centroids[i * 3 + 2]], count }))
    .filter(c => c.count > 0);

// Clusters → [{hex, share, lab}], sorted light to dark. Clusters that round to
// the same hex are merged.
function toPalette(clusters, total) {
  const byHex = new Map();
  for (const { lab, count } of clusters) {
    const hex = linToHex(oklabToLin(...lab));
    const prev = byHex.get(hex);
    if (prev) prev.count += count;
    else byHex.set(hex, { hex, lab, count });
  }
  return [...byHex.values()]
    .map(({ hex, lab, count }) => ({ hex, lab, share: count / total, v: valueOfHex(hex) }))
    .sort((a, b) => b.v - a.v)
    .map(({ hex, lab, share }) => ({ hex, lab, share }));
}

// RGBA bytes → [{hex, share, lab}], sorted light to dark. `share` is the
// fraction of (opaque) pixels closest to that color.
export function extractPalette(rgba, k, rng = seededRng()) {
  const points = toOklab(rgba);
  const total = points.length / 3;
  if (!total) return [];
  return toPalette(clustersOf(kmeans(points, k, rng)), total);
}

// Automatic count: over-segment into AUTO_MAX clusters, then fold away what the
// eye wouldn't keep apart. `detail` (1..10) sets how different two colors must
// be to stay separate.
export const AUTO_MAX = 24;
export const DETAIL_MIN = 1;
export const DETAIL_MAX = 10;
export const DETAIL_DEFAULT = 6;
// Clusters smaller than this share (anti-aliased edges, noise) join their nearest neighbour.
const MIN_SHARE = 0.004;
// OKLab distance under which two colors merge: 0.11 at detail 1 down to 0.029
// at 10. The default (0.065) keeps a cream apart from white (~0.07) but joins
// shades a painter would mix as one (~0.025).
export const mergeDistance = detail => 0.11 - (detail - 1) * 0.009;

const labDist = (a, b) => Math.hypot(a.lab[0] - b.lab[0], a.lab[1] - b.lab[1], a.lab[2] - b.lab[2]);

// Merges clusters [{lab, count}]: first the ones under minShare into their
// nearest neighbour, then the closest pairs while they're nearer than
// threshold. Merged colors are count-weighted means. Returns new objects.
export function mergeClusters(clusters, threshold, minShare = MIN_SHARE) {
  const cs = clusters.filter(c => c.count > 0).map(c => ({ lab: [...c.lab], count: c.count }));
  const total = cs.reduce((sum, c) => sum + c.count, 0);
  // Folds cs[j] into cs[i].
  const join = (i, j) => {
    const a = cs[i], b = cs[j], n = a.count + b.count;
    a.lab = a.lab.map((v, k) => (v * a.count + b.lab[k] * b.count) / n);
    a.count = n;
    cs.splice(j, 1);
  };
  for (;;) {
    if (cs.length < 2) break;
    const j = cs.findIndex(c => c.count / total < minShare);
    if (j < 0) break;
    let i = -1;
    cs.forEach((c, k) => { if (k !== j && (i < 0 || labDist(c, cs[j]) < labDist(cs[i], cs[j]))) i = k; });
    join(i, j);
  }
  for (;;) {
    let bi = -1, bj = -1, bd = threshold;
    for (let i = 0; i < cs.length; i++)
      for (let j = i + 1; j < cs.length; j++) {
        const d = labDist(cs[i], cs[j]);
        if (d < bd) { bd = d; bi = i; bj = j; }
      }
    if (bi < 0) break;
    join(bi, bj);
  }
  return cs;
}

export function extractAuto(rgba, detail, rng = seededRng()) {
  const points = toOklab(rgba);
  const total = points.length / 3;
  if (!total) return [];
  return toPalette(mergeClusters(clustersOf(kmeans(points, AUTO_MAX, rng)), mergeDistance(detail)), total);
}

// The n colors that cover most of the image, back in light-to-dark order.
export function topByShare(colors, n) {
  const keep = new Set([...colors].sort((a, b) => b.share - a.share).slice(0, n));
  return colors.filter(c => keep.has(c));
}

// Repaints RGBA bytes with only the given colors (each pixel → nearest in
// OKLab). Alpha is kept. Returns a new array.
export function posterize(rgba, colors) {
  const k = colors.length;
  const cents = Float64Array.from(colors.flatMap(c => c.lab));
  const rgbs = colors.map(c => [1, 3, 5].map(i => parseInt(c.hex.slice(i, i + 2), 16)));
  const out = new Uint8ClampedArray(rgba.length);
  const cache = new Map();
  const p = new Float64Array(3);
  for (let i = 0; i < rgba.length; i += 4) {
    const key = (rgba[i] << 16) | (rgba[i + 1] << 8) | rgba[i + 2];
    let idx = cache.get(key);
    if (idx === undefined) {
      const lab = labOfBytes(rgba[i], rgba[i + 1], rgba[i + 2]);
      p[0] = lab[0]; p[1] = lab[1]; p[2] = lab[2];
      idx = nearest(p, 0, cents, k);
      cache.set(key, idx);
    }
    const c = rgbs[idx];
    out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2]; out[i + 3] = rgba[i + 3];
  }
  return out;
}
