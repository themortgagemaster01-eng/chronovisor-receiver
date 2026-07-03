const CACHE = 'chronovisor-v6';
const SHELL = ['./', 'index.html', 'manifest.json', 'icon-192.png', 'icon-512.png'];

// INSTALL — pre-cache the shell and activate immediately (no waiting for old tabs to close)
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

// ACTIVATE — delete every old cache version, then take control of open clients now
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isHTML(req) {
  return req.mode === 'navigate' ||
         req.destination === 'document' ||
         (req.headers.get('accept') || '').includes('text/html');
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = req.url;

  // Never touch live API / decoder traffic
  if (url.includes('api.anthropic.com') || url.includes('queue.fal.run') || url.includes('fal.media')) return;

  // NETWORK-FIRST for the HTML document so the newest deployed build always wins.
  // Falls back to cache only when offline.
  if (isHTML(req)) {
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put('index.html', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then(r => r || caches.match('index.html')))
    );
    return;
  }

  // STALE-WHILE-REVALIDATE for same-origin static assets: serve cache fast, refresh in background.
  e.respondWith(
    caches.match(req).then(cached => {
      const net = fetch(req).then(res => {
        try {
          if (res && res.status === 200 && new URL(url).origin === self.location.origin) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
          }
        } catch (_) {}
        return res;
      }).catch(() => cached);
      return cached || net;
    })
  );
});
// build 2026-07-03 — reception v6 · network-first HTML + SWR assets + auto-update
