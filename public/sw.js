// Service worker supporting PWA installation and Web Push Notifications.

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener("push", function (event) {
  if (event.data) {
    try {
      const data = event.data.json();
      const options = {
        body: data.body,
        icon: data.icon || "/icon-192x192.png",
        badge: data.badge || "/badge.png",
        vibrate: [100, 50, 100],
        data: {
          dateOfArrival: Date.now(),
          primaryKey: "lumora-pwa-push",
        },
      };
      event.waitUntil(
        self.registration.showNotification(data.title || "Lumora Secure Drive", options)
      );
    } catch (err) {
      // Fallback if data is not JSON
      const text = event.data.text();
      const options = {
        body: text,
        icon: "/icon-192x192.png",
        badge: "/badge.png",
        vibrate: [100, 50, 100],
      };
      event.waitUntil(
        self.registration.showNotification("Lumora Secure Drive", options)
      );
    }
  }
});

self.addEventListener("notificationclick", function (event) {
  console.log("Notification click received.");
  event.notification.close();
  
  // Find open windows and focus one if possible, otherwise open a new window
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clientList) {
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow("/");
      }
    })
  );
});
