// Shared markup (partials/*.html) copied into every page between markers:
//   <!-- shared:NAME --> … <!-- /shared:NAME -->
// The result is committed as plain HTML: no build step at runtime or in CI.
//
//   npm run sync           rewrite the pages
//   node scripts/partials.mjs --check   exit 1 if a page is out of date
//
// In the sidebar, the link to the page's own tool gets aria-current="page".

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PARTIALS = ['head', 'sidebar', 'topbar'];

export function loadPartials(root = ROOT) {
  return Object.fromEntries(PARTIALS.map(name =>
    [name, fs.readFileSync(path.join(root, 'partials', name + '.html'), 'utf8').replace(/\s+$/, '')]));
}

// public/foto/index.html → "/foto/"; public/index.html → "/"
export const pagePath = rel => '/' + rel.replace(/\\/g, '/').replace(/index\.html$/, '');

export function pages(root = ROOT) {
  const out = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === 'index.html') out.push(path.relative(path.join(root, 'public'), full));
    }
  };
  walk(path.join(root, 'public'));
  return out.sort();
}

export function syncPage(html, urlPath, partials) {
  let out = html;
  for (const name of PARTIALS) {
    const open = `<!-- shared:${name} -->`, close = `<!-- /shared:${name} -->`;
    const a = out.indexOf(open), b = out.indexOf(close);
    if (a < 0 || b < a) throw new Error(`missing markers for "${name}"`);
    let body = partials[name];
    if (name === 'sidebar') {
      const link = `<a href="${urlPath}">`;
      if (!body.includes(link)) throw new Error(`the sidebar has no link to ${urlPath}`);
      body = body.replace(link, `<a href="${urlPath}" aria-current="page">`);
    }
    out = out.slice(0, a + open.length) + '\n' + body + '\n' + out.slice(b);
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const check = process.argv.includes('--check');
  const partials = loadPartials();
  let stale = 0;
  for (const rel of pages()) {
    const file = path.join(ROOT, 'public', rel);
    const html = fs.readFileSync(file, 'utf8');
    const synced = syncPage(html, pagePath(rel), partials);
    if (synced === html) continue;
    stale++;
    if (check) console.error(`out of date: public/${rel}`);
    else { fs.writeFileSync(file, synced); console.log(`updated: public/${rel}`); }
  }
  if (check && stale) { console.error('Run: npm run sync'); process.exit(1); }
  if (!stale) console.log('all pages up to date');
}
