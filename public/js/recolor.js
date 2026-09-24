// Recoloring an extracted palette with a generated harmony. Every color keeps
// its value and its saturation, so the image keeps its lights, shadows and
// muted areas; only hues change. Colors with similar hues in the image form a
// group and each group moves to one hue of the harmony, so the relations in the
// picture survive (all the skin stays one family, the background another).

import { hueOfHex, makeColor, satOfHex, valueOfHex } from './color.js';
import { applyTemperature } from './palette.js';

// Hues of each harmony, as offsets from a random base. "random" draws its own.
const ANCHORS = {
  mono: [0],
  analogous: [-35, 0, 35],
  complementary: [0, 180],
  split: [0, 150, 210],
  triad: [0, 120, 240],
};
const RANDOM_ANCHORS = 3;
// Below this saturation a color reads as grey; its hue doesn't define a group.
const GREY = 0.08;
// Share of a color's distance to its group's center hue that survives, capped,
// so a group stays one recognizable family but keeps some variation.
const SPREAD = 0.5;
const MAX_OFFSET = 20;

const wrap = h => ((h % 360) + 360) % 360;
const delta = (from, to) => ((to - from + 540) % 360) - 180;

function shuffle(list, rng) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Splits hues (with their indices) into g groups of neighbours on the color
// wheel, cutting at the g widest gaps. Returns arrays of {i, h}, each walked in
// wheel order.
export function groupHues(items, g) {
  const sorted = [...items].sort((a, b) => a.h - b.h);
  const m = sorted.length;
  if (!m) return [];
  if (m <= g) return sorted.map(x => [x]);
  const gaps = sorted.map((x, j) => ({ j, size: j === m - 1 ? sorted[0].h + 360 - x.h : sorted[j + 1].h - x.h }));
  const cuts = new Set(gaps.sort((a, b) => b.size - a.size).slice(0, g).map(x => x.j));
  const start = (Math.min(...cuts) + 1) % m;
  const groups = [];
  let current = [];
  for (let k = 0; k < m; k++) {
    const j = (start + k) % m;
    current.push(sorted[j]);
    if (cuts.has(j)) { groups.push(current); current = []; }
  }
  if (current.length) groups.push(current);
  return groups;
}

// colors: [{hex, lab, share}] light to dark (as extracted). Returns the same
// list with new hex values; `lab` stays the original so the image can still be
// mapped pixel by pixel to its cluster.
export function recolor(colors, { harmony = 'random', temp = 'none' } = {}, rng = Math.random) {
  if (!colors.length) return [];
  const info = colors.map(c => ({ h: hueOfHex(c.hex), s: satOfHex(c.hex), v: valueOfHex(c.hex) }));
  const base = rng() * 360;
  const offsets = ANCHORS[harmony] ?? Array.from({ length: RANDOM_ANCHORS }, () => rng() * 360);
  const anchors = shuffle(offsets.map(o => wrap(base + o)), rng);

  const chromatic = info.map((x, i) => ({ i, h: x.h })).filter(x => info[x.i].s >= GREY);
  const hues = info.map(() => anchors[0]);
  groupHues(chromatic, anchors.length).forEach((group, gi) => {
    // Center of the group, measured along the wheel from its first member.
    const center = wrap(group[0].h + group.reduce((sum, x) => sum + delta(group[0].h, x.h), 0) / group.length);
    for (const x of group) {
      const offset = Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, delta(center, x.h) * SPREAD));
      hues[x.i] = wrap(anchors[gi] + offset);
    }
  });

  // Colors are light to dark, which is the order the temperature bias expects.
  const biased = applyTemperature(hues, temp, harmony);
  return colors.map((c, i) => ({ ...c, hex: makeColor(info[i].v, biased[i], info[i].s) }));
}

// A reroll must land visibly away from the old hue.
const MIN_HUE_CHANGE = 30;
// Greys get this much saturation when rerolled, or the new hue wouldn't show.
const REROLL_GREY_SAT = 0.3;

// New hue for one color; value, saturation, share and lab stay. The rest of
// the list is untouched. The temperature bias applies at the color's place in
// the (light to dark) list.
export function rerollOne(colors, index, { temp = 'none' } = {}, rng = Math.random) {
  const c = colors[index];
  const old = hueOfHex(c.hex), v = valueOfHex(c.hex);
  const s = Math.max(satOfHex(c.hex), satOfHex(c.hex) < GREY ? REROLL_GREY_SAT : 0);
  let h = old;
  for (let tries = 0; tries < 12 && Math.abs(delta(old, h)) < MIN_HUE_CHANGE; tries++) h = rng() * 360;
  const hues = colors.map((x, i) => (i === index ? h : hueOfHex(x.hex)));
  h = applyTemperature(hues, temp, 'random')[index];
  return colors.map((x, i) => (i === index ? { ...x, hex: makeColor(v, h, s) } : x));
}
