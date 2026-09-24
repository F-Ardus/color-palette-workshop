// Value check: an image reduced to a few values (a notan). Pure functions on
// RGBA bytes and value maps (one value per pixel, 0..10 like the rest of the app).

import { greyHex, lstarFromY } from './color.js';

export const LEVELS_MIN = 2;
export const LEVELS_MAX = 5;
const THRESHOLD_STEP = 0.1;

// Value of each 8-bit channel level, linearized once.
const LIN = Float64Array.from({ length: 256 }, (_, i) => {
  const v = i / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
});

// RGBA bytes → Float32Array of values (CIE L* / 10). Transparent pixels count as white paper.
export function valueMap(rgba) {
  const n = rgba.length / 4;
  const out = new Float32Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const a = rgba[p + 3] / 255;
    const y = 0.2126 * LIN[rgba[p]] + 0.7152 * LIN[rgba[p + 1]] + 0.0722 * LIN[rgba[p + 2]];
    out[i] = lstarFromY(y * a + (1 - a)) / 10;
  }
  return out;
}

// One horizontal + vertical box blur with a running sum; three passes are a
// close stand-in for a gaussian. Edges repeat the border pixel.
function boxPass(src, w, h, r, horizontal) {
  const out = new Float32Array(src.length);
  const len = horizontal ? w : h, lines = horizontal ? h : w;
  const at = (line, k) => (horizontal ? line * w + k : k * w + line);
  const size = 2 * r + 1;
  for (let line = 0; line < lines; line++) {
    let sum = 0;
    for (let k = -r; k <= r; k++) sum += src[at(line, Math.min(len - 1, Math.max(0, k)))];
    for (let k = 0; k < len; k++) {
      out[at(line, k)] = sum / size;
      sum += src[at(line, Math.min(len - 1, k + r + 1))] - src[at(line, Math.max(0, k - r))];
    }
  }
  return out;
}

// "Squinting": blurs the value map so small details melt into their masses.
export function blurValues(values, w, h, radius, passes = 3) {
  const r = Math.round(radius);
  if (r < 1) return values;
  let out = values;
  for (let p = 0; p < passes; p++) out = boxPass(boxPass(out, w, h, r, true), w, h, r, false);
  return out;
}

const round = v => Math.round(v / THRESHOLD_STEP) * THRESHOLD_STEP;

// Thresholds are ascending, levels - 1 of them, between 0 and 10.
export const evenThresholds = levels =>
  Array.from({ length: levels - 1 }, (_, i) => round((10 * (i + 1)) / levels));

// Thresholds that split the image into bands of equal area.
export function balancedThresholds(values, levels) {
  const sample = [];
  const step = Math.max(1, Math.floor(values.length / 20000));
  for (let i = 0; i < values.length; i += step) sample.push(values[i]);
  sample.sort((a, b) => a - b);
  const out = [];
  for (let i = 1; i < levels; i++) {
    let t = round(sample[Math.min(sample.length - 1, Math.floor((sample.length * i) / levels))]);
    // Keep them strictly ascending even on flat images.
    if (out.length && t <= out.at(-1)) t = round(out.at(-1) + THRESHOLD_STEP);
    out.push(Math.min(10, t));
  }
  return out;
}

// Moves one threshold and pushes its neighbours so the order holds.
export function setThreshold(thresholds, index, value, gap = 0.2) {
  const out = [...thresholds];
  const n = out.length;
  out[index] = round(Math.min(10 - gap * (n - 1 - index), Math.max(gap * index, value)));
  for (let i = index + 1; i < n; i++) out[i] = round(Math.max(out[i], out[i - 1] + gap));
  for (let i = index - 1; i >= 0; i--) out[i] = round(Math.min(out[i], out[i + 1] - gap));
  return out;
}

// Band of a value: 0 is the lightest. thresholds ascending.
export function bandOf(v, thresholds) {
  let band = 0;
  for (let i = thresholds.length - 1; i >= 0 && v < thresholds[i]; i--) band++;
  return band;
}

// Grey value shown for each band, lightest first: from paper white to near black.
export const bandTones = levels =>
  Array.from({ length: levels }, (_, i) => 9.6 - (i * 8.8) / (levels - 1));

// Value map → RGBA bytes, each pixel painted with its band's grey.
export function notan(values, thresholds, tones = bandTones(thresholds.length + 1)) {
  const greys = tones.map(v => parseInt(greyHex(v).slice(1, 3), 16));
  const out = new Uint8ClampedArray(values.length * 4);
  for (let i = 0, p = 0; i < values.length; i++, p += 4) {
    const g = greys[bandOf(values[i], thresholds)];
    out[p] = out[p + 1] = out[p + 2] = g;
    out[p + 3] = 255;
  }
  return out;
}

// Continuous greys (no bands), for comparison.
export function greys(values) {
  const out = new Uint8ClampedArray(values.length * 4);
  for (let i = 0, p = 0; i < values.length; i++, p += 4) {
    const g = parseInt(greyHex(values[i]).slice(1, 3), 16);
    out[p] = out[p + 1] = out[p + 2] = g;
    out[p + 3] = 255;
  }
  return out;
}

// Fraction of the image in each band, lightest first.
export function bandShares(values, thresholds) {
  const counts = new Array(thresholds.length + 1).fill(0);
  for (const v of values) counts[bandOf(v, thresholds)]++;
  return counts.map(c => (values.length ? c / values.length : 0));
}

// Counts of values in `bins` equal slices of 0..10 (bin 0 is the darkest).
export function histogram(values, bins = 50) {
  const out = new Array(bins).fill(0);
  for (const v of values) out[Math.min(bins - 1, Math.max(0, Math.floor((v / 10) * bins)))]++;
  return out;
}
