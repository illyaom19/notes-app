importScripts('./offline-manifest.js');
const CACHE_NAME = `notes-offline-${self.NOTES_OFFLINE.version}`;
self.addEventListener('install', (event) => {
  // Installation fails visibly if any required asset is unavailable. Heavy modules
  // are downloaded here but still only executed when their feature is requested.
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(self.NOTES_OFFLINE.files)));
});
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name.startsWith('notes-') && name !== CACHE_NAME) await caches.delete(name);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (event) => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request.mode === 'navigate' ? './index.html' : request);
    return cached ?? fetch(request);
  })());
});
