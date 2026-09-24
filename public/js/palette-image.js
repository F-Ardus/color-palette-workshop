// The shareable palette image: one cell per color with its hex and value, and
// a footer with the site. Layout is pure (testable); drawing needs a canvas.

import { textOn, valueOfHex } from './color.js';

export const IMAGE_W = 1200;
export const IMAGE_H = 630; // the usual link-preview size
const FOOTER_H = 64;
const PER_ROW = 8;

// Cells as {x, y, w, h}: up to PER_ROW per row, rows spread evenly, each row's
// cells stretched to the full width so no row has a gap.
export function imageLayout(n, W = IMAGE_W, H = IMAGE_H - FOOTER_H) {
  if (!n) return [];
  const rows = Math.ceil(n / PER_ROW);
  const perRow = Math.ceil(n / rows);
  const cells = [];
  for (let r = 0; r < rows; r++) {
    const inRow = Math.min(perRow, n - r * perRow);
    const y0 = Math.round(r * H / rows), y1 = Math.round((r + 1) * H / rows);
    for (let c = 0; c < inRow; c++) {
      const x0 = Math.round(c * W / inRow), x1 = Math.round((c + 1) * W / inRow);
      cells.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    }
  }
  return cells;
}

const FONT_MONO = '"IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace';
const FONT_BODY = '"Instrument Sans", system-ui, "Segoe UI", sans-serif';
const FONT_DISPLAY = '"Bricolage Grotesque", "Helvetica Neue", Arial, sans-serif';

// Draws the palette on a canvas sized IMAGE_W × IMAGE_H. `logo` is an optional
// loaded <img>. Fonts should be loaded first (see ensureFonts).
export function drawPaletteImage(canvas, colors, { logo = null, site = 'palettekit.fardus.dev' } = {}) {
  canvas.width = IMAGE_W;
  canvas.height = IMAGE_H;
  const ctx = canvas.getContext('2d');
  const bodyH = IMAGE_H - FOOTER_H;

  ctx.fillStyle = '#F7F7F8';
  ctx.fillRect(0, 0, IMAGE_W, IMAGE_H);

  const cells = imageLayout(colors.length, IMAGE_W, bodyH);
  colors.forEach((hex, i) => {
    const { x, y, w, h } = cells[i];
    ctx.fillStyle = hex;
    ctx.fillRect(x, y, w, h);
    // Text scales with the cell so 2 colors and 24 both read well.
    const size = Math.max(13, Math.min(26, Math.floor(w / 7.5), Math.floor(h / 7)));
    const pad = Math.max(10, Math.round(size * 0.7));
    ctx.fillStyle = textOn(hex);
    ctx.textBaseline = 'alphabetic';
    ctx.font = `500 ${size}px ${FONT_MONO}`;
    ctx.fillText(hex, x + pad, y + h - pad);
    ctx.globalAlpha = 0.8;
    ctx.font = `500 ${Math.round(size * 0.72)}px ${FONT_BODY}`;
    ctx.fillText(`Value ${valueOfHex(hex).toFixed(1)}`, x + pad, y + h - pad - size * 1.25);
    ctx.globalAlpha = 1;
  });

  // Footer: logo + name on the left, the site on the right.
  const fy = bodyH, mid = fy + FOOTER_H / 2;
  ctx.fillStyle = '#F7F7F8';
  ctx.fillRect(0, fy, IMAGE_W, FOOTER_H);
  let tx = 24;
  if (logo) {
    const lh = 34, lw = lh * (logo.naturalWidth / logo.naturalHeight || 1);
    ctx.drawImage(logo, tx, mid - lh / 2, lw, lh);
    tx += lw + 12;
  }
  ctx.fillStyle = '#1B1D22';
  ctx.textBaseline = 'middle';
  ctx.font = `700 24px ${FONT_DISPLAY}`;
  ctx.fillText('Palettekit', tx, mid + 1);
  ctx.fillStyle = '#5F636D';
  ctx.font = `500 17px ${FONT_BODY}`;
  const siteW = ctx.measureText(site).width;
  ctx.fillText(site, IMAGE_W - 24 - siteW, mid + 1);
}

// Canvas text only uses web fonts that are already loaded.
export async function ensureFonts() {
  if (!document.fonts) return;
  await Promise.all([
    document.fonts.load(`500 20px ${FONT_MONO}`),
    document.fonts.load(`500 20px ${FONT_BODY}`),
    document.fonts.load(`700 24px ${FONT_DISPLAY}`),
  ]).catch(() => {});
}
