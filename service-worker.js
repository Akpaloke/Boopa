const CACHE_NAME = "boopa-shell-v5";
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
  try { data = event.data ? event.data.json() : {}; } catch (_) { data = { title: "Boopa", body: "You have a new Boopa notification." }; }

  const payload = {
    type: data.type || "system",
    title: data.title || "Boopa",
    body: data.body || "You have a new Boopa notification.",
    icon: data.icon || "/boopa-icon-192.png",
    badge: data.badge || "/boopa-icon-192.png",
    tag: data.tag || `boopa-${data.type || "notification"}-${data.senderId || "general"}`,
    renotify: true,
    silent: false,
    vibrate: [200, 100, 200],
    requireInteraction: false,
    data: {
      url: data.url || data.chatUrl || data.profileUrl || "/",
      chatUrl: data.chatUrl || data.url || "/",
      profileUrl: data.profileUrl || null,
      senderId: data.senderId || data.data?.senderId || null,
      messageId: data.messageId || data.data?.messageId || null,
      notificationId: data.notificationId || data.data?.notificationId || null
    }
  };

  event.waitUntil((async () => {
    const openWindows = await clients.matchAll({ type: "window", includeUncontrolled: true });
    if (openWindows.some(client => client.visibilityState === "visible" && new URL(client.url).origin === self.location.origin)) return;
    await self.registration.showNotification(payload.title, payload);
  })());
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = new URL(
    event.notification.data?.url ||
    event.notification.data?.profileUrl ||
    event.notification.data?.chatUrl ||
    "/",
    self.location.origin
  ).href;

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(openWindows => {
      const matching = openWindows.find(client => client.url.startsWith(self.location.origin));
      if (matching) {
        matching.postMessage({ type: "BOOPA_NOTIFICATION_CLICK", url: target });
        return matching.focus();
      }
      return clients.openWindow(target);
    })
  );
});
