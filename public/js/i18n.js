// Translations. Strings live in /i18n/<lang>.json as flat "section.key" maps.
// Every page imports this module first: it loads the language (top-level
// await, so modules that import it can call t() right away), translates the
// markup and reveals the page.
//
// Markup: data-i18n="key" sets textContent; data-i18n-attr="attr:key,attr:key"
// sets attributes. Keep icons outside the translated element.

export const LANGS = { es: 'Español', en: 'English' };
export const DEFAULT_LANG = 'en';
const STORE_KEY = 'pk-lang';

// Keep in sync with the inline snippet in each page's <head>, which hides the
// page until it's translated when the language isn't the one in the markup.
function detect() {
  try {
    const saved = localStorage.getItem(STORE_KEY);
    if (saved in LANGS) return saved;
  } catch { /* no storage */ }
  for (const l of navigator.languages ?? [navigator.language]) {
    const code = (l || '').slice(0, 2).toLowerCase();
    if (code in LANGS) return code;
  }
  return DEFAULT_LANG;
}

export const lang = detect();

// The markup is written in Spanish, so es.json is also the fallback.
const MARKUP_LANG = 'es';
async function loadDict(code) {
  try {
    const res = await fetch(`/i18n/${code}.json`);
    return res.ok ? await res.json() : null;
  } catch { return null; }
}
const dict = (await loadDict(lang)) ?? (lang !== MARKUP_LANG ? await loadDict(MARKUP_LANG) : null) ?? {};
const loaded = Object.keys(dict).length > 0;

// t('create.removed', {hex}) → "#F2E3B3 borrado…". Missing keys show the key.
export function t(key, vars = {}) {
  const s = dict[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m));
}

// Plural pick: key_one for 1, key_other otherwise; {n} is filled in.
export const tn = (key, n, vars = {}) => t(`${key}_${n === 1 ? 'one' : 'other'}`, { n, ...vars });

export function translate(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-attr]').forEach(el => {
    for (const pair of el.dataset.i18nAttr.split(',')) {
      const [attr, key] = pair.split(':').map(s => s.trim());
      el.setAttribute(attr, t(key));
    }
  });
}

export function setLang(code) {
  if (!(code in LANGS) || code === lang) return;
  try { localStorage.setItem(STORE_KEY, code); } catch { /* only this visit */ }
  location.reload();
}

document.documentElement.lang = loaded ? lang : MARKUP_LANG;
// Without a dictionary the Spanish markup stays as it is.
if (loaded) translate();
document.documentElement.classList.remove('i18n-loading');
