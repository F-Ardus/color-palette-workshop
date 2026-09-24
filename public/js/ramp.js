// Color ramps between two colors (a light and a shadow). Pure.
//
// Spaces: "oklab" blends perceptually (no muddy grey dip), "oklch" walks round
// the hue wheel keeping chroma, "rgb" is the plain mix most apps do, kept for
// comparison. Options bend the ramp the way painters and pixel artists do:
// even value steps, a hue shift in the middle, more (or less) chroma in the middle.

import { hexToLin, hexToRgb, linToHex, linToOklab, makeColor, maxChroma, oklabToLin, valueOfHex } from './color.js';

export const SPACES = ['oklab', 'oklch', 'rgb'];
export const STEPS_MIN = 3;
export const STEPS_MAX = 15;

const lerp = (a, b, t) => a + (b - a) * t;
const wrap = h => ((h % 360) + 360) % 360;
const delta = (from, to) => ((to - from + 540) % 360) - 180;
// Below this chroma a color has no meaningful hue.
const NEUTRAL = 0.01;

const toLab = hex => linToOklab(hexToLin(hex));
const toLch = ([L, a, b]) => [L, Math.hypot(a, b), wrap((Math.atan2(b, a) * 180) / Math.PI)];
const fromLch = ([L, C, h]) => [L, C * Math.cos((h * Math.PI) / 180), C * Math.sin((h * Math.PI) / 180)];
const labToHex = lab => linToHex(oklabToLin(...lab));

function labAt(A, B, t, space) {
  if (space !== 'oklch') return [0, 1, 2].map(k => lerp(A[k], B[k], t));
  const [La, Ca, ha] = toLch(A), [Lb, Cb, hb] = toLch(B);
  // A grey end takes the other end's hue, so the ramp doesn't swing through random hues.
  const h1 = Ca < NEUTRAL ? hb : ha, h2 = Cb < NEUTRAL ? ha : hb;
  return fromLch([lerp(La, Lb, t), lerp(Ca, Cb, t), wrap(h1 + delta(h1, h2) * t)]);
}

// The plain sRGB mix (what most paint apps do), byte by byte.
export function mixRgb(hexA, hexB, t) {
  const a = hexToRgb(hexA), b = hexToRgb(hexB);
  return '#' + a.map((v, k) => Math.round(lerp(v, b[k], t)).toString(16).padStart(2, '0')).join('').toUpperCase();
}

// Where along the blend (0..1) a color has the wanted value. Value grows or
// shrinks steadily along these blends, so a bisection finds it.
function tForValue(colorAt, target, vA, vB) {
  let lo = 0, hi = 1;
  const rising = vB > vA;
  for (let i = 0; i < 32; i++) {
    const mid = (lo + hi) / 2;
    if ((valueOfHex(colorAt(mid)) < target) === rising) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// steps colors from `fromHex` to `toHex`, both included exactly.
// opts: {space, evenValues, hueShift (degrees), midChroma (-1..1)}
export function ramp(fromHex, toHex, steps, { space = 'oklab', evenValues = false, hueShift = 0, midChroma = 0 } = {}) {
  const n = Math.max(2, steps);
  const A = toLab(fromHex), B = toLab(toHex);
  const colorAt = space === 'rgb' ? t => mixRgb(fromHex, toHex, t) : t => labToHex(labAt(A, B, t, space));
  const vA = valueOfHex(fromHex), vB = valueOfHex(toHex);
  const bend = space !== 'rgb' && (hueShift !== 0 || midChroma !== 0);

  return Array.from({ length: n }, (_, i) => {
    if (i === 0) return fromHex.toUpperCase();
    if (i === n - 1) return toHex.toUpperCase();
    const even = i / (n - 1);
    const targetValue = lerp(vA, vB, even);
    const t = evenValues && Math.abs(vB - vA) > 0.05 ? tForValue(colorAt, targetValue, vA, vB) : even;
    if (!bend) return colorAt(t);

    // Bend in the middle (sin is 0 at the ends, 1 halfway), then land back on
    // the value this step had before bending.
    const [L, C, h] = toLch(labAt(A, B, t, space));
    const w = Math.sin(Math.PI * t);
    const hue = wrap(h + hueShift * w);
    const chroma = Math.max(0, C * (1 + midChroma * w));
    const max = maxChroma(L, hue);
    const value = evenValues ? targetValue : valueOfHex(colorAt(t));
    return makeColor(value, hue, max > 0 ? Math.min(1, chroma / max) : 0);
  });
}

// Chroma of a hex color in OKLCH, for comparing how vivid ramps stay.
export const chromaOf = hex => toLch(toLab(hex))[1];
