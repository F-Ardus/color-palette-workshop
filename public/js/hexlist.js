// Reading and writing lists of hex colors: pasted text, URL parameters.
// Pure; shared by any tool that takes a free-length palette.

export const LIST_MAX = 24;

// #RRGGBB (optionally #RRGGBBAA, alpha dropped) with or without "#", or #RGB
// with the "#" (without it, three letters are too often just a word).
const HEX_TOKEN = /#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3})\b|\b([0-9a-f]{8}|[0-9a-f]{6})\b/gi;

function normalize(digits) {
  const d = digits.length === 3 ? [...digits].map(c => c + c).join('') : digits.slice(0, 6);
  return '#' + d.toUpperCase();
}

// Every hex color in a piece of text, in order, up to max. Accepts the output
// of "Copiar hex" (one per line), CSS, comma lists, URLs...
export function parseHexList(text, max = LIST_MAX) {
  if (typeof text !== 'string') return [];
  const out = [];
  for (const m of text.matchAll(HEX_TOKEN)) {
    out.push(normalize(m[1] ?? m[2]));
    if (out.length >= max) break;
  }
  return out;
}

// URL form: colors=RRGGBB,RRGGBB,... (no "#", which would start a fragment).
export const hexListParam = cols => 'colors=' + cols.map(h => h.slice(1)).join(',');

export function colorsFromParam(raw, max = LIST_MAX) {
  if (typeof raw !== 'string' || !raw) return [];
  const parts = raw.split(',').map(s => s.trim());
  if (parts.some(p => !/^[0-9a-f]{6}$/i.test(p))) return [];
  return parts.slice(0, max).map(p => '#' + p.toUpperCase());
}
