// Bumper la version à chaque déploiement pour déclencher la mise à jour côté client
const CACHE_NAME = 'fondements-v3';
const FONTS_CACHE = 'fondements-fonts-v1';

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(ASSETS))
  );
  // PAS de self.skipWaiting() ici : on attend le feu vert de la page
});

self.addEventListener('activate', e => {
  const keepCaches = [CACHE_NAME, FONTS_CACHE];
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => !keepCaches.includes(k)).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

function isGoogleFont(url) {
  return url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch { return; }

  // Google Fonts : stale-while-revalidate
  // Première visite en ligne → téléchargées et mises en cache
  // Hors ligne → servies depuis le cache
  if (isGoogleFont(url)) {
    e.respondWith(
      caches.open(FONTS_CACHE).then(cache =>
        cache.match(req).then(cached => {
          const network = fetch(req).then(res => {
            if (res && res.status === 200) cache.put(req, res.clone());
            return res;
          }).catch(() => cached);
          return cached || network;
        })
      )
    );
    return;
  }

  const isHTML = req.mode === 'navigate' ||
                 (req.headers.get('accept') || '').includes('text/html');

  // HTML : network-first (pour détecter vite les MAJ), fallback cache
  if (isHTML) {
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  // Autres assets locaux : cache-first
  e.respondWith(
    caches.match(req).then(r => r || fetch(req).then(res => {
      if (res && res.status === 200 && url.origin === self.location.origin) {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(req, copy));
      }
      return res;
    }).catch(() => r))
  );
});

// La page peut demander à activer immédiatement la nouvelle version
self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING' || (e.data && e.data.type === 'SKIP_WAITING')) {
    self.skipWaiting();
  }
});
