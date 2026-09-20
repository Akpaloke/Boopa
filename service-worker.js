self.addEventListener("push", event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) { data = { body: "You have a new Boopa notification." }; }
  const title = data.title || "Boopa";
  const message = data.message ? `${data.body || ""}\n"${data.message}"` : (data.body || "You have a new notification.");
  event.waitUntil(self.registration.showNotification(title, {
    body: message,
    icon: data.icon || "/favicon.ico",
    tag: data.tag || `boopa-${data.type || "notification"}-${data.senderId || "general"}`,
    data: { chatUrl: data.chatUrl || data.url || "/" }
  }));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = new URL(event.notification.data?.chatUrl || "/", self.location.origin).href;
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(openWindows => {
    const existing = openWindows.find(client => client.url.startsWith(self.location.origin));
    if (existing) { existing.postMessage({ type: "BOOPA_NOTIFICATION_CLICK", url: target }); return existing.focus(); }
    return clients.openWindow(target);
  }));
});
