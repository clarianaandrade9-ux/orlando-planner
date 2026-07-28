/* =========================================================================
   sw.js — Service Worker (PWA)
   Estratégia: cache-first para o "app shell" (offline básico) e network-first
   para dados de API (filas/clima, que precisam ser frescos).
   Registrado em app.js -> registerPWA().
   ========================================================================= */
const CACHE = 'otp-shell-v1';
const SHELL = [
  './', './index.html',
  './css/style.css',
  './js/app.js', './js/store.js', './js/api.js', './js/weather.js', './js/maps.js', './js/optimizer.js',
  './data/parks.json', './assets/icon.svg', './manifest.webmanifest'
];

self.addEventListener('install', e => {
  // pré-carrega o app shell; skipWaiting ativa a nova versão imediatamente
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  // limpa caches antigos de versões anteriores
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // APIs externas (filas/clima): network-first, com fallback ao cache
  if (url.hostname.includes('queue-times.com') || url.hostname.includes('open-meteo.com')) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }
  // App shell: cache-first (funciona offline), com atualização em background
  e.respondWith(caches.match(e.request).then(res => res || fetch(e.request)));
});
