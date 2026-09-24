// Color math: OKLab/OKLCH <-> linear sRGB, CIE L*, and the "value" scale used
// everywhere in the app (value = L* / 10, from 0 to 10, like Munsell).

export function oklabToLin(L, a, b) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
}

export function linToOklab([r, g, b]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
}

export function lchToLin(L, C, h) {
  const r = h * Math.PI / 180;
  return oklabToLin(L, C * Math.cos(r), C * Math.sin(r));
}

const inGamut = c => c.every(v => v >= -0.0001 && v <= 1.0001);

// Largest OKLCH chroma that stays inside sRGB for this lightness and hue.
export function maxChroma(L, h) {
  let lo = 0, hi = 0.4;
  for (let i = 0; i < 18; i++) {
    const m = (lo + hi) / 2;
    if (inGamut(lchToLin(L, m, h))) lo = m; else hi = m;
  }
  return lo;
}

export const luminance = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
export const lstarFromY = Y => Y > 0.008856 ? 116 * Math.cbrt(Y) - 16 : 903.3 * Y;
export const yFromLstar = L => L > 8 ? Math.pow((L + 16) / 116, 3) : L / 903.3;

const encode = v => {
  v = Math.min(1, Math.max(0, v));
  return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
};
const decode = v => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
const byteHex = v => Math.round(encode(v) * 255).toString(16).padStart(2, '0');

export const isHex = h => typeof h === 'string' && /^#[0-9A-F]{6}$/i.test(h);
export const hexToRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
export const hexToLin = h => hexToRgb(h).map(v => decode(v / 255));
export const linToHex = c => ('#' + c.map(byteHex).join('')).toUpperCase();

export const valueOfHex = h => lstarFromY(luminance(hexToLin(h))) / 10;

// OKLCH hue (degrees) and saturation as makeColor understands it: chroma as a
// fraction of the widest in-gamut chroma at that lightness and hue.
export function hueOfHex(h) {
  const [, a, b] = linToOklab(hexToLin(h));
  return ((Math.atan2(b, a) * 180 / Math.PI) + 360) % 360;
}
export function satOfHex(h) {
  const [L, a, b] = linToOklab(hexToLin(h));
  const max = maxChroma(L, hueOfHex(h));
  return max > 1e-4 ? Math.min(1, Math.hypot(a, b) / max) : 0;
}

export function greyHex(value) {
  const g = byteHex(yFromLstar(value * 10));
  return ('#' + g + g + g).toUpperCase();
}

// Builds a color that lands on an exact value. Chroma is a fraction of the
// widest in-gamut chroma at that lightness, so "saturation" means the same
// thing at every step of the scale.
export function makeColor(value, hue, satFrac) {
  const Yt = Math.max(1e-5, yFromLstar(value * 10));
  let L = Math.cbrt(Yt);
  for (let i = 0; i < 6; i++) {
    const C = maxChroma(L, hue) * satFrac;
    const c = lchToLin(L, C, hue).map(v => Math.min(1, Math.max(0, v)));
    const Y = Math.max(1e-6, luminance(c));
    L = Math.min(0.999, Math.max(0.001, L * Math.cbrt(Yt / Y)));
  }
  return linToHex(lchToLin(L, maxChroma(L, hue) * satFrac, hue));
}

// WCAG contrast ratio between two colors.
export function contrast(hexA, hexB) {
  const a = luminance(hexToLin(hexA)) + 0.05, b = luminance(hexToLin(hexB)) + 0.05;
  return Math.max(a, b) / Math.min(a, b);
}

export const TEXT_DARK = '#15171B';
export const TEXT_LIGHT = '#F4F5F7';

// Whichever text color reads better on this background.
export const textOn = hex => contrast(hex, TEXT_DARK) >= contrast(hex, TEXT_LIGHT) ? TEXT_DARK : TEXT_LIGHT;
