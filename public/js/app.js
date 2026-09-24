// DOM wiring: reads the settings, keeps the current palette and history, renders.

import { greyHex, textOn, valueOfHex } from './color.js';
import { GAP_WARN, generatePalette, minGap, roleFor } from './palette.js';
import { addToHistory, load, removeFromHistory, saveHistory, saveSettings } from './storage.js';
import { drawSphere } from './sphere.js';
import { buildAco, download, makeZip, palettePng } from './export.js';

const $ = id => document.getElementById(id);
const els = {
  count: $('count'), vHi: $('vHi'), vLo: $('vLo'), dist: $('dist'), harmony: $('harmony'),
  temp: $('temp'), sat: $('sat'), jit: $('jit'), mute: $('mute'), bw: $('bw'),
};
const NUMERIC = ['count', 'vHi', 'vLo', 'sat', 'jit'];
const SELECTS = ['dist', 'harmony', 'temp'];
const CHECKS = ['mute', 'bw'];
const outs = { count: v => v, vHi: v => v, vLo: v => v, sat: v => v + '%', jit: v => v + '%' };

// Shown on a first visit, before anything has been generated.
const FIRST_PALETTE = ['#F2E3B3', '#D98E73', '#4F7A6B', '#6B3A5A', '#1E1B3A'];

let palette = { colors: [], locked: [] };
let history = [];

function readSettings() {
  const s = {};
  NUMERIC.forEach(k => { s[k] = +els[k].value; });
  SELECTS.forEach(k => { s[k] = els[k].value; });
  CHECKS.forEach(k => { s[k] = els[k].checked; });
  return s;
}
function writeSettings(s) {
  [...NUMERIC, ...SELECTS].forEach(k => { els[k].value = s[k]; });
  CHECKS.forEach(k => { els[k].checked = s[k]; });
  updateOutputs();
}
function updateOutputs() {
  Object.keys(outs).forEach(k => { $(k + 'Out').textContent = outs[k](els[k].value); });
}
const persist = () => saveSettings(readSettings(), palette);

function setPalette(next) {
  palette = { colors: next.colors, locked: next.locked };
  els.count.value = palette.colors.length;
  updateOutputs();
  render();
  persist();
}

function generate() {
  const { colors, locked, dropped } = generatePalette(readSettings(), palette);
  if (palette.colors.length) { history = addToHistory(history, palette.colors); saveHistory(history); }
  setPalette({ colors, locked });
  announce();
  if (dropped) toast(dropped === 1 ? 'Se soltó un color fijado: no entraba en la escala' : `Se soltaron ${dropped} colores fijados: no entraban en la escala`);
}

function restore(cols) {
  history = removeFromHistory(addToHistory(history, palette.colors), cols);
  saveHistory(history);
  setPalette({ colors: cols.slice(), locked: cols.map(() => false) });
  announce();
}

/* ---------- render ---------- */
function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text != null) e.textContent = text;
  return e;
}
function button(className, text) {
  const b = el('button', className, text);
  b.type = 'button';
  return b;
}
function setLock(btn, on) {
  btn.setAttribute('aria-pressed', String(on));
  btn.textContent = on ? 'Fijado' : 'Fijar';
}

function render() {
  renderSwatches();
  renderGrey();
  drawSphere($('sphere'), palette.colors, { grey: els.bw.checked });
  renderHistory();
}

function renderSwatches() {
  const n = palette.colors.length;
  $('swatches').replaceChildren(...palette.colors.map((hex, i) => {
    const v = valueOfHex(hex);
    const sw = el('div', 'sw');
    sw.style.background = hex;
    sw.style.color = textOn(hex);

    const top = el('div');
    top.append(el('div', 'vlab', 'Value'), el('div', 'v', v.toFixed(1)));

    const hexBtn = button('hex', hex);
    hexBtn.title = 'Copiar';
    hexBtn.addEventListener('click', () => copy(hex, `${hex} copiado`));

    // Toggled in place: re-rendering would drop keyboard focus.
    const lock = button('lock');
    lock.setAttribute('aria-label', `Fijar ${hex}`);
    setLock(lock, palette.locked[i]);
    lock.addEventListener('click', () => {
      palette.locked[i] = !palette.locked[i];
      setLock(lock, palette.locked[i]);
      persist();
    });

    const bottom = el('div', 'bottom');
    bottom.append(el('span', 'role', roleFor(i, n, v)), hexBtn, lock);
    sw.append(top, bottom);
    return sw;
  }));
}

