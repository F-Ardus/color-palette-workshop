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

/* ---------- collapsible controls ---------- */
// Pages with a controls panel (#controls): on narrow layouts it collapses into
// #controlsToggle above the results (the toggle is only displayed there).
$('controlsToggle')?.addEventListener('click', () => {
  const open = $('controls').classList.toggle('open');
  $('controlsToggle').setAttribute('aria-expanded', String(open));
});

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

/* ---------- install & offline ---------- */
// The service worker caches the whole site so it works offline (see /sw.js).
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

// Where the browser offers installing, do it from the settings menu instead of
// its own banner.
let installPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  installPrompt = e;
  $('installBtn').hidden = false;
});
$('installBtn').addEventListener('click', async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice.catch(() => {});
  installPrompt = null;
  $('installBtn').hidden = true;
  setSettings(false);
});
window.addEventListener('appinstalled', () => { $('installBtn').hidden = true; });

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (settingsOpen()) setSettings(false, { returnFocus: true });
  else if (isOpen()) setOpen(false, { returnFocus: true });
});
