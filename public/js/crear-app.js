// "Creador de paletas": a hand-made palette. Start random, from pasted hex or
// from nothing; edit, reorder, sort; take it away as an image, a link, hex,
// Clip Studio swatches or into the generator.

import { greyHex, makeColor, textOn, valueOfHex } from './color.js';
import { t, tn } from './i18n.js';
import { generatePalette, HARMONIES, minGap } from './palette.js';
import { colorsFromParam, hexListParam, LIST_MAX, parseHexList } from './hexlist.js';
import { drawPaletteImage, ensureFonts } from './palette-image.js';
import { buildAco, download, makeZip, palettePng } from './export.js';
import { MAX_COLORS, MIN_COLORS, paletteParam } from './storage.js';
import { announce, button, copy, el, iconButton, showGap, toast } from './ui.js';
import { icon } from './icons.js';

const $ = id => document.getElementById(id);
const STORE_KEY = 'pk-crear';
const UNDO_MAX = 50;
const RANDOM_DEFAULT = 5;
const TYPING = /^(INPUT|TEXTAREA|SELECT)$/;

let colors = [];
const undoStack = [];
let logo = null;
let painters = []; // per card, repaint in place (keeps a color picker open while dragging)

/* ---------- state ---------- */
const same = (a, b) => a.length === b.length && a.every((h, i) => h === b[i]);

// Every change goes through here: undo entry, render, save, URL.
function commit(next, { record = true } = {}) {
  if (record && !same(next, colors)) {
    undoStack.push(colors);
    if (undoStack.length > UNDO_MAX) undoStack.shift();
  }
  colors = next;
  render();
  save();
}

function undo() {
  if (!undoStack.length) return;
  colors = undoStack.pop();
  render();
  save();
  toast(t('create.undone'));
}

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ colors })); } catch { /* not saved */ }
  // The address bar always holds the link to the current palette.
  const url = colors.length ? `${location.pathname}?${hexListParam(colors)}` : location.pathname;
  window.history.replaceState(null, '', url);
  $('undoBtn').disabled = !undoStack.length;
}

function initialColors() {
  const fromUrl = colorsFromParam(new URLSearchParams(location.search).get('colors'));
  if (fromUrl.length) return fromUrl;
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY));
    const cols = parseHexList((saved?.colors ?? []).join(' '));
    if (cols.length) return cols;
  } catch { /* nothing saved */ }
  return randomPalette(RANDOM_DEFAULT);
}

/* ---------- making colors ---------- */
const rand = (a, b) => a + Math.random() * (b - a);

// A generated palette with free values and a random harmony: varied, but
// still colors that go together.
function randomPalette(n) {
  const harmony = HARMONIES[Math.floor(Math.random() * HARMONIES.length)];
  return generatePalette({
    count: n, vHi: 9, vLo: 1.5, dist: 'linear', scale: false, order: true,
    harmony, temp: 'none', sat: 55, jit: 40, mute: false,
  }).colors;
}
const randomColor = () => makeColor(rand(1.5, 9), rand(0, 360), rand(0.35, 0.8));

/* ---------- actions ---------- */
function randomize() {
  const n = colors.length >= MIN_COLORS && colors.length <= 12 ? colors.length : RANDOM_DEFAULT;
  commit(randomPalette(n));
  announce(tn('create.randomAnnounce', n));
}
function clearAll() {
  if (!colors.length) return;
  commit([]);
  toast(t('create.emptied'));
}
function addColor() {
  if (colors.length >= LIST_MAX) return;
  commit([...colors, randomColor()]);
  // Straight to the new color's editor.
  $('swatches').children[colors.length - 1]?.querySelector('.hex-input')?.focus();
}
function removeColor(i) {
  const hex = colors[i];
  commit(colors.filter((_, j) => j !== i));
  const cards = $('swatches').querySelectorAll('.sw:not(.add-card)');
  (cards[Math.min(i, cards.length - 1)]?.querySelector('.remove') ?? $('swatches').querySelector('.add-card'))?.focus();
  toast(t('create.removed', { hex }));
}
function move(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= colors.length) return;
  const next = colors.slice();
  [next[i], next[j]] = [next[j], next[i]];
  commit(next);
  $('swatches').children[j]?.querySelector(dir < 0 ? '.before' : '.after')?.focus();
}
function sortByValue() {
  commit([...colors].sort((a, b) => valueOfHex(b) - valueOfHex(a)));
  announce(t('create.sortedAnnounce'));
}
function importText(text, { append = false } = {}) {
  const found = parseHexList(text);
  if (!found.length) { toast(t('create.noHex')); return false; }
  const next = append ? [...colors, ...found].slice(0, LIST_MAX) : found;
  commit(next);
  toast(tn(append ? 'create.added' : 'create.pasted', found.length));
  return true;
}

