self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", function(event) {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch (error) {
    payload = { data: { body: event.data.text() } };
  }

  const message = {
    ...(payload.notification || {}),
    ...(payload.data || {})
  };
  const title = message.title || "⚽ Samnanger G14";
  const body = message.body || "Nytt kampvarsel";
  const reminderKey = message.reminderKey || "update";
  const matchId = message.matchId || "match";
  const iconUrl = new URL("./icon-192.png", self.location.href).href;
  const badgeUrl = new URL("./favicon-32.png", self.location.href).href;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: iconUrl,
      badge: badgeUrl,
      tag: `samnanger-${matchId}-${reminderKey}`,
      renotify: true,
      requireInteraction: true,
      vibrate: [280, 120, 280, 120, 520],
      data: {
        url: message.url || "./dagens-kamp.html",
        matchId,
        reminderKey
      },
      actions: [
        {
          action: "open-match",
          title: "Åpne kampen"
        }
      ]
    })
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();

  const targetUrl = new URL(
    event.notification.data?.url || "./dagens-kamp.html",
    self.location.href
  ).href;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true
    });

    for (const client of windows) {
      if ("navigate" in client) await client.navigate(targetUrl);
      if ("focus" in client) return client.focus();
    }

    return self.clients.openWindow(targetUrl);
  })());
});
