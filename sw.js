/**
 * Service worker: makes the app work offline.
 *
 * - On install, every file of the app is downloaded into a cache named after VERSION.
 * - Requests are answered from that cache first, so the app opens instantly and offline.
 * - A new version installs in the background and waits; the app shows "Доступно обновление",
 *   and only when the user taps it does the new version take over (SKIP_WAITING).
 *
 * Releasing a change: bump VERSION here and "version" in package.json (a test checks they match).
 * When adding a file to the app, add it to ASSETS (a test checks nothing is missing).
 */
const VERSION = '0.6.0';
const CACHE_NAME = `day-tracker-${VERSION}`;

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon.svg',
  './js/app.js',
  './js/logic/backup.js',
  './js/logic/exportText.js',
  './js/logic/rules.js',
  './js/logic/schedule.js',
  './js/logic/streaks.js',
  './js/logic/time.js',
  './js/logic/weekStats.js',
  './js/pwa.js',
  './js/state/defaults.js',
  './js/state/schema.js',
  './js/state/store.js',
  './js/ui/backup.js',
  './js/ui/dom.js',
  './js/ui/format.js',
  './js/ui/settings.js',
  './js/ui/today.js',
  './js/ui/week.js',
];

self.addEventListener('install', (event) => {
  // `cache: 'reload'` bypasses the browser's HTTP cache, so a new version never stores stale files.
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' })))),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names.filter((name) => name.startsWith('day-tracker-') && name !== CACHE_NAME).map((name) => caches.delete(name)),
    );
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    try {
      return await fetch(request);
    } catch (err) {
      // Offline and not cached: for page loads, fall back to the app itself.
      if (request.mode === 'navigate') {
        const shell = await caches.match('./index.html');
        if (shell) return shell;
      }
      throw err;
    }
  })());
});
