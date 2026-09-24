// Icons from the shared sprite (public/icons.svg, Lucide). In HTML the same
// markup is written by hand: <svg class="icon" aria-hidden="true"><use href="/icons.svg#name"/></svg>

const SVG_NS = 'http://www.w3.org/2000/svg';

export function icon(name) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `/icons.svg#${name}`);
  svg.append(use);
  return svg;
}

// Swaps the icon inside an element that already has one.
export function setIcon(el, name) {
  el.querySelector('svg.icon use')?.setAttribute('href', `/icons.svg#${name}`);
}
