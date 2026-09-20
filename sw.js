self.addEventListener("push", event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) { data = { body: event.data ? event.data.text() : "You have a new Boopa notification." }; }
  event.waitUntil(self.registration.showNotification(data.title || "Boopa", {
    body: data.body || "You have a new notification.",
    icon: data.icon || "/favicon.ico",
    data: { url: data.url || "/" },
    tag: data.tag || "boopa-notification"
  }));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(openWindows => {
    const existing = openWindows.find(client => client.url.startsWith(self.location.origin));
    if (existing) { existing.postMessage({ type: "BOOPA_NOTIFICATION_CLICK", url: target }); return existing.focus(); }
    return clients.openWindow(target);
  }));
});
