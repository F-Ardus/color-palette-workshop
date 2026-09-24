// "Rampas de color": the steps between a light and a shadow color.

import { t } from './i18n.js';
import { greyHex, textOn, valueOfHex } from './color.js';
import { minGap } from './palette.js';
import { ramp, SPACES, STEPS_MAX, STEPS_MIN } from './ramp.js';
import { hexListParam, parseHexList } from './hexlist.js';
import { buildAco, download, makeZip, palettePng } from './export.js';
import { MAX_COLORS, paletteParam } from './storage.js';
import { announce, button, copy, el, showGap, toast } from './ui.js';

const $ = id => document.getElementById(id);
const PREFS_KEY = 'pk-rampas';
const DEFAULTS = { from: '#F4DDB8', to: '#2A1F3D', steps: 7, space: 'oklab', even: false, shift: 0, mid: 0, compare: true };

let state = { ...DEFAULTS };
let colors = [];

/* ---------- prefs (per viewer, best effort) ---------- */
function loadPrefs() {
  let p = {};
  try { p = JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch { /* defaults */ }
  const hex = v => parseHexList(typeof v === 'string' ? v : '')[0];
  const num = (v, min, max) => (typeof v === 'number' && v >= min && v <= max ? v : undefined);
  state = {
    from: hex(p.from) ?? DEFAULTS.from,
    to: hex(p.to) ?? DEFAULTS.to,
    steps: num(p.steps, STEPS_MIN, STEPS_MAX) ?? DEFAULTS.steps,
    space: SPACES.includes(p.space) ? p.space : DEFAULTS.space,
    even: p.even === true,
    shift: num(p.shift, -90, 90) ?? DEFAULTS.shift,
    mid: num(p.mid, -100, 100) ?? DEFAULTS.mid,
    compare: p.compare !== false,
  };
}
function savePrefs() {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(state)); } catch { /* not saved */ }
}

/* ---------- controls ---------- */
function writeControls() {
  $('fromPick').value = state.from.toLowerCase();
  $('toPick').value = state.to.toLowerCase();
  if (document.activeElement !== $('fromHex')) $('fromHex').value = state.from;
  if (document.activeElement !== $('toHex')) $('toHex').value = state.to;
  $('fromPick').parentElement.style.background = state.from;
  $('toPick').parentElement.style.background = state.to;
  $('steps').value = state.steps;
  $('space').value = state.space;
  $('even').checked = state.even;
  $('shift').value = state.shift;
  $('mid').value = state.mid;
  $('compare').checked = state.compare;
  $('stepsOut').textContent = state.steps;
  $('shiftOut').textContent = `${state.shift > 0 ? '+' : ''}${state.shift}°`;
  $('midOut').textContent = `${state.mid > 0 ? '+' : ''}${state.mid}%`;
  // Bending and comparing only make sense for the perceptual blends.
  const rgb = state.space === 'rgb';
  $('shift').disabled = $('mid').disabled = rgb;
  $('compareRow').hidden = rgb || !state.compare;
}

function update(changes, { save = true } = {}) {
  state = { ...state, ...changes };
  writeControls();
  render();
  if (save) savePrefs();
}

/* ---------- render ---------- */
function render() {
  const opts = { space: state.space, evenValues: state.even, hueShift: state.shift, midChroma: state.mid / 100 };
  colors = ramp(state.from, state.to, state.steps, opts);
  const n = colors.length;
  const sw = $('swatches');
  sw.classList.toggle('many', n > 9);
  sw.replaceChildren(...colors.map(hex => {
    const card = el('div', 'sw');
    card.style.background = hex;
    card.style.color = textOn(hex);
    const top = el('div', 'top');
    top.append(el('div', 'vlab', t('common.value')), el('div', 'v', valueOfHex(hex).toFixed(1)));
    const hexBtn = button('hex', hex);
    hexBtn.title = t('common.copy');
    hexBtn.addEventListener('click', () => copy(hex, t('common.copied', { hex })));
    const bottom = el('div', 'bottom');
    bottom.append(hexBtn);
    card.append(top, bottom);
    return card;
  }));

  if (state.compare && state.space !== 'rgb') {
    const plain = ramp(state.from, state.to, state.steps, { space: 'rgb', evenValues: state.even });
    $('rgbStrip').replaceChildren(...plain.map(hex => { const s = el('span'); s.style.background = hex; s.title = hex; return s; }));
  }

  const vs = colors.map(valueOfHex);
  $('grey').replaceChildren(...vs.map(v => { const s = el('span'); s.style.background = greyHex(v); return s; }));
  showGap($('gapInfo'), minGap(vs));

  const tg = $('toGenerator');
  tg.disabled = n > MAX_COLORS;
  tg.title = n > MAX_COLORS ? t('ramp.genMax', { max: MAX_COLORS }) : t('common.genContinue');
}

/* ---------- events ---------- */
for (const end of ['from', 'to']) {
  $(end + 'Pick').addEventListener('input', () => update({ [end]: $(end + 'Pick').value.toUpperCase() }, { save: false }));
  $(end + 'Pick').addEventListener('change', savePrefs);
  $(end + 'Hex').addEventListener('change', () => {
    const input = $(end + 'Hex');
    const [hex] = parseHexList(input.value.includes('#') ? input.value : '#' + input.value.trim());
    if (!hex) { toast(t('create.invalidHex')); input.value = state[end]; return; }
    update({ [end]: hex });
  });
  $(end + 'Hex').addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); });
}
$('swapBtn').addEventListener('click', () => {
  update({ from: state.to, to: state.from });
  announce(t('ramp.swapped'));
});
$('steps').addEventListener('input', () => update({ steps: +$('steps').value }, { save: false }));
$('shift').addEventListener('input', () => update({ shift: +$('shift').value }, { save: false }));
$('mid').addEventListener('input', () => update({ mid: +$('mid').value }, { save: false }));
['steps', 'shift', 'mid'].forEach(id => $(id).addEventListener('change', savePrefs));
$('space').addEventListener('change', () => update({ space: $('space').value }));
$('even').addEventListener('change', () => update({ even: $('even').checked }));
$('compare').addEventListener('change', () => update({ compare: $('compare').checked }));

$('resetBtn').addEventListener('click', () => {
  update({ ...DEFAULTS });
  toast(t('common.resetDone'));
});

$('copyAll').addEventListener('click', () => copy(colors.join('\n'), t('common.hexCopied')));
$('exportCsp').addEventListener('click', async () => {
  try {
    const zip = makeZip([
      { name: 'palettekit-rampa.aco', data: buildAco(colors) },
      { name: 'palettekit-rampa.png', data: await palettePng(colors) },
    ]);
    download(zip, 'palettekit-rampa.zip', 'application/zip');
    toast(t('common.acoDownloaded'));
  } catch { toast(t('common.exportFailed')); }
});
$('toCreator').addEventListener('click', () => { location.href = '/crear/?' + hexListParam(colors); });
$('toGenerator').addEventListener('click', () => { location.href = '/?' + paletteParam(colors); });

/* ---------- start ---------- */
loadPrefs();
writeControls();
render();
