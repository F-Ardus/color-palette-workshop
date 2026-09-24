// DOM wiring: reads the settings, keeps the current palette and history, renders.

import { greyHex, textOn, valueOfHex } from './color.js';
import { t, tn } from './i18n.js';
import { adjustPalette, generatePalette, minGap, rankOf, rerollColor, roleFor, setColorValue, sortPalette } from './palette.js';
import { addToHistory, DEFAULTS, load, paletteFromParam, removeFromHistory, saveHistory, saveSettings } from './storage.js';
import { drawSphere } from './sphere.js';
import { buildAco, download, makeZip, palettePng } from './export.js';
import { setIcon } from './icons.js';
import { hexListParam } from './hexlist.js';
import { announce as say, button, copy, el, iconButton, showGap, toast } from './ui.js';

const $ = id => document.getElementById(id);
const els = {
  count: $('count'), vHi: $('vHi'), vLo: $('vLo'), dist: $('dist'), harmony: $('harmony'),
  temp: $('temp'), sat: $('sat'), jit: $('jit'), mute: $('mute'), bw: $('bw'),
  scale: $('scale'), keep: $('keep'), order: $('order'),
};
const NUMERIC = ['count', 'vHi', 'vLo', 'sat', 'jit'];
const SELECTS = ['dist', 'harmony', 'temp'];
const CHECKS = ['mute', 'bw', 'scale', 'keep', 'order'];
// Changing these always rolls new hues, even with "Mantener tonos" on.
const REROLLS = new Set(['harmony', 'temp']);
const outs = { count: v => v, vHi: v => v, vLo: v => v, sat: v => v + '%', jit: v => v + '%' };

// Shown on a first visit, before anything has been generated.
const FIRST_PALETTE = ['#F2E3B3', '#D98E73', '#4F7A6B', '#6B3A5A', '#1E1B3A'];

let palette = { colors: [], locked: [], recipes: null };
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
  updateScaleFields();
}
// "Reparto" only means something when values are scaled; the order toggle only
// when they aren't (scaled palettes are always light to dark).
function updateScaleFields() {
  $('distField').hidden = !els.scale.checked;
  $('cardsBar').hidden = els.scale.checked;
}
function updateOutputs() {
  Object.keys(outs).forEach(k => { $(k + 'Out').textContent = outs[k](els[k].value); });
}
const persist = () => saveSettings(readSettings(), palette);

function setPalette(next) {
  palette = { colors: next.colors, locked: next.locked, recipes: next.recipes ?? null };
  els.count.value = palette.colors.length;
  updateOutputs();
  render();
  persist();
}

function generate() {
  const next = generatePalette(readSettings(), palette);
  if (palette.colors.length) { history = addToHistory(history, palette.colors); saveHistory(history); }
  apply(next);
}

// Same hues, new settings. Not added to the history: it's an edit, not a new palette.
function adjust() {
  apply(adjustPalette(readSettings(), palette));
}

function apply({ colors, locked, recipes, dropped }) {
  setPalette({ colors, locked, recipes });
  announce();
  if (dropped) toast(tn('gen.dropped', dropped));
}

function onSettingChange(key) {
  if (els.keep.checked && !REROLLS.has(key)) adjust();
  else generate();
}

// New hue for one color, same value. An edit like adjust(): no history entry.
function reroll(i) {
  const keepFocus = document.activeElement?.classList.contains('reroll');
  const next = rerollColor(readSettings(), palette, i);
  setPalette(next);
  if (keepFocus) $('swatches').children[i]?.querySelector('.reroll')?.focus();
  toast(t('common.newColor', { hex: next.colors[i] }));
}

function restore(cols) {
  history = removeFromHistory(addToHistory(history, palette.colors), cols);
  saveHistory(history);
  setPalette({ colors: cols.slice(), locked: cols.map(() => false) });
  announce();
}

