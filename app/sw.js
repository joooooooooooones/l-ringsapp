'use strict';

// Gør appen brugbar uden internet. Filerne vises fra cachen med det samme,
// og opdateres i baggrunden, så en ny version ses næste gang appen åbnes.
const CACHE = 'stav-og-regn-v11';
const ASSETS = [
  './',
  'index.html',
  'css/style.css',
  'js/data.js',
  'js/logic.js',
  'js/recordings.js',
  'js/app.js',
  'fonts/andika-400.woff2',
  'fonts/andika-700.woff2',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
];

// Lægger én fil i cachen: fra nettet, eller – hvis nettet svigter – fra den forrige versions cache.
// Så kan en opdatering på et ustabilt net aldrig efterlade appen uden lyd eller filer.
async function store(cache, url) {
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (res.ok) return await cache.put(url, res);
  } catch (e) { /* intet net: prøv den gamle cache */ }
  const old = await caches.match(url, { ignoreSearch: true });
  if (old) return cache.put(url, old);
  throw new Error(`Mangler ${url}`);
}

// Lydfilerne står i audio/manifest.json (fra nettet, ellers fra en tidligere cache).
async function audioFiles() {
  for (const get of [() => fetch('audio/manifest.json', { cache: 'no-store' }), () => caches.match('audio/manifest.json')]) {
    try {
      const res = await get();
      if (res && res.ok) return ['audio/manifest.json', ...(await res.json()).clips.map((k) => `audio/${k}.mp3`)];
    } catch (e) { /* prøv næste */ }
  }
  return [];
}

// Lydfilerne hentes nogle ad gangen; de, der ikke kan hentes, tælles som manglende.
async function storeAll(cache, files, onProgress) {
  let missing = 0;
  for (let i = 0; i < files.length; i += 8) {
    const res = await Promise.allSettled(files.slice(i, i + 8).map((f) => store(cache, f)));
    missing += res.filter((r) => r.status === 'rejected').length;
    if (onProgress) onProgress(Math.min(i + 8, files.length));
  }
  return missing;
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Selve appen skal med; mangler en af dem, beholdes den gamle version, til nettet virker.
    await Promise.all(ASSETS.map((f) => store(cache, f)));
    await storeAll(cache, await audioFiles());
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

// Status for brug uden internet, til voksensiden: hvor mange filer er gemt på enheden?
// fill: hent de manglende nu (når der er net), og meld fremdrift undervejs.
async function offlineStatus(fill, port) {
  const cache = await caches.open(CACHE);
  const files = [...ASSETS, ...(await audioFiles())];
  const missingFiles = [];
  for (const f of files) if (!(await cache.match(f))) missingFiles.push(f);
  let missing = missingFiles.length;
  if (fill && missing) {
    port.postMessage({ total: files.length, missing, filling: true, done: 0, todo: missing });
    missing = await storeAll(cache, missingFiles, (done) => port.postMessage({ total: files.length, missing, filling: true, done, todo: missingFiles.length }));
  }
  port.postMessage({ total: files.length, missing, filling: false, version: CACHE });
}

self.addEventListener('message', (event) => {
  const msg = event.data;
  if (msg && msg.type === 'offline-status' && event.ports[0]) {
    event.waitUntil(offlineStatus(!!msg.fill, event.ports[0]).catch(() => event.ports[0].postMessage({ error: true })));
  }
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
