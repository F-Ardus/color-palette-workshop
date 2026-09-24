// Palette generation: target values, hue harmonies, temperature bias and locks.
// Pure functions; randomness comes in through `rng` so tests can seed it.
//
// Each color comes from a recipe: {hue, jitter, pick}. `jitter` (-1..1) is where
// it sits in the saturation variation and `pick` (0..1) where it sits in the
// value range when values aren't scaled. Recipes don't depend on the settings,
// so a palette can be rebuilt with new settings without re-rolling its hues.

import { hueOfHex, makeColor, satOfHex, valueOfHex } from './color.js';

export const DISTRIBUTIONS = ['linear', 'dark', 'light'];
export const HARMONIES = ['random', 'analogous', 'complementary', 'split', 'triad', 'mono'];
export const TEMPERATURES = ['none', 'warmLight', 'coolLight'];

// Two values closer than this are hard to tell apart in a drawing.
export const GAP_WARN = 0.9;

const KEY_CURVE = 0.62;
const wrap = h => ((h % 360) + 360) % 360;
const clamp01 = v => Math.min(1, Math.max(0, v));
const between = (rng, a, b) => a + rng() * (b - a);

// Target values from lightest (hi) to darkest (lo). Low key packs more steps
// into the shadows; high key is its exact mirror and packs them into the lights.
export function targetValues(n, hi, lo, dist) {
  return Array.from({ length: n }, (_, i) => {
    let t = n === 1 ? 0 : i / (n - 1);
    if (dist === 'dark') t = Math.pow(t, KEY_CURVE);
    if (dist === 'light') t = 1 - Math.pow(1 - t, KEY_CURVE);
    return hi + (lo - hi) * t;
  });
}

export function hues(n, mode, base, rng = Math.random) {
  return Array.from({ length: n }, (_, i) => {
    const t = n === 1 ? 0 : i / (n - 1);
    let h;
    switch (mode) {
      case 'analogous': h = base + (t - 0.5) * 70 + between(rng, -6, 6); break;
      case 'complementary': h = (t < 0.5 ? base : base + 180) + between(rng, -14, 14); break;
      case 'split': h = base + [0, 150, 210][i % 3] + between(rng, -8, 8); break;
      case 'triad': h = base + [0, 120, 240][i % 3] + between(rng, -8, 8); break;
      case 'mono': h = base + between(rng, -6, 6); break;
      default: h = between(rng, 0, 360);
    }
    return wrap(h);
  });
}

// Hue ramps for the temperature bias, from the lightest step to the darkest,
// as [start, signed sweep]. The sweep is explicit (through reds and magentas):
// both ramps span ~180°, so "the shortest way round" would flip direction on
// a tiny tweak.
const RAMPS = { warmLight: [75, -170], coolLight: [230, 160] };
const PULL = 0.65;
// With a harmony picked, hues only drift toward the ramp so the harmony survives
// (a monochrome palette stays one hue, just warmer in the lights).
const MAX_DRIFT = 35;

// Pulls one hue toward the ramp at position t (0 = lightest, 1 = darkest).
function biasHue(h, t, ramp, harmony) {
  const d = ((ramp[0] + ramp[1] * t - h + 540) % 360) - 180;
  const shift = d * PULL;
  return wrap(h + (harmony === 'random' ? shift : Math.max(-MAX_DRIFT, Math.min(MAX_DRIFT, shift))));
}

export function applyTemperature(hs, temp, harmony) {
  const ramp = RAMPS[temp];
  if (!ramp) return hs;
  const n = hs.length;
  return hs.map((h, i) => biasHue(h, n === 1 ? 0 : i / (n - 1), ramp, harmony));
}

const JITTER_SPAN = 0.6;
const MUTE = 0.45;
const saturation = (settings, jitter) => clamp01(settings.sat / 100 + jitter * (settings.jit / 100) * JITTER_SPAN);
const scaled = settings => settings.scale !== false;
// Unscaled palettes can be left in the order the user arranged them; scaled ones
// are always light to dark.
const ordered = settings => scaled(settings) || settings.order !== false;

// Position of values[index] in light-to-dark order (0 = lightest). Ties keep
// their order in the list. With a palette that isn't sorted, "lightest" and
// "darkest" come from this, not from the position of the card.
export function rankOf(values, index) {
  const v = values[index];
  return values.filter((w, j) => w > v || (w === v && j < index)).length;
}
const isExtreme = (values, index) => {
  const r = rankOf(values, index);
  return r === 0 || r === values.length - 1;
};

