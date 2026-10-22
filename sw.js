const CACHE = 'checklist-v22';
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'manifest.json', 'lib/jspdf.umd.min.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/croqui.jpg', 'croqui-data.js', 'veiculos.json'];

// Um arquivo ausente não impede a instalação/atualização do app
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => Promise.all(FILES.map(f => c.add(f).catch(() => {})))).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Rede primeiro (pega sempre a versão nova quando há internet); sem internet usa o cache
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(r => {
      if (r && r.ok && new URL(e.request.url).origin === location.origin) {
        const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
