// Sidebar shared by every tool page. On narrow screens it becomes a drawer
// opened from the top bar; on wide screens it is always visible.

const menu = document.getElementById('menuBtn');
const sidebar = document.getElementById('sidebar');
const scrim = document.getElementById('scrim');
const wide = matchMedia('(min-width: 1024px)');

const isOpen = () => sidebar.classList.contains('open');

function setOpen(open, { returnFocus = false } = {}) {
  sidebar.classList.toggle('open', open);
  scrim.hidden = !open;
  menu.setAttribute('aria-expanded', String(open));
  menu.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
  if (open) sidebar.querySelector('a')?.focus();
  else if (returnFocus) menu.focus();
}

menu.addEventListener('click', () => setOpen(!isOpen()));
scrim.addEventListener('click', () => setOpen(false, { returnFocus: true }));
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && isOpen()) setOpen(false, { returnFocus: true });
});
wide.addEventListener('change', e => { if (e.matches) setOpen(false); });
