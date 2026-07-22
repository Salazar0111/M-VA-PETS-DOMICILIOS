/* MÜVA · service worker — solo cachea la carcasa de la app.
   Las respuestas de /api/ NUNCA se cachean: traen datos de sesión y de pacientes. */
const CACHE = 'muva-app-v1';
const CARCASA = [
  '/app/',
  '/app/index.html',
  '/app/styles.css',
  '/app/fonts.css',
  '/app/app.js',
  '/app/icono.svg',
  '/app/manifest.webmanifest',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CARCASA)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((llaves) => Promise.all(llaves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Datos siempre frescos y nunca en caché.
  if (url.pathname.startsWith('/api/')) return;
  if (e.request.method !== 'GET') return;

  e.respondWith(
    caches.match(e.request).then(
      (guardado) =>
        guardado ||
        fetch(e.request).catch(() => caches.match('/app/index.html'))
    )
  );
});
