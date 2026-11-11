// Service worker de ANIMAPP: permite instalar la app y abrirla sin conexión
// (muestra la última versión guardada). Siempre intenta primero la red.
const CACHE = "animapp-v2";
const SHELL = ["/", "/index.html", "/manifest.webmanifest", "/firebase-config.js", "/noticias.json",
  "/icons/icon-192.png", "/icons/icon-512.png", "/icons/apple-touch-icon.png", "/apple-touch-icon.png"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== location.origin) return;           // Firebase, Google, etc.: directo
  if (/^\/videos/.test(u.pathname) || /\.(mp4|webm|mov)$/i.test(u.pathname) || r.headers.has("range")) return;
  e.respondWith(fetch(r).then(res => {
    if (res.ok && res.type === "basic") { const cp = res.clone(); caches.open(CACHE).then(c => c.put(r, cp)); }
    return res;
  }).catch(() => caches.match(r, {ignoreSearch: true}).then(m => m || (r.mode === "navigate" ? caches.match("/index.html") : Response.error()))));
});
