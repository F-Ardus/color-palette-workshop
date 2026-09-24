// "Chequeo de values": an image reduced to 2–5 values, optionally blurred
// ("squinting") first, with adjustable boundaries and the image's value
// histogram. Nothing leaves the browser.

import { t } from './i18n.js';
import { greyHex } from './color.js';
import {
  balancedThresholds, bandShares, bandTones, blurValues, evenThresholds, greys, histogram,
  LEVELS_MAX, LEVELS_MIN, notan, setThreshold, valueMap,
} from './notan.js';
import { pixels, setupImageInput } from './image-input.js';
import { download } from './export.js';
import { announce, el, toast } from './ui.js';

const $ = id => document.getElementById(id);
// Longest side of the working copy: enough to judge masses, fast to redraw.
const WORK_MAX = 900;
// Squint 10 blurs by this fraction of the image's longest side.
const SQUINT_SPAN = 0.04;
const PREFS_KEY = 'pk-values';
const DEFAULT_LEVELS = 3;

let image = null;   // {width, height, values} of the working copy
let blurred = null; // values after squinting
let levels = DEFAULT_LEVELS;
let thresholds = evenThresholds(DEFAULT_LEVELS);

/* ---------- prefs (per viewer, best effort) ---------- */
function loadPrefs() {
  let p = {};
  try { p = JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch { /* defaults */ }
  if (Number.isInteger(p.levels) && p.levels >= LEVELS_MIN && p.levels <= LEVELS_MAX) levels = p.levels;
  const valid = Array.isArray(p.thresholds) && p.thresholds.length === levels - 1 &&
    p.thresholds.every((v, i, a) => typeof v === 'number' && v >= 0 && v <= 10 && (!i || v > a[i - 1]));
  thresholds = valid ? p.thresholds : evenThresholds(levels);
  if (Number.isInteger(p.squint) && p.squint >= 0 && p.squint <= 10) $('squint').value = p.squint;
  $('origGrey').checked = p.origGrey === true;
}
function savePrefs() {
  const p = { levels, thresholds, squint: +$('squint').value, origGrey: $('origGrey').checked };
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* not saved */ }
}

/* ---------- controls ---------- */
function buildLevels() {
  $('levels').replaceChildren(...Array.from({ length: LEVELS_MAX - LEVELS_MIN + 1 }, (_, i) => {
    const n = LEVELS_MIN + i;
    const label = el('label', 'seg');
    const input = el('input');
    Object.assign(input, { type: 'radio', name: 'levels', value: n, checked: n === levels });
    input.addEventListener('change', () => setLevels(n));
    label.append(input, el('span', null, String(n)));
    return label;
  }));
}

// One slider per boundary, lightest boundary first (same order as the bands).
function buildThresholds() {
  const order = thresholds.map((_, i) => i).reverse();
  $('thresholds').replaceChildren(...order.map((ti, k) => {
    const row = el('div', 'threshold');
    const id = `th${ti}`;
    const label = el('label');
    label.htmlFor = id;
    const out = el('output');
    out.id = id + 'Out';
    label.append(el('span', null, t('values.threshold', { n: k + 1 })), ' ', out);
    const input = el('input');
    Object.assign(input, { id, type: 'range', min: 0, max: 10, step: 0.1 });
    input.addEventListener('input', () => {
      thresholds = setThreshold(thresholds, ti, +input.value);
      syncThresholds();
      renderResult();
    });
    input.addEventListener('change', savePrefs);
    row.append(label, input);
    return row;
  }));
  syncThresholds();
}

// Sliders and their numbers follow `thresholds` (neighbours get pushed).
function syncThresholds() {
  thresholds.forEach((v, i) => {
    const input = $(`th${i}`);
    if (input && +input.value !== v) input.value = v;
    const out = $(`th${i}Out`);
    if (out) out.textContent = v.toFixed(1);
  });
}

function setLevels(n) {
  levels = n;
  thresholds = evenThresholds(n);
  buildThresholds();
  renderResult();
  savePrefs();
}

/* ---------- image ---------- */
function squintRadius() {
  return image ? (+$('squint').value * SQUINT_SPAN * Math.max(image.width, image.height)) / 10 : 0;
}

function onImage(img) {
  const data = pixels(img, WORK_MAX);
  image = { width: data.width, height: data.height, values: valueMap(data.data) };
  blurred = blurValues(image.values, image.width, image.height, squintRadius());
  $('origGreyToggle').hidden = false;
  $('balanceBtn').disabled = false;
  $('downloadImg').disabled = false;
  drawOriginalGrey();
  renderResult();
}

