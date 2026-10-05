self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let msg = { title: "Aegis Agria", body: "Plant care is due.", tag: "aegis", url: "/" };
  try { if (event.data) msg = { ...msg, ...event.data.json() }; } catch (_) {}
  event.waitUntil(self.registration.showNotification(msg.title, { body: msg.body, tag: msg.tag, data: { url: msg.url }, icon: "/favicon.ico", badge: "/favicon.ico" }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const c of list) if ("focus" in c) return c.focus();
    return self.clients.openWindow(url);
  }));
});
