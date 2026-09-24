import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addToHistory, DEFAULTS, HISTORY_MAX, load, removeFromHistory, sanitizeHistory, sanitizeSettings, saveSettings,
} from '../public/js/storage.js';

const PAL = ['#F2E3B3', '#D98E73', '#4F7A6B', '#6B3A5A', '#1E1B3A'];

function memoryStorage(init = {}) {
  const data = { ...init };
  return { getItem: k => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, data };
}

test('reads the original format (input strings, no locks)', () => {
  const legacy = {
    count: '5', vHi: '8.5', vLo: '0.5', dist: 'dark', harmony: 'triad', temp: 'warmLight',
    sat: '40', jit: '10', mute: true, colors: PAL.map(h => h.toLowerCase()),
  };
  const { settings, palette } = sanitizeSettings(legacy);
  assert.deepEqual(settings, { count: 5, vHi: 8.5, vLo: 0.5, dist: 'dark', harmony: 'triad', temp: 'warmLight', sat: 40, jit: 10, mute: true, bw: false });
  assert.deepEqual(palette, { colors: PAL, locked: [false, false, false, false, false] });
});

test('bad values fall back to defaults', () => {
  const { settings, palette } = sanitizeSettings({
    count: 'x', vHi: 42, vLo: -1, dist: 'renamed', harmony: null, temp: {}, sat: 101, jit: '', mute: 'yes',
    colors: ['#FFF', 'nope'],
  });
  assert.deepEqual(settings, { ...DEFAULTS });
  assert.equal(palette, null);
  assert.deepEqual(sanitizeSettings(null).settings, { ...DEFAULTS });
  assert.deepEqual(sanitizeSettings('garbage').settings, { ...DEFAULTS });
});

test('an inverted value range resets to the defaults', () => {
  const { settings } = sanitizeSettings({ vHi: 5, vLo: 5 });
  assert.equal(settings.vHi, DEFAULTS.vHi);
  assert.equal(settings.vLo, DEFAULTS.vLo);
});

test('the count follows the stored palette', () => {
  const { settings, palette } = sanitizeSettings({ count: 9, colors: PAL.slice(0, 3), locked: [true, false, true] });
  assert.equal(settings.count, 3);
  assert.deepEqual(palette.locked, [true, false, true]);
});

test('history drops invalid entries and caps its length', () => {
  const raw = [PAL, 'x', ['#000'], [...PAL.slice(0, 2), '<b>'], ...Array.from({ length: 12 }, () => PAL)];
  const h = sanitizeHistory(raw);
  assert.equal(h.length, HISTORY_MAX);
  assert.ok(h.every(p => p.length === 5));
  assert.deepEqual(sanitizeHistory({}), []);
});

test('addToHistory moves duplicates to the top; removeFromHistory takes one out', () => {
  const a = PAL, b = [...PAL].reverse();
  let h = addToHistory([], a);
  h = addToHistory(h, b);
  h = addToHistory(h, a);
  assert.deepEqual(h, [a, b]);
  assert.deepEqual(removeFromHistory(h, a), [b]);
});

test('load and saveSettings round-trip, and survive a throwing storage', () => {
  const store = memoryStorage();
  saveSettings({ ...DEFAULTS, bw: true }, { colors: PAL, locked: [true, false, false, false, false] }, store);
  const loaded = load(store);
  assert.equal(loaded.settings.bw, true);
  assert.deepEqual(loaded.palette.locked, [true, false, false, false, false]);

  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.deepEqual(load(broken), { settings: { ...DEFAULTS }, palette: null, history: [] });
  assert.doesNotThrow(() => saveSettings(DEFAULTS, { colors: PAL, locked: [] }, broken));
});