/* ---------- render ---------- */
function render() {
  const n = colors.length;
  painters = [];
  const cards = colors.map((_, i) => card(i, n));
  const add = button('sw add-card');
  add.append(icon('plus'), el('span', null, t('create.add')));
  add.disabled = n >= LIST_MAX;
  add.title = n >= LIST_MAX ? t('create.maxTitle', { max: LIST_MAX }) : t('create.addTitle');
  add.addEventListener('click', addColor);
  $('swatches').replaceChildren(...cards, add);
  $('countInfo').textContent = n ? '· ' + tn('create.count', n) : '· ' + t('create.countEmpty');
  $('sortBtn').disabled = n < 2;
  renderShared();
}

// Everything that follows the colors but isn't a card: grey strip, image, buttons.
function renderShared() {
  const n = colors.length;
  $('greyWrap').hidden = !n;
  $('exportCard').hidden = !n;
  const vs = colors.map(valueOfHex);
  $('grey').replaceChildren(...vs.map(v => { const s = el('span'); s.style.background = greyHex(v); return s; }));
  const gap = minGap(vs), info = $('gapInfo');
  if (n < 2) info.textContent = '';
  else showGap(info, gap);
  if (n) drawPaletteImage($('imagePreview'), colors, { logo });
  const tg = $('toGenerator');
  tg.disabled = n < MIN_COLORS;
  tg.title = n < MIN_COLORS ? t('common.genMin', { min: MIN_COLORS })
    : n > MAX_COLORS ? t('create.genFirst', { max: MAX_COLORS })
    : t('common.genContinue');
}

function card(i, n) {
  const sw = el('div', 'sw');
  const vText = el('div', 'v');
  const top = el('div', 'top');
  top.append(el('div', 'vlab', t('common.value')), vText);

  const picker = el('input', 'picker');
  picker.type = 'color';
  picker.setAttribute('aria-label', t('create.pickN', { n: i + 1 }));
  const hexIn = el('input', 'hex-input');
  Object.assign(hexIn, { type: 'text', maxLength: 9, spellcheck: false, autocomplete: 'off' });
  hexIn.setAttribute('aria-label', t('create.hexN', { n: i + 1 }));

  function paint() {
    const hex = colors[i];
    sw.style.background = hex;
    sw.style.color = textOn(hex);
    vText.textContent = valueOfHex(hex).toFixed(1);
    picker.value = hex.toLowerCase();
    if (document.activeElement !== hexIn) hexIn.value = hex;
  }
  painters.push(paint);

  // Dragging in the picker repaints in place; the undo entry is taken once,
  // when the drag starts, and the change is saved when it ends.
  let before = null;
  picker.addEventListener('input', () => {
    if (!before) before = colors.slice();
    colors = colors.map((h, j) => (j === i ? picker.value.toUpperCase() : h));
    paint();
    renderShared();
  });
  picker.addEventListener('change', () => {
    const after = colors;
    colors = before ?? colors;
    before = null;
    commit(after);
    $('swatches').children[i]?.querySelector('.picker')?.focus();
  });
  hexIn.addEventListener('change', () => {
    const [hex] = parseHexList(hexIn.value.includes('#') ? hexIn.value : '#' + hexIn.value.trim());
    if (!hex) { toast(t('create.invalidHex')); hexIn.value = colors[i]; return; }
    commit(colors.map((h, j) => (j === i ? hex : h)));
    $('swatches').children[i]?.querySelector('.hex-input')?.focus();
  });
  hexIn.addEventListener('keydown', e => { if (e.key === 'Enter') hexIn.blur(); });
  hexIn.addEventListener('focus', () => hexIn.select());

  // The native picker is invisible on top of a pipette button, so it reads as
  // "pick a color" and still opens the system picker where it's clicked.
  const pickBtn = el('span', 'picker-btn');
  pickBtn.title = t('create.pick');
  pickBtn.append(icon('pipette'), picker);
  const edit = el('div', 'edit');
  edit.append(pickBtn, hexIn);

  const beforeBtn = iconButton('before', 'chevron-left', t('create.before'));
  beforeBtn.disabled = i === 0;
  beforeBtn.addEventListener('click', () => move(i, -1));
  const afterBtn = iconButton('after', 'chevron-right', t('create.after'));
  afterBtn.disabled = i === n - 1;
  afterBtn.addEventListener('click', () => move(i, 1));
  const copyBtn = iconButton('copy-one', 'copy', t('common.copyHex'));
  copyBtn.addEventListener('click', () => copy(colors[i], t('common.copied', { hex: colors[i] })));
  const removeBtn = iconButton('remove', 'trash-2', t('create.remove'));
  removeBtn.addEventListener('click', () => removeColor(i));
  const tools = el('div', 'tools');
  tools.append(beforeBtn, afterBtn, copyBtn, removeBtn);

  const bottom = el('div', 'bottom');
  bottom.append(edit, tools);
  sw.append(top, bottom);
  paint();
  return sw;
}

