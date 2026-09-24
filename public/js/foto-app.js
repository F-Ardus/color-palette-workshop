// "Paleta desde una foto": load an image, extract its colors, show them and the
// image repainted with them, optionally recolored with a generated harmony.
// Or try a palette of your own (pasted hex) on the image, repainting it by
// color or by value. Nothing leaves the browser.

import { greyHex, textOn, valueOfHex } from './color.js';
import { t, tn } from './i18n.js';
import { HARMONIES, minGap, roleFor, TEMPERATURES } from './palette.js';
import {
  DETAIL_DEFAULT, DETAIL_MAX, DETAIL_MIN, extractAuto, extractPalette, mapPixels, paletteFromHexes, posterize, sharesOf, topByShare,
} from './extract.js';
import { recolor, rerollOne } from './recolor.js';
import { buildAco, download, makeZip, palettePng } from './export.js';
import { MAX_COLORS, MIN_COLORS, paletteParam } from './storage.js';
import { setIcon } from './icons.js';
import { pixels, setupImageInput } from './image-input.js';
import { colorsFromParam, hexListParam, parseHexList } from './hexlist.js';
import { announce, button, copy, el, iconButton, showGap, toast } from './ui.js';

const $ = id => document.getElementById(id);
// Longest side, in pixels, of the copies used to extract (small: fast and
// enough for dominant colors) and to show the repainted image.
const ANALYSIS_MAX = 256;
const POSTER_MAX = 900;
const COUNT_MAX = 24;
// Past this many cards, they wrap into a grid instead of one row of slivers.
const ONE_ROW_MAX = 9;
const PREFS_KEY = 'pk-foto';

let source = null;  // {analysis: ImageData, poster: ImageData}
let extracted = []; // [{hex, share, lab}], light to dark, as found in the image
let colors = [];    // what's shown: `extracted` or a recolored version of it
let locked = [];    // per color: kept by "Randomizar colores" and not rerollable
let focused = -1;   // color shown alone on the repainted image, -1 for none
// Where the palette comes from: "photo" (extracted from the image) or "own"
// (pasted by the user and matched to the image by color or by value).
let mode = 'photo';
let ownHexes = [];
const MAPPINGS = ['color', 'value'];
const mapping = () => (mode === 'own' ? $('mapping').value : 'color');
const TYPING = /^(INPUT|TEXTAREA|SELECT)$/;

const isRecolored = () => colors.some((c, i) => c.hex !== extracted[i]?.hex);
const pct = share => (share < 0.005 ? '<1%' : `${Math.round(share * 100)}%`);

/* ---------- prefs (per viewer, best effort) ---------- */
const intIn = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
function loadPrefs() {
  let p = {};
  try { p = JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch { /* defaults */ }
  if (intIn(p.count, MIN_COLORS, COUNT_MAX)) $('count').value = p.count;
  $('detail').value = intIn(p.detail, DETAIL_MIN, DETAIL_MAX) ? p.detail : DETAIL_DEFAULT;
  $('auto').checked = p.auto === true;
  $('bw').checked = p.bw === true;
  if (HARMONIES.includes(p.harmony)) $('harmony').value = p.harmony;
  if (TEMPERATURES.includes(p.temp)) $('temp').value = p.temp;
  if (MAPPINGS.includes(p.mapping)) $('mapping').value = p.mapping;
  updateCountFields();
}
function savePrefs() {
  const p = {
    count: +$('count').value, detail: +$('detail').value, auto: $('auto').checked, bw: $('bw').checked,
    harmony: $('harmony').value, temp: $('temp').value, mapping: $('mapping').value,
  };
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* not saved */ }
}
function updateCountFields() {
  const auto = $('auto').checked;
  $('countField').hidden = auto;
  $('detailField').hidden = !auto;
  $('countOut').textContent = $('count').value;
  $('detailOut').textContent = $('detail').value;
}

/* ---------- image ---------- */
setupImageInput(img => {
  source = { analysis: pixels(img, ANALYSIS_MAX), poster: pixels(img, POSTER_MAX) };
  // With a palette of your own, a new image keeps it and just measures it again.
  extract();
});

