// Service Worker für die PWA. Hauptaufgabe: Push-Notifications empfangen
// und in der Benachrichtigungs-Zentrale anzeigen, plus Klick darauf führt
// zurück ins Dashboard.

self.addEventListener("install", (event) => {
  // Skip waiting → neuer SW wird sofort aktiv, ohne dass alle Tabs zu sein müssen.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = { title: "KPI Dashboard", body: event.data.text() };
    }
  }

  const title = payload.title || "KPI Dashboard";
  const options = {
    body: payload.body || "",
    icon: "/icon/192",
    badge: "/icon/192",
    tag: payload.tag,
    data: { url: payload.url || "/" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // Wenn das Dashboard schon offen ist, fokussieren statt neuen Tab.
        for (const client of clientList) {
          if ("focus" in client) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      }),
  );
});
