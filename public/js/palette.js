// Palette generation: target values, hue harmonies, temperature bias and locks.
// Pure functions; randomness comes in through `rng` so tests can seed it.

import { makeColor, valueOfHex } from './color.js';

export const DISTRIBUTIONS = ['linear', 'dark', 'light'];
export const HARMONIES = ['random', 'analogous', 'complementary', 'split', 'triad', 'mono'];
export const TEMPERATURES = ['none', 'warmLight', 'coolLight'];

// Two values closer than this are hard to tell apart in a drawing.
export const GAP_WARN = 0.9;

const KEY_CURVE = 0.62;
const wrap = h => ((h % 360) + 360) % 360;
const clamp01 = v => Math.min(1, Math.max(0, v));
const between = (rng, a, b) => a + rng() * (b - a);

// Target values from lightest (hi) to darkest (lo). Low key packs more steps
// into the shadows; high key is its exact mirror and packs them into the lights.
export function targetValues(n, hi, lo, dist) {
  return Array.from({ length: n }, (_, i) => {
    let t = n === 1 ? 0 : i / (n - 1);
    if (dist === 'dark') t = Math.pow(t, KEY_CURVE);
    if (dist === 'light') t = 1 - Math.pow(1 - t, KEY_CURVE);
    return hi + (lo - hi) * t;
  });
}

export function hues(n, mode, base, rng = Math.random) {
  return Array.from({ length: n }, (_, i) => {
    const t = n === 1 ? 0 : i / (n - 1);
    let h;
    switch (mode) {
      case 'analogous': h = base + (t - 0.5) * 70 + between(rng, -6, 6); break;
      case 'complementary': h = (t < 0.5 ? base : base + 180) + between(rng, -14, 14); break;
      case 'split': h = base + [0, 150, 210][i % 3] + between(rng, -8, 8); break;
      case 'triad': h = base + [0, 120, 240][i % 3] + between(rng, -8, 8); break;
      case 'mono': h = base + between(rng, -6, 6); break;
      default: h = between(rng, 0, 360);
    }
    return wrap(h);
  });
}

// Hue ramps for the temperature bias, from the lightest step to the darkest,
// as [start, signed sweep]. The sweep is explicit (through reds and magentas):
// both ramps span ~180°, so "the shortest way round" would flip direction on
// a tiny tweak.
const RAMPS = { warmLight: [75, -170], coolLight: [230, 160] };
const PULL = 0.65;
// With a harmony picked, hues only drift toward the ramp so the harmony survives
// (a monochrome palette stays one hue, just warmer in the lights).
const MAX_DRIFT = 35;

export function applyTemperature(hs, temp, harmony) {
  const ramp = RAMPS[temp];
  if (!ramp) return hs;
  const n = hs.length;
  return hs.map((h, i) => {
    const t = n === 1 ? 0 : i / (n - 1);
    const d = ((ramp[0] + ramp[1] * t - h + 540) % 360) - 180;
    const shift = d * PULL;
    return wrap(h + (harmony === 'random' ? shift : Math.max(-MAX_DRIFT, Math.min(MAX_DRIFT, shift))));
  });
}

// settings: {count, vHi, vLo, dist, harmony, temp, sat (0-100), jit (0-100), mute}
// previous: the current palette {colors, locked}; its locked colors are kept.
// Returns {colors, locked, dropped}, always sorted from lightest to darkest.
export function generatePalette(settings, previous = { colors: [], locked: [] }, rng = Math.random) {
  const { count: n, vHi, vLo, dist, harmony, temp, mute } = settings;
  const sat = settings.sat / 100, jit = settings.jit / 100;
  const targets = targetValues(n, vHi, vLo, dist);
  const hs = applyTemperature(hues(n, harmony, between(rng, 0, 360), rng), temp, harmony);

  // Each locked color takes the free slot whose target is closest to its own
  // value, so locks survive changes to the count or the value range.
  const slots = new Array(n).fill(null);
  const kept = previous.colors
    .filter((_, i) => previous.locked[i])
    .map(hex => ({ hex, v: valueOfHex(hex) }))
    .sort((a, b) => b.v - a.v);
  let dropped = 0;
  for (const c of kept) {
    let best = -1;
    for (let i = 0; i < n; i++) {
      if (slots[i]) continue;
      if (best < 0 || Math.abs(targets[i] - c.v) < Math.abs(targets[best] - c.v)) best = i;
    }
    if (best < 0) dropped++;
    else slots[best] = { hex: c.hex, locked: true };
  }

  for (let i = 0; i < n; i++) {
    if (slots[i]) continue;
    let sf = clamp01(sat + between(rng, -jit, jit) * 0.6);
    if (mute && (i === 0 || i === n - 1)) sf *= 0.45;
    slots[i] = { hex: makeColor(targets[i], hs[i], sf), locked: false };
  }

  // A locked color can sit off its slot's target; sorting keeps the scale in order.
  const sorted = slots.map(s => ({ ...s, v: valueOfHex(s.hex) })).sort((a, b) => b.v - a.v);
  return { colors: sorted.map(s => s.hex), locked: sorted.map(s => s.locked), dropped };
}

// Smallest distance between any two values, adjacent or not.
export function minGap(values) {
  const vs = [...values].sort((a, b) => b - a);
  let gap = Infinity;
  for (let i = 1; i < vs.length; i++) gap = Math.min(gap, vs[i - 1] - vs[i]);
  return gap;
}

// The extremes are always the highlight and the deepest dark; the steps in
// between are named by their actual value, so low and high key read right.
export function roleFor(i, n, value) {
  if (i === 0) return 'Luz alta';
  if (i === n - 1) return 'Oscuro profundo';
  if (value >= 7.5) return 'Luz';
  if (value >= 5.75) return 'Medio claro';
  if (value >= 4.25) return 'Medio';
  if (value >= 2.5) return 'Medio oscuro';
  return 'Sombra';
}