// A new base palette drops any recoloring, locks and highlight: they belonged
// to other colors.
function setBase(list) {
  extracted = list;
  colors = list;
  locked = list.map(() => false);
  focused = -1;
  render();
}

function extract() {
  if (mode === 'own') { setBase(ownPalette()); return; }
  if (!source) { setBase([]); return; }
  const data = source.analysis.data;
  setBase($('auto').checked ? extractAuto(data, +$('detail').value) : extractPalette(data, +$('count').value));
  if (!extracted.length) toast(t('photo.transparent'));
  announce(t('photo.announce', { n: colors.length, values: colors.map(c => valueOfHex(c.hex).toFixed(1)).join(', ') }));
}

/* ---------- your own palette ---------- */
// The pasted colors, with how much of the image each one would take.
function ownPalette() {
  const pal = paletteFromHexes(ownHexes);
  if (!source) return pal;
  const shares = sharesOf(mapPixels(source.analysis.data, pal, mapping()), pal.length);
  return pal.map((c, i) => ({ ...c, share: shares[i] }));
}

function useOwn(hexes) {
  mode = 'own';
  ownHexes = hexes;
  updateModeFields();
  extract();
  toast(tn('photo.ownUsed', hexes.length));
}

function backToPhoto() {
  mode = 'photo';
  updateModeFields();
  extract();
}

// Switching between color and value keeps recoloring and locks: only the
// zones (and so the shares) change.
function remap() {
  const pal = ownPalette();
  extracted = pal;
  colors = colors.map((c, i) => ({ ...c, share: pal[i].share }));
  render();
  savePrefs();
}

function updateModeFields() {
  const own = mode === 'own';
  $('photoControls').hidden = own;
  $('ownControls').hidden = !own;
  $('paletteTitle').textContent = own ? t('photo.ownTitle') : t('common.palette');
  $('posterEmpty').textContent = own ? t('photo.posterEmptyOwn') : t('photo.posterEmpty');
  $('recolorHint').textContent = own ? t('photo.recolorHintOwn') : t('photo.recolorHint');
}

function setPasteOpen(open) {
  $('pastePanel').hidden = !open;
  $('pasteBtn').setAttribute('aria-expanded', String(open));
  if (open) $('pasteText').focus();
  else $('pasteText').value = '';
}

function pasteText(text) {
  const found = parseHexList(text);
  if (!found.length) { toast(t('common.noHex')); return false; }
  useOwn(found);
  return true;
}

// Always recolors from the photo's own colors, so repeated rolls keep its
// hue relations; locked colors keep whatever they show now.
function recolorNow() {
  if (!extracted.length) return;
  if (locked.every(Boolean)) { toast(t('photo.allLocked')); return; }
  const next = recolor(extracted, { harmony: $('harmony').value, temp: $('temp').value });
  colors = next.map((c, i) => (locked[i] ? colors[i] : c));
  render();
  announce(t('photo.recoloredAnnounce'));
}

function resetColors() {
  colors = extracted.map((c, i) => (locked[i] ? colors[i] : c));
  render();
  announce(t('photo.originalsAnnounce'));
}

function reroll(i) {
  const keepFocus = document.activeElement?.classList.contains('reroll');
  colors = rerollOne(colors, i, { temp: $('temp').value });
  render();
  if (keepFocus) $('swatches').children[i]?.querySelector('.reroll')?.focus();
  toast(t('common.newColor', { hex: colors[i].hex }));
}

// Shows one color alone on the repainted image, the rest in grey. Updated in
// place so focus stays on the card's controls.
function toggleFocus(i) {
  focused = focused === i ? -1 : i;
  [...$('swatches').children].forEach((card, j) => {
    card.classList.toggle('focused', j === focused);
    card.querySelector('.spot')?.setAttribute('aria-pressed', String(j === focused));
  });
  $('swatches').classList.toggle('has-focus', focused >= 0);
  drawPoster();
  announce(focused >= 0 ? t('photo.showingOnly', { hex: colors[focused].hex }) : t('photo.showingAll'));
}

