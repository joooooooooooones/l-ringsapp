'use strict';

// Gør appen brugbar uden internet. Filerne vises fra cachen med det samme,
// og opdateres i baggrunden, så en ny version ses næste gang appen åbnes.
const CACHE = 'stav-og-regn-v9';
const ASSETS = [
  './',
  'index.html',
  'css/style.css',
  'js/data.js',
  'js/logic.js',
  'js/app.js',
  'fonts/andika-400.woff2',
  'fonts/andika-700.woff2',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
];

// Lydfilerne står i audio/manifest.json og gemmes også, så oplæsningen virker offline.
async function audioFiles() {
  try {
    const res = await fetch('audio/manifest.json', { cache: 'no-store' });
    const { clips } = await res.json();
    return ['audio/manifest.json', ...clips.map((k) => `audio/${k}.mp3`)];
  } catch (e) {
    return [];
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(ASSETS);
    await Promise.all((await audioFiles()).map((f) => cache.add(f).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const fresh = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached);
      if (cached) {
        event.waitUntil(fresh);
        return cached;
      }
      return fresh;
    }),
  );
});