// n fresh recipes, ordered from the lightest color to the darkest (the
// temperature bias depends on that order).
function rollRecipes(settings, rng) {
  const n = settings.count;
  const hs = applyTemperature(hues(n, settings.harmony, between(rng, 0, 360), rng), settings.temp, settings.harmony);
  const picks = Array.from({ length: n }, () => rng()).sort((a, b) => b - a);
  return hs.map((hue, i) => ({ hue, jitter: between(rng, -1, 1), pick: picks[i] }));
}

// The recipe that reproduces an existing color under these settings. Used for
// palettes that were saved or recovered from the history without recipes.
export function recipeFromHex(hex, settings) {
  const jit = settings.jit / 100 * JITTER_SPAN;
  const jitter = jit > 0 ? Math.max(-1, Math.min(1, (satOfHex(hex) - settings.sat / 100) / jit)) : 0;
  const span = settings.vHi - settings.vLo;
  return { hue: hueOfHex(hex), jitter, pick: clamp01((valueOfHex(hex) - settings.vLo) / span) };
}

const recipesOf = (palette, settings) =>
  Array.isArray(palette.recipes) && palette.recipes.length === palette.colors.length
    ? palette.recipes
    : palette.colors.map(hex => recipeFromHex(hex, settings));

// Stretches or shrinks a light-to-dark list of recipes to n, interpolating
// between neighbours so the palette keeps its character.
export function resampleRecipes(recipes, n) {
  const m = recipes.length;
  if (m === n) return recipes;
  return Array.from({ length: n }, (_, i) => {
    const t = n === 1 || m === 1 ? 0 : i / (n - 1) * (m - 1);
    const k = Math.floor(t), f = t - k;
    const a = recipes[k], b = recipes[Math.min(k + 1, m - 1)];
    const dh = ((b.hue - a.hue + 540) % 360) - 180;
    return { hue: wrap(a.hue + dh * f), jitter: a.jitter + (b.jitter - a.jitter) * f, pick: a.pick + (b.pick - a.pick) * f };
  });
}

// Realizes recipes as colors. Locked colors from `previous` are kept as they are.
function buildPalette(settings, recipes, previous) {
  const n = recipes.length;
  const { vHi, vLo } = settings;
  const targets = scaled(settings)
    ? targetValues(n, vHi, vLo, settings.dist)
    : recipes.map(r => vLo + (vHi - vLo) * r.pick);

  // Each locked color takes the free slot whose target is closest to its own
  // value, so locks survive changes to the count or the value range.
  const slots = new Array(n).fill(null);
  const prevRecipes = previous.colors.length ? recipesOf(previous, settings) : [];
  const kept = previous.colors
    .map((hex, i) => ({ hex, v: valueOfHex(hex), recipe: prevRecipes[i], locked: previous.locked[i] }))
    .filter(c => c.locked)
    .sort((a, b) => b.v - a.v);
  let dropped = 0;
  for (const c of kept) {
    let best = -1;
    for (let i = 0; i < n; i++) {
      if (slots[i]) continue;
      if (best < 0 || Math.abs(targets[i] - c.v) < Math.abs(targets[best] - c.v)) best = i;
    }
    if (best < 0) dropped++;
    else slots[best] = { hex: c.hex, locked: true, recipe: c.recipe };
  }

  for (let i = 0; i < n; i++) {
    if (slots[i]) continue;
    const r = recipes[i];
    let sf = saturation(settings, r.jitter);
    if (settings.mute && isExtreme(targets, i)) sf *= MUTE;
    slots[i] = { hex: makeColor(targets[i], r.hue, sf), locked: false, recipe: r };
  }

  // A locked color can sit off its slot's target; sorting keeps the scale in order.
  // Unsorted palettes keep their slot order, which is the order of the recipes.
  const built = { colors: slots.map(s => s.hex), locked: slots.map(s => s.locked), recipes: slots.map(s => s.recipe) };
  return { ...(ordered(settings) ? sortPalette(built) : built), dropped };
}

// Orders a palette from lightest to darkest, carrying locks and recipes along.
// Stable, so colors with the same value keep their order.
export function sortPalette(palette) {
  const items = palette.colors
    .map((hex, i) => ({ hex, v: valueOfHex(hex), locked: palette.locked[i], recipe: palette.recipes?.[i] }))
    .sort((a, b) => b.v - a.v);
  return {
    colors: items.map(c => c.hex),
    locked: items.map(c => c.locked),
    recipes: palette.recipes ? items.map(c => c.recipe) : palette.recipes,
  };
}