function setLock(btn, rerollBtn, on) {
  btn.setAttribute('aria-pressed', String(on));
  btn.title = on ? t('photo.lockedTitle') : t('common.lock');
  setIcon(btn, on ? 'lock' : 'lock-open');
  rerollBtn.disabled = on;
}

/* ---------- render ---------- */
function render() {
  const n = colors.length;
  const sw = $('swatches');
  sw.classList.toggle('many', n > ONE_ROW_MAX);
  sw.classList.toggle('has-focus', focused >= 0);
  sw.replaceChildren(...colors.map((c, i) => {
    const v = valueOfHex(c.hex);
    const card = el('div', 'sw');
    card.style.background = c.hex;
    card.style.color = textOn(c.hex);
    const top = el('div', 'top');
    top.append(el('div', 'vlab', t('common.value')), el('div', 'v', v.toFixed(1)));
    const hexBtn = button('hex', c.hex);
    hexBtn.title = t('common.copy');
    hexBtn.addEventListener('click', () => copy(c.hex, t('common.copied', { hex: c.hex })));
    const spot = iconButton('spot', 'eye', t('photo.showOnly', { hex: c.hex }));
    spot.setAttribute('aria-pressed', String(i === focused));
    spot.addEventListener('click', () => toggleFocus(i));
    const again = iconButton('reroll', 'refresh-cw', t('common.reroll', { v: v.toFixed(1) }));
    again.addEventListener('click', () => reroll(i));
    // Toggled in place: re-rendering would drop keyboard focus.
    const lock = iconButton('lock', 'lock-open', t('common.lockHex', { hex: c.hex }));
    setLock(lock, again, locked[i]);
    lock.addEventListener('click', () => { locked[i] = !locked[i]; setLock(lock, again, locked[i]); });
    const tools = el('div', 'tools');
    tools.append(spot, again, lock);

    const bottom = el('div', 'bottom');
    // Already light to dark, so the position is the rank.
    // Shares need an image: a pasted palette can come before one.
    const share = source ? el('span', 'share-pct', t('common.shareOf', { pct: pct(c.share) })) : '';
    bottom.append(el('span', 'role', t('role.' + roleFor(i, n, v))), share, hexBtn, tools);
    card.append(top, bottom);
    card.classList.toggle('focused', i === focused);
    // Clicking the card itself (not one of its buttons) does the same as the eye.
    card.addEventListener('click', e => { if (!e.target.closest('button')) toggleFocus(i); });
    return card;
  }));

  $('strips').hidden = !n;
  $('share').parentElement.querySelector('.section-h').hidden = !source;
  $('share').hidden = !source;
  $('share').style.gridTemplateColumns = colors.map(c => `${Math.max(c.share, 0.005)}fr`).join(' ');
  $('share').replaceChildren(...colors.map(c => { const s = el('span'); s.style.background = c.hex; return s; }));
  const vs = colors.map(c => valueOfHex(c.hex));
  $('grey').replaceChildren(...vs.map(v => { const s = el('span'); s.style.background = greyHex(v); return s; }));
  const gap = minGap(vs), info = $('gapInfo');
  if (n < 2) info.textContent = '';
  else showGap(info, gap);

  const notes = [];
  if (mode === 'photo' && $('auto').checked && n) notes.push(t('photo.noteFound', { n }));
  if (mode === 'own' && source && n) notes.push(t(mapping() === 'value' ? 'photo.noteOwnValue' : 'photo.noteOwnColor'));
  if (isRecolored()) notes.push(t('photo.noteRecolored'));
  if (n > MAX_COLORS) notes.push(t('photo.noteLimit', { max: MAX_COLORS }));
  $('paletteNote').textContent = notes.join(' ');
  $('paletteNote').hidden = !notes.length;

  $('copyAll').disabled = !n;
  $('exportCsp').disabled = !n;
  $('toCreator').disabled = !n;
  const tg = $('toGenerator');
  tg.disabled = n < MIN_COLORS;
  tg.title = n && n < MIN_COLORS ? t('common.genMin', { min: MIN_COLORS }) : t('common.genContinue');
  $('recolorBar').hidden = !n;
  $('resetColors').hidden = !isRecolored();
  drawPoster();
}