/* ---------- render ---------- */
function setLock(btn, rerollBtn, on) {
  btn.setAttribute('aria-pressed', String(on));
  btn.title = on ? t('gen.lockedTitle') : t('common.lock');
  setIcon(btn, on ? 'lock' : 'lock-open');
  // A locked color can't be rerolled either.
  rerollBtn.disabled = on;
}

function render() {
  renderSwatches();
  renderGrey();
  drawSphere($('sphere'), palette.colors, { grey: els.bw.checked });
  renderHistory();
}

// One repaint function per card, so a drag can refresh every card's role in place.
let painters = [];

function renderSwatches() {
  const n = palette.colors.length;
  painters = [];
  $('swatches').replaceChildren(...palette.colors.map((_, i) => swatch(i, n)));
}

function swatch(i, n) {
  const sw = el('div', 'sw');
  const vText = el('div', 'v');
  const role = el('span', 'role');
  const hexBtn = button('hex');
  hexBtn.title = t('common.copy');
  hexBtn.addEventListener('click', () => copy(palette.colors[i], t('common.copied', { hex: palette.colors[i] })));
  const again = iconButton('reroll', 'refresh-cw', '');
  again.addEventListener('click', () => reroll(i));
  const lock = iconButton('lock', 'lock-open', '');

  const top = el('div', 'top');
  top.append(el('div', 'vlab', t('common.value')), vText);

  // Without scaling, each color's value can be set by hand. The card is
  // repainted in place while dragging; the palette is re-sorted on release.
  let range = null;
  if (!els.scale.checked) {
    range = el('input', 'value-range');
    Object.assign(range, { type: 'range', min: els.vLo.value, max: els.vHi.value, step: 0.1 });
    range.addEventListener('input', () => {
      const next = setColorValue(readSettings(), palette, i, +range.value);
      palette = { ...palette, colors: next.colors, recipes: next.recipes };
      painters.forEach(p => p());
      renderGrey();
      drawSphere($('sphere'), palette.colors, { grey: els.bw.checked });
    });
    range.addEventListener('change', () => settleValue(i));
    top.append(range);
  }

  function paint() {
    const hex = palette.colors[i], v = valueOfHex(hex);
    sw.style.background = hex;
    sw.style.color = textOn(hex);
    vText.textContent = v.toFixed(1);
    role.textContent = t('role.' + roleFor(rankOf(palette.colors.map(valueOfHex), i), n, v));
    hexBtn.textContent = hex;
    again.setAttribute('aria-label', t('common.reroll', { v: v.toFixed(1) }));
    again.title = again.getAttribute('aria-label');
    lock.setAttribute('aria-label', t('common.lockHex', { hex }));
    if (range) {
      range.value = v.toFixed(1);
      range.setAttribute('aria-label', t('gen.valueOf', { hex }));
      range.setAttribute('aria-valuetext', v.toFixed(1));
    }
  }
  function setLocked(on) {
    setLock(lock, again, on);
    if (range) range.disabled = on;
  }

  // Toggled in place: re-rendering would drop keyboard focus.
  lock.addEventListener('click', () => {
    palette.locked[i] = !palette.locked[i];
    setLocked(palette.locked[i]);
    persist();
  });

  const tools = el('div', 'tools');
  tools.append(again, lock);
  const bottom = el('div', 'bottom');
  bottom.append(role, hexBtn, tools);
  sw.append(top, bottom);
  painters.push(paint);
  paint();
  setLocked(palette.locked[i]);
  return sw;
}

// After a manual value change: back in light-to-dark order if "Ordenar por
// value" is on, saved, and the slider keeps focus wherever its card ended up.
function settleValue(i) {
  const hex = palette.colors[i];
  const hadFocus = document.activeElement?.classList.contains('value-range');
  const next = els.order.checked ? sortPalette(palette) : palette;
  setPalette(next);
  if (hadFocus) $('swatches').children[next.colors.indexOf(hex)]?.querySelector('.value-range')?.focus();
}