function renderGrey() {
  const vs = palette.colors.map(valueOfHex);
  $('grey').replaceChildren(...vs.map(v => {
    const s = el('span');
    s.style.background = greyHex(v);
    return s;
  }));
  const gap = minGap(vs), info = $('gapInfo');
  if (gap < GAP_WARN) info.replaceChildren(el('strong', null, 'Ojo:'), ` dos values están a ${gap.toFixed(1)} de distancia, pueden confundirse.`);
  else info.textContent = `Salto mínimo entre values: ${gap.toFixed(1)}`;
}

function renderHistory() {
  const h = $('hist');
  if (!history.length) {
    h.replaceChildren(el('span', 'empty', 'Las paletas que generes van a aparecer acá. Tocá una para recuperarla.'));
    return;
  }
  h.replaceChildren(...history.map(cols => {
    const b = button();
    b.setAttribute('aria-label', 'Recuperar paleta ' + cols.join(' '));
    cols.forEach(c => { const s = el('span'); s.style.background = c; b.appendChild(s); });
    b.addEventListener('click', () => restore(cols));
    return b;
  }));
}

/* ---------- feedback ---------- */
let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
}
// Screen readers hear a short summary instead of the whole swatch grid.
function announce() {
  $('announce').textContent = 'Paleta nueva. Values: ' + palette.colors.map(h => valueOfHex(h).toFixed(1)).join(', ');
}
function copy(text, msg) {
  try { navigator.clipboard.writeText(text).then(() => toast(msg), () => toast(text)); } catch { toast(text); }
}

/* ---------- events ---------- */
$('gen').addEventListener('click', generate);
$('copyAll').addEventListener('click', () => copy(palette.colors.join('\n'), 'Hex de la paleta copiados'));

$('exportCsp').addEventListener('click', async () => {
  const cols = palette.colors.slice();
  try {
    const zip = makeZip([
      { name: 'escala-de-values.aco', data: buildAco(cols) },
      { name: 'escala-de-values.png', data: await palettePng(cols) },
    ]);
    download(zip, 'escala-de-values.zip', 'application/zip');
    toast('Descargado. Arrastrá el .aco al panel Set de colores');
  } catch {
    toast('No se pudo armar el archivo');
  }
});

document.addEventListener('keydown', e => {
  if (e.code !== 'Space' || e.ctrlKey || e.metaKey || e.altKey) return;
  if (/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(document.activeElement?.tagName ?? '')) return;
  e.preventDefault();
  // Holding the key would flood the history with dozens of palettes.
  if (!e.repeat) generate();
});

Object.keys(outs).forEach(k => {
  els[k].addEventListener('input', () => {
    // Keep the lightest value above the darkest.
    if (k === 'vHi' && +els.vHi.value <= +els.vLo.value) els.vLo.value = Math.max(0, +els.vHi.value - 1);
    if (k === 'vLo' && +els.vLo.value >= +els.vHi.value) els.vHi.value = Math.min(10, +els.vLo.value + 1);
    updateOutputs();
  });
  els[k].addEventListener('change', generate);
});
[...SELECTS, 'mute'].forEach(k => els[k].addEventListener('change', generate));
els.bw.addEventListener('change', () => {
  drawSphere($('sphere'), palette.colors, { grey: els.bw.checked });
  persist();
});

/* ---------- start ---------- */
const saved = load();
history = saved.history;
writeSettings(saved.settings);
setPalette(saved.palette ?? { colors: FIRST_PALETTE, locked: FIRST_PALETTE.map(() => false) });
