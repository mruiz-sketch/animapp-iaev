// Service worker de ANIMAPP: permite instalar la app y abrirla sin conexión
// (muestra la última versión guardada). Siempre intenta primero la red.
const CACHE = "animapp-v3";
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

// ---- Avisos (notificaciones push enviadas con Firebase Cloud Messaging) ----
self.addEventListener("push", e => {
  let d = {};
  try { const j = e.data ? e.data.json() : {}; d = j.data || j.notification || j; }
  catch (_) { d = { body: e.data ? e.data.text() : "" }; }
  const title = d.title || "ANIMAPP IAEV";
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body || "", icon: "/icons/icon-192.png", badge: "/icons/badge-96.png",
    tag: d.tag || "animapp", renotify: true, data: { url: d.url || "/" }, lang: "es-MX",
  }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/", self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(cs => {
    for (const c of cs) if (c.url.startsWith(self.location.origin) && "focus" in c) {
      return c.focus().then(w => (w && "navigate" in w ? w.navigate(url) : w));
    }
    return self.clients.openWindow(url);
  }));
});
