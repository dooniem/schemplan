// Service worker for den installerte appen. Den lagrer bare appens egne filer (kode, stil,
// skrift, ikoner), så appen kan startes uten nett. Planer lagres aldri her: de leses fra
// filer brukeren velger, og data i adressen etter # sendes aldri til serveren.
// Filene og versjonen fylles inn ved bygg (vite.config.ts).
const VERSION = '__VERSION__';
const FILES = __FILES__;
const CACHE = `schemplan-${VERSION}`;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', ...FILES])));
});

// Gamle versjoner ryddes først når ingen vinduer bruker dem lenger, så et åpent vindu
// fortsatt finner sine egne filer (for eksempel PDF-delen som lastes ved lagring).
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('schemplan-') && k !== CACHE).map((k) => caches.delete(k)))),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || !url.pathname.startsWith(new URL('./', location.href).pathname)) return;
  if (req.mode === 'navigate') {
    // Siden hentes alltid fra nettet når det går, så nye versjoner kommer med en gang.
    // Uten nett brukes den lagrede.
    e.respondWith(
      fetch(req).catch(() => caches.match('./', { ignoreSearch: true, ignoreVary: true }).then((r) => r || Response.error())),
    );
    return;
  }
  // Filene har versjon i navnet og endres aldri, så den lagrede kopien brukes først.
  // ignoreVary: skript hentes med Origin-header, og serveren kan svare med «Vary: Origin».
  e.respondWith(caches.match(req, { ignoreSearch: true, ignoreVary: true }).then((r) => r || fetch(req)));
});