function renderGrey() {
  const vs = palette.colors.map(valueOfHex);
  $('grey').replaceChildren(...vs.map(v => {
    const s = el('span');
    s.style.background = greyHex(v);
    return s;
  }));
  const gap = minGap(vs), info = $('gapInfo');
  if (!els.scale.checked) info.textContent = '';
  else showGap(info, gap);
}

function renderHistory() {
  const h = $('hist');
  if (!history.length) {
    h.replaceChildren(el('span', 'empty', t('gen.historyEmpty')));
    return;
  }
  h.replaceChildren(...history.map(cols => {
    const b = button();
    b.setAttribute('aria-label', t('gen.restore', { colors: cols.join(' ') }));
    cols.forEach(c => { const s = el('span'); s.style.background = c; b.appendChild(s); });
    b.addEventListener('click', () => restore(cols));
    return b;
  }));
}

/* ---------- feedback ---------- */
const announce = () => say(t('gen.announce', { values: palette.colors.map(h => valueOfHex(h).toFixed(1)).join(', ') }));

/* ---------- events ---------- */
$('gen').addEventListener('click', generate);
// Back to the default controls, with a palette made from them; the current one
// goes to the history like any generated palette.
$('resetBtn').addEventListener('click', () => {
  writeSettings(DEFAULTS);
  generate();
  toast(t('common.resetDone'));
});
$('toCreator').addEventListener('click', () => { location.href = '/crear/?' + hexListParam(palette.colors); });
$('copyAll').addEventListener('click', () => copy(palette.colors.join('\n'), t('common.hexCopied')));

$('exportCsp').addEventListener('click', async () => {
  const cols = palette.colors.slice();
  try {
    const zip = makeZip([
      { name: 'palettekit.aco', data: buildAco(cols) },
      { name: 'palettekit.png', data: await palettePng(cols) },
    ]);
    download(zip, 'palettekit.zip', 'application/zip');
    toast(t('common.acoDownloaded'));
  } catch {
    toast(t('common.exportFailed'));
  }
});

document.addEventListener('keydown', e => {
  if (e.code !== 'Space' || e.ctrlKey || e.metaKey || e.altKey) return;
  if (/^(INPUT|SELECT|TEXTAREA|BUTTON|A)$/.test(document.activeElement?.tagName ?? '')) return;
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
  els[k].addEventListener('change', () => onSettingChange(k));
});
[...SELECTS, 'mute'].forEach(k => els[k].addEventListener('change', () => onSettingChange(k)));
els.scale.addEventListener('change', () => { updateScaleFields(); onSettingChange('scale'); });
els.keep.addEventListener('change', persist);
els.order.addEventListener('change', () => {
  if (els.order.checked) setPalette(sortPalette(palette));
  else persist();
});
els.bw.addEventListener('change', () => {
  drawSphere($('sphere'), palette.colors, { grey: els.bw.checked });
  persist();
});

/* ---------- start ---------- */
const saved = load();
history = saved.history;
writeSettings(saved.settings);
// A palette sent by another tool (e.g. "Paleta desde una foto") replaces the
// current one, which goes to the history. The URL is cleaned so a reload doesn't re-import.
const incoming = paletteFromParam(new URLSearchParams(location.search).get('colors'));
if (location.search) window.history.replaceState(null, '', location.pathname);
if (incoming) {
  if (saved.palette) { history = addToHistory(history, saved.palette.colors); saveHistory(history); }
  // Other tools may send any order (the creator keeps the user's). Here a
  // scaled palette is always light to dark, and an unscaled one follows "Ordenar por value".
  const received = { colors: incoming, locked: incoming.map(() => false) };
  setPalette(els.scale.checked || els.order.checked ? sortPalette(received) : received);
  toast(t('gen.received'));
} else {
  setPalette(saved.palette ?? { colors: FIRST_PALETTE, locked: FIRST_PALETTE.map(() => false) });
}
