// localStorage persistence. Everything read back is validated: a corrupt or
// outdated entry falls back to defaults instead of breaking the page.

import { isHex } from './color.js';
import { DISTRIBUTIONS, HARMONIES, TEMPERATURES } from './palette.js';

const SETTINGS_KEY = 'ev-settings';
const HISTORY_KEY = 'ev-history';
export const HISTORY_MAX = 8;
export const MIN_COLORS = 3;
export const MAX_COLORS = 9;

export const DEFAULTS = Object.freeze({
  count: 5, vHi: 9, vLo: 1, dist: 'linear', harmony: 'random', temp: 'none',
  sat: 55, jit: 30, mute: false, bw: false,
});

const num = (v, min, max, step, fallback) => {
  const x = Number(v);
  if (v === null || v === '' || !Number.isFinite(x) || x < min || x > max) return fallback;
  return Math.round(x / step) * step;
};
const oneOf = (v, list, fallback) => list.includes(v) ? v : fallback;

const cleanPalette = cols =>
  Array.isArray(cols) && cols.length >= MIN_COLORS && cols.length <= MAX_COLORS && cols.every(isHex)
    ? cols.map(h => h.toUpperCase())
    : null;

// Accepts both the current shape and the original one (values stored as input
// strings, no `locked` or `bw`). Returns {settings, palette}; palette may be null.
export function sanitizeSettings(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const settings = {
    count: num(s.count, MIN_COLORS, MAX_COLORS, 1, DEFAULTS.count),
    vHi: num(s.vHi, 5, 10, 0.5, DEFAULTS.vHi),
    vLo: num(s.vLo, 0, 5, 0.5, DEFAULTS.vLo),
    dist: oneOf(s.dist, DISTRIBUTIONS, DEFAULTS.dist),
    harmony: oneOf(s.harmony, HARMONIES, DEFAULTS.harmony),
    temp: oneOf(s.temp, TEMPERATURES, DEFAULTS.temp),
    sat: num(s.sat, 0, 100, 1, DEFAULTS.sat),
    jit: num(s.jit, 0, 100, 1, DEFAULTS.jit),
    mute: s.mute === true,
    bw: s.bw === true,
  };
  if (settings.vHi <= settings.vLo) { settings.vHi = DEFAULTS.vHi; settings.vLo = DEFAULTS.vLo; }

  const colors = cleanPalette(s.colors);
  let palette = null;
  if (colors) {
    const locked = Array.isArray(s.locked) && s.locked.length === colors.length
      ? s.locked.map(l => l === true)
      : colors.map(() => false);
    palette = { colors, locked };
    settings.count = colors.length;
  }
  return { settings, palette };
}

export function sanitizeHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(cleanPalette).filter(Boolean).slice(0, HISTORY_MAX);
}

const keyOf = cols => cols.join(',');

// New history with `cols` on top, without duplicates, capped at HISTORY_MAX.
export function addToHistory(history, cols) {
  const key = keyOf(cols);
  return [cols.slice(), ...history.filter(h => keyOf(h) !== key)].slice(0, HISTORY_MAX);
}

export function removeFromHistory(history, cols) {
  const key = keyOf(cols);
  return history.filter(h => keyOf(h) !== key);
}

// Storage access can throw (private mode, blocked site data); treat that as empty.
const read = (storage, key) => {
  try { return JSON.parse(storage.getItem(key)); } catch { return null; }
};
const write = (storage, key, value) => {
  try { storage.setItem(key, JSON.stringify(value)); } catch { /* not persisted, still usable */ }
};
const defaultStorage = () => {
  try { return globalThis.localStorage; } catch { return null; }
};

export function load(storage = defaultStorage()) {
  if (!storage) return { ...sanitizeSettings(null), history: [] };
  return { ...sanitizeSettings(read(storage, SETTINGS_KEY)), history: sanitizeHistory(read(storage, HISTORY_KEY)) };
}

export function saveSettings(settings, palette, storage = defaultStorage()) {
  if (storage) write(storage, SETTINGS_KEY, { ...settings, colors: palette.colors, locked: palette.locked });
}

export function saveHistory(history, storage = defaultStorage()) {
  if (storage) write(storage, HISTORY_KEY, history);
}
