// "Light study": a sphere lit from the upper left, posterized with the palette.

import { greyHex, hexToRgb, valueOfHex } from './color.js';

// Palette index (0 = lightest) for a brightness in [0, 1]: each color gets an
// equal slice of the brightness range. Snapping to the nearest value instead
// was tried and loses the core shadow against the background.
export const bandIndex = (b, n) => Math.min(n - 1, Math.max(0, Math.floor((1 - Math.min(1, b)) * n)));

export function drawSphere(canvas, colors, { grey = false } = {}) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height, img = ctx.createImageData(W, H);
  // Light to dark regardless of how the cards are arranged: band 0 is the highlight.
  const byValue = colors.map(h => ({ h, v: valueOfHex(h) })).sort((x, y) => y.v - x.v);
  const rgb = byValue.map(({ h, v }) => hexToRgb(grey ? greyHex(v) : h));
  const bandOf = b => rgb[bandIndex(b, rgb.length)];

  const cx = W * 0.46, cy = H * 0.47, R = H * 0.3, groundY = cy + R * 0.62;
  let lx = -0.55, ly = -0.6, lz = 0.58;
  const ll = Math.hypot(lx, ly, lz); lx /= ll; ly /= ll; lz /= ll;
  const shX = cx + R * 0.62, shY = cy + R * 0.98, shRx = R * 1.25, shRy = R * 0.24;

  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let b;
    const dx = (x - cx) / R, dy = (y - cy) / R, r2 = dx * dx + dy * dy;
    if (r2 <= 1) {
      const nz = Math.sqrt(1 - r2);
      const lam = Math.max(0, dx * lx + dy * ly + nz * lz);
      const rz = 2 * lam * nz - lz, spec = Math.pow(Math.max(0, rz), 30);
      // reflected light from the ground along the lower-right rim
      const rim = lam < 0.08 ? Math.max(0, dy) * Math.pow(1 - nz, 0.7) * 0.3 : 0;
      b = 0.05 + 0.9 * lam + rim + spec * 0.5;
    } else if (y > groundY) {
      const ex = (x - shX) / shRx, ey = (y - shY) / shRy;
      const d = Math.hypot((x - (cx - R * 0.9)) / W, (y - groundY) / H * 1.6);
      b = (ex * ex + ey * ey < 1 && x > cx - R * 0.8) ? 0.02 : 0.62 - 0.5 * Math.min(1, d * 1.4);
    } else {
      const d = Math.hypot(x / W, y / H * 0.8);
      b = 0.34 - 0.24 * Math.min(1, d);
    }
    const c = bandOf(b), o = (y * W + x) * 4;
    img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}