/* ---------- export ---------- */
const imageBlob = () => new Promise((resolve, reject) => {
  const c = document.createElement('canvas');
  drawPaletteImage(c, colors, { logo });
  c.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/png');
});

$('downloadImg').addEventListener('click', async () => {
  try {
    download(await imageBlob(), 'palettekit-paleta.png', 'image/png');
    toast(t('create.imageDownloaded'));
  } catch { toast(t('create.imageFailed')); }
});

// On phones the share sheet is the natural way; elsewhere, copy the link.
const canShare = () => !!navigator.share && matchMedia('(pointer: coarse)').matches;
$('shareLabel').textContent = canShare() ? t('create.shareLink') : t('create.copyLink');
$('shareLink').addEventListener('click', async () => {
  const url = location.href;
  if (canShare()) {
    try { await navigator.share({ title: t('create.shareTitle'), url }); } catch { /* cancelled */ }
  } else {
    copy(url, t('create.linkCopied'));
  }
});
$('copyAll').addEventListener('click', () => copy(colors.join('\n'), t('common.hexCopied')));
$('exportCsp').addEventListener('click', async () => {
  try {
    const zip = makeZip([
      { name: 'palettekit-paleta.aco', data: buildAco(colors) },
      { name: 'palettekit-paleta.png', data: await palettePng(colors) },
    ]);
    download(zip, 'palettekit-paleta.zip', 'application/zip');
    toast(t('common.acoDownloaded'));
  } catch { toast(t('common.exportFailed')); }
});
$('toGenerator').addEventListener('click', () => {
  location.href = '/?' + paletteParam(colors.slice(0, MAX_COLORS));
});

/* ---------- start options ---------- */
function setPasteOpen(open) {
  $('pastePanel').hidden = !open;
  $('pasteBtn').setAttribute('aria-expanded', String(open));
  if (open) $('pasteText').focus();
  else $('pasteText').value = '';
}
$('pasteBtn').addEventListener('click', () => setPasteOpen($('pastePanel').hidden));
$('pasteCancel').addEventListener('click', () => { setPasteOpen(false); $('pasteBtn').focus(); });
$('pasteUse').addEventListener('click', () => { if (importText($('pasteText').value)) setPasteOpen(false); });
$('pasteAdd').addEventListener('click', () => { if (importText($('pasteText').value, { append: true })) setPasteOpen(false); });
$('randomBtn').addEventListener('click', randomize);
$('clearBtn').addEventListener('click', clearAll);
$('undoBtn').addEventListener('click', undo);
$('sortBtn').addEventListener('click', sortByValue);

// Pasting hex anywhere outside a text field replaces the palette (undoable).
document.addEventListener('paste', e => {
  if (TYPING.test(document.activeElement?.tagName ?? '')) return;
  const text = e.clipboardData?.getData('text');
  if (text && parseHexList(text).length) { e.preventDefault(); importText(text); }
});
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && !TYPING.test(document.activeElement?.tagName ?? '')) {
    e.preventDefault();
    undo();
  }
  if (e.key === 'Escape' && !$('pastePanel').hidden) { setPasteOpen(false); $('pasteBtn').focus(); }
});

/* ---------- start ---------- */
colors = initialColors();
render();
save();
// Web fonts and the logo aren't ready on the first draw; redraw the image once they are.
Promise.all([
  ensureFonts(),
  new Promise(resolve => {
    const img = new Image();
    img.onload = () => { logo = img; resolve(); };
    img.onerror = resolve;
    img.src = '/logo.svg';
  }),
]).then(renderShared);
