const CACHE_NAME = "boopa-shell-v1";
const SHELL_ASSETS = [
  "/",
  "/index.html",
  "/config.js",
  "/manifest.webmanifest",
  "/boopa-icon.svg",
  "/boopa-icon-192.png",
  "/boopa-icon-512.png"
];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if(request.method !== "GET" || url.origin !== self.location.origin) return;
  event.respondWith(fetch(request).then(response => {
    if(response.ok && (request.mode === "navigate" || SHELL_ASSETS.includes(url.pathname))) {
      const copy=response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
    }
    return response;
  }).catch(() => caches.match(request).then(cached => cached || caches.match("/index.html"))));
});

self.addEventListener("push", event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) { data = { body: "You have a new Boopa notification." }; }
  const title = data.title || "Boopa";
  const message = data.message ? `${data.body || ""}\n"${data.message}"` : (data.body || "You have a new notification.");
  event.waitUntil(self.registration.showNotification(title, {
    body: message,
    icon: data.icon || "/favicon.ico",
    tag: data.tag || `boopa-${data.type || "notification"}-${data.senderId || "general"}`,
    data: { chatUrl: data.chatUrl || data.url || "/", profileUrl: data.profileUrl || null }
  }));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = new URL(event.notification.data?.profileUrl || event.notification.data?.chatUrl || "/", self.location.origin).href;
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(openWindows => {
    const existing = openWindows.find(client => client.url.startsWith(self.location.origin));
    if (existing) { existing.postMessage({ type: "BOOPA_NOTIFICATION_CLICK", url: target }); return existing.focus(); }
    return clients.openWindow(target);
  }));
});