function drawPoster() {
  const cv = $('poster');
  if (!source || !colors.length) { cv.hidden = true; $('posterEmpty').hidden = false; return; }
  const { width, height, data } = source.poster;
  // Pixels are matched to the colors found in the image (lab), then painted
  // with whatever is shown: original, recolored or grey.
  // A focused color stays in color; everything else goes grey if it's
  // focused on another color or "Ver en grises" is on.
  const grey = c => ({ ...c, hex: greyHex(valueOfHex(c.hex)) });
  const shown = colors.map((c, i) => (i === focused || (focused < 0 && !$('bw').checked) ? c : grey(c)));
  cv.width = width; cv.height = height;
  cv.getContext('2d').putImageData(new ImageData(posterize(data, shown, mapping()), width, height), 0, 0);
  cv.hidden = false;
  $('posterEmpty').hidden = true;
}

/* ---------- events ---------- */
['count', 'detail'].forEach(id => {
  $(id).addEventListener('input', updateCountFields);
  $(id).addEventListener('change', () => { savePrefs(); extract(); });
});
$('auto').addEventListener('change', () => { updateCountFields(); savePrefs(); extract(); });
$('bw').addEventListener('change', () => { savePrefs(); drawPoster(); });
$('recolorBtn').addEventListener('click', recolorNow);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && focused >= 0) toggleFocus(focused); });
$('resetColors').addEventListener('click', resetColors);
// Picking a harmony or temperature is asking to see it: recolor right away.
['harmony', 'temp'].forEach(id => $(id).addEventListener('change', () => { savePrefs(); recolorNow(); }));

$('copyAll').addEventListener('click', () => copy(colors.map(c => c.hex).join('\n'), t('common.hexCopied')));
$('exportCsp').addEventListener('click', async () => {
  const cols = colors.map(c => c.hex);
  try {
    const zip = makeZip([
      { name: 'palettekit-foto.aco', data: buildAco(cols) },
      { name: 'palettekit-foto.png', data: await palettePng(cols) },
    ]);
    download(zip, 'palettekit-foto.zip', 'application/zip');
    toast(t('common.acoDownloaded'));
  } catch {
    toast(t('common.exportFailed'));
  }
});
$('pasteBtn').addEventListener('click', () => setPasteOpen($('pastePanel').hidden));
$('pasteCancel').addEventListener('click', () => { setPasteOpen(false); $('pasteBtn').focus(); });
$('pasteUse').addEventListener('click', () => { if (pasteText($('pasteText').value)) setPasteOpen(false); });
$('mapping').addEventListener('change', remap);
$('backToPhoto').addEventListener('click', backToPhoto);
// Pasting hex text anywhere outside a field tries it as your palette (pasted
// images are handled by image-input.js).
document.addEventListener('paste', e => {
  if (TYPING.test(document.activeElement?.tagName ?? '')) return;
  const text = e.clipboardData?.getData('text');
  if (text && parseHexList(text).length) { e.preventDefault(); pasteText(text); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('pastePanel').hidden) { setPasteOpen(false); $('pasteBtn').focus(); }
});

$('toCreator').addEventListener('click', () => { location.href = '/crear/?' + hexListParam(colors.map(c => c.hex)); });
$('toGenerator').addEventListener('click', () => {
  location.href = '/?' + paletteParam(topByShare(colors, MAX_COLORS).map(c => c.hex));
});

loadPrefs();
// /foto/?colors=… opens with that palette ready to try on an image.
const incoming = colorsFromParam(new URLSearchParams(location.search).get('colors'));
if (location.search) window.history.replaceState(null, '', location.pathname);
if (incoming.length) useOwn(incoming);