const EMPTY = { colors: [], locked: [] };

// settings: {count, vHi, vLo, dist, scale, harmony, temp, sat (0-100), jit (0-100), mute}
// previous: the current palette {colors, locked, recipes?}; its locked colors are kept.
// Returns {colors, locked, recipes, dropped}, sorted from lightest to darkest
// unless the settings ask to keep an unscaled palette's own order.
export function generatePalette(settings, previous = EMPTY, rng = Math.random) {
  return buildPalette(settings, rollRecipes(settings, rng), previous);
}

// Same palette under new settings: the hues stay, everything else follows the
// settings. The count can change; recipes are stretched to fit.
export function adjustPalette(settings, previous) {
  return buildPalette(settings, resampleRecipes(recipesOf(previous, settings), settings.count), previous);
}

// Moves one color to a new value (unscaled palettes), keeping its hue and
// saturation. Not re-sorted, so the card being dragged stays put; call
// sortPalette once the value is settled (if the palette is kept in order).
export function setColorValue(settings, palette, index, value) {
  const recipes = recipesOf(palette, settings).slice();
  const recipe = { ...recipes[index], pick: clamp01((value - settings.vLo) / (settings.vHi - settings.vLo)) };
  recipes[index] = recipe;
  const values = palette.colors.map(valueOfHex);
  values[index] = value;
  let sf = saturation(settings, recipe.jitter);
  if (settings.mute && isExtreme(values, index)) sf *= MUTE;
  const colors = palette.colors.slice();
  colors[index] = makeColor(value, recipe.hue, sf);
  return { colors, locked: palette.locked.slice(), recipes };
}

// A reroll must land visibly away from the old hue.
const MIN_HUE_CHANGE = 30;

// Replaces one color with a new random hue and saturation offset at the same
// value; the rest of the palette is untouched. The temperature bias still
// applies at that color's place in the value order.
export function rerollColor(settings, palette, index, rng = Math.random) {
  const n = palette.colors.length;
  const recipes = recipesOf(palette, settings).slice();
  const old = recipes[index];
  const ramp = RAMPS[settings.temp];
  const values = palette.colors.map(valueOfHex);
  const t = n === 1 ? 0 : rankOf(values, index) / (n - 1);
  let hue = old.hue;
  for (let tries = 0; tries < 12 && hueDistance(hue, old.hue) < MIN_HUE_CHANGE; tries++) {
    hue = between(rng, 0, 360);
    if (ramp) hue = biasHue(hue, t, ramp, 'random');
  }
  const recipe = { hue, jitter: between(rng, -1, 1), pick: old.pick };
  recipes[index] = recipe;

  let sf = saturation(settings, recipe.jitter);
  if (settings.mute && isExtreme(values, index)) sf *= MUTE;
  const colors = palette.colors.slice();
  colors[index] = makeColor(valueFor(settings, n, index, palette.colors[index], old.pick), hue, sf);
  return { colors, locked: palette.locked.slice(), recipes, dropped: 0 };
}

const hueDistance = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

// The value a rerolled color keeps: the one its slot aims for, unless the color
// sits off it (e.g. a locked color shifted the scale), then its own value.
// Aiming at the target keeps repeated rerolls from drifting.
function valueFor(settings, n, index, hex, pick) {
  const own = valueOfHex(hex);
  const target = scaled(settings)
    ? targetValues(n, settings.vHi, settings.vLo, settings.dist)[index]
    : settings.vLo + (settings.vHi - settings.vLo) * pick;
  return Math.abs(target - own) < 0.1 ? target : own;
}

// Smallest distance between any two values, adjacent or not.
export function minGap(values) {
  const vs = [...values].sort((a, b) => b - a);
  let gap = Infinity;
  for (let i = 1; i < vs.length; i++) gap = Math.min(gap, vs[i - 1] - vs[i]);
  return gap;
}

// rank: the color's place in light-to-dark order (see rankOf). The extremes are
// always the highlight and the deepest dark; the steps in between are named by
// their actual value, so low and high key read right.
export function roleFor(rank, n, value) {
  if (rank === 0) return 'Luz alta';
  if (rank === n - 1) return 'Oscuro profundo';
  if (value >= 7.5) return 'Luz';
  if (value >= 5.75) return 'Medio claro';
  if (value >= 4.25) return 'Medio';
  if (value >= 2.5) return 'Medio oscuro';
  return 'Sombra';
}
