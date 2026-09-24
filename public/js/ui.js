// Small DOM helpers shared by every tool page. Pages provide #toast and #announce.

import { icon } from './icons.js';
import { t } from './i18n.js';
import { GAP_WARN } from './palette.js';

export function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text != null) e.textContent = text;
  return e;
}

export function button(className, text) {
  const b = el('button', className, text);
  b.type = 'button';
  return b;
}

// Square icon-only button; the label doubles as tooltip.
export function iconButton(className, name, label) {
  const b = button('tool ' + className);
  b.append(icon(name));
  b.setAttribute('aria-label', label);
  b.title = label;
  return b;
}

let toastTimer;
export function toast(msg) {
  const box = document.getElementById('toast');
  box.textContent = msg;
  box.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.classList.remove('show'), 1800);
}

// For screen readers: a short summary instead of re-reading a whole grid.
export function announce(text) {
  document.getElementById('announce').textContent = text;
}

// The "smallest step between values" line, with a warning when two values
// are close enough to be mistaken for each other.
export function showGap(target, gap) {
  if (gap < GAP_WARN) target.replaceChildren(el('strong', null, t('gap.warnStrong')), ' ' + t('gap.warn', { gap: gap.toFixed(1) }));
  else target.textContent = t('gap.min', { gap: gap.toFixed(1) });
}

export function copy(text, msg) {
  try { navigator.clipboard.writeText(text).then(() => toast(msg), () => toast(text)); } catch { toast(text); }
}
