// كاش بسيط للواجهة فقط (النتائج دايمًا بتتحمل من السيرفر ومش بتتخزن)
const CACHE = 'results-shell-v3';
const SHELL = ['./', './index.html', './logo.svg', './manifest.json', './icon-192.png', './apple-touch-icon.png'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL))));
self.addEventListener('activate', (e) =>
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))))
);
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
