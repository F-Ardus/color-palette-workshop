// Sidebar shared by every tool page. On narrow screens it becomes a drawer
// opened from the top bar; on wide screens it is always visible. At its foot,
// a settings popover (for now: the language).

import { lang, LANGS, setLang, t } from './i18n.js';

const $ = id => document.getElementById(id);
const menu = $('menuBtn');
const sidebar = $('sidebar');
const scrim = $('scrim');
const wide = matchMedia('(min-width: 1024px)');

/* ---------- drawer ---------- */
const isOpen = () => sidebar.classList.contains('open');

function setOpen(open, { returnFocus = false } = {}) {
  sidebar.classList.toggle('open', open);
  scrim.hidden = !open;
  menu.setAttribute('aria-expanded', String(open));
  menu.setAttribute('aria-label', open ? t('nav.closeMenu') : t('nav.openMenu'));
  if (open) sidebar.querySelector('a')?.focus();
  else if (returnFocus) menu.focus();
}

menu.addEventListener('click', () => setOpen(!isOpen()));
scrim.addEventListener('click', () => setOpen(false, { returnFocus: true }));
wide.addEventListener('change', e => { if (e.matches) setOpen(false); });

/* ---------- settings ---------- */
const settingsBtn = $('settingsBtn');
const panel = $('settingsPanel');
const settingsOpen = () => !panel.hidden;

function setSettings(open, { returnFocus = false } = {}) {
  panel.hidden = !open;
  settingsBtn.setAttribute('aria-expanded', String(open));
  if (open) panel.querySelector('input:checked')?.focus();
  else if (returnFocus) settingsBtn.focus();
}

// One radio per language, named in its own language.
$('langOptions').replaceChildren(...Object.entries(LANGS).map(([code, name]) => {
  const label = document.createElement('label');
  label.className = 'lang-option';
  const input = document.createElement('input');
  Object.assign(input, { type: 'radio', name: 'lang', value: code, checked: code === lang });
  input.addEventListener('change', () => setLang(code));
  label.lang = code;
  label.append(input, ' ' + name);
  return label;
}));

settingsBtn.addEventListener('click', () => setSettings(!settingsOpen()));
document.addEventListener('click', e => {
  if (settingsOpen() && !e.target.closest('.settings')) setSettings(false);
});

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (settingsOpen()) setSettings(false, { returnFocus: true });
  else if (isOpen()) setOpen(false, { returnFocus: true });
});