function drawToCanvas(canvas, bytes) {
  canvas.width = image.width;
  canvas.height = image.height;
  canvas.getContext('2d').putImageData(new ImageData(bytes, image.width, image.height), 0, 0);
}

// The left card can show the original in continuous greys, for comparison.
function drawOriginalGrey() {
  const on = !!image && $('origGrey').checked;
  $('greyView').hidden = !on;
  $('preview').hidden = !image || on;
  if (on) drawToCanvas($('greyView'), greys(image.values));
}

/* ---------- result ---------- */
function renderResult() {
  drawHistogram();
  renderBands();
  const cv = $('notan');
  if (!image) { cv.hidden = true; $('notanEmpty').hidden = false; return; }
  drawToCanvas(cv, notan(blurred, thresholds));
  cv.hidden = false;
  $('notanEmpty').hidden = true;
}

function renderBands() {
  const tones = bandTones(levels);
  const shares = image ? bandShares(blurred, thresholds) : null;
  // Band i spans from thresholds[levels - 1 - i] (or 0) up to the next one (or 10).
  const edges = [0, ...thresholds, 10];
  $('bands').replaceChildren(...tones.map((tone, i) => {
    const lo = edges[levels - 1 - i], hi = edges[levels - i];
    const li = el('li');
    const chip = el('span', 'band-chip');
    chip.style.background = greyHex(tone);
    li.append(chip, el('span', 'band-range', t('values.bandRange', { from: lo.toFixed(1), to: hi.toFixed(1) })));
    if (shares) li.append(el('span', 'band-share', t('common.shareOf', { pct: `${Math.round(shares[i] * 100)}%` })));
    return li;
  }));
}

const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// Bars from dark (left) to light (right), each in its own grey; boundaries on
// top. Heights on a square-root scale so a big background doesn't flatten the rest.
function drawHistogram() {
  const cv = $('hist'), ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height, bins = 50;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = cssVar('--bg');
  ctx.fillRect(0, 0, W, H);
  if (blurred) {
    const counts = histogram(blurred, bins);
    const max = Math.max(...counts, 1);
    const bw = W / bins;
    counts.forEach((c, i) => {
      const h = Math.round(Math.sqrt(c / max) * (H - 8));
      if (!h) return;
      const x = Math.floor(i * bw), w = Math.ceil(bw);
      ctx.fillStyle = greyHex(((i + 0.5) / bins) * 10);
      ctx.fillRect(x, H - h, w, h);
      // A thin edge so light bars still show on a light background.
      ctx.strokeStyle = cssVar('--muted');
      ctx.globalAlpha = 0.5;
      ctx.strokeRect(x + 0.5, H - h + 0.5, w - 1, h - 1);
      ctx.globalAlpha = 1;
    });
  }
  ctx.strokeStyle = cssVar('--line');
  ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
  ctx.fillStyle = cssVar('--accent');
  thresholds.forEach(v => ctx.fillRect(Math.round((v / 10) * W) - 1, 0, 3, H));
}

/* ---------- events ---------- */
setupImageInput(onImage);

$('squint').addEventListener('input', () => { $('squintOut').textContent = $('squint').value; });
$('squint').addEventListener('change', () => {
  if (image) blurred = blurValues(image.values, image.width, image.height, squintRadius());
  renderResult();
  savePrefs();
});
$('origGrey').addEventListener('change', () => { drawOriginalGrey(); savePrefs(); });
$('evenBtn').addEventListener('click', () => {
  thresholds = evenThresholds(levels);
  syncThresholds(); renderResult(); savePrefs();
});
$('balanceBtn').addEventListener('click', () => {
  if (!blurred) return;
  thresholds = balancedThresholds(blurred, levels);
  syncThresholds(); renderResult(); savePrefs();
  announce(t('values.balanced'));
});
$('downloadImg').addEventListener('click', () => {
  $('notan').toBlob(b => {
    if (!b) { toast(t('common.imageFailed')); return; }
    download(b, 'palettekit-values.png', 'image/png');
    toast(t('common.imageDownloaded'));
  }, 'image/png');
});
// Colors of the histogram follow the theme.
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', drawHistogram);

/* ---------- start ---------- */
loadPrefs();
$('squintOut').textContent = $('squint').value;
buildLevels();
buildThresholds();
renderResult();
