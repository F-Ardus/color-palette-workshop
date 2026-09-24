// Service worker: makes Palettekit installable and usable offline.
//
// Network first: online, every request goes to the network (so a deploy is
// picked up right away, never mixing files of two versions) and the answer is
// kept in the cache; offline, the cached copy is served. Everything below is
// cached on install, so every tool works offline after the first visit.
// test/sw.test.js checks that this list covers every published file.

const CACHE = 'palettekit';
const PRECACHE = [
  '/',
  '/foto/',
  '/crear/',
  '/values/',
  '/rampas/',
  '/styles.css',
  '/icons.svg',
  '/logo.svg',
  '/manifest.webmanifest',
  '/favicon-32.png',
  '/apple-touch-icon.png',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/i18n/es.json',
  '/i18n/en.json',
  '/js/app.js',
  '/js/color.js',
  '/js/crear-app.js',
  '/js/export.js',
  '/js/extract.js',
  '/js/foto-app.js',
  '/js/hexlist.js',
  '/js/i18n.js',
  '/js/icons.js',
  '/js/image-input.js',
  '/js/nav.js',
  '/js/notan.js',
  '/js/palette-image.js',
  '/js/palette.js',
  '/js/ramp.js',
  '/js/rampas-app.js',
  '/js/recolor.js',
  '/js/sphere.js',
  '/js/storage.js',
  '/js/ui.js',
  '/js/values-app.js',
];
// The web fonts come from Google; they're cached as they're used.
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && !FONT_HOSTS.includes(url.hostname)) return;

  // Pages are stored without their query (?colors=…), so a palette link still
  // opens its tool offline; the page reads the palette from the address itself.
  const key = req.mode === 'navigate' ? url.origin + url.pathname : req;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') cache.put(key, res.clone());
      return res;
    } catch {
      const cached = await cache.match(key);
      if (cached) return cached;
      if (req.mode === 'navigate') return (await cache.match(url.origin + '/')) ?? Response.error();
      return Response.error();
    }
  })());
});
