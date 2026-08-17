importScripts('https://www.gstatic.com/firebasejs/12.6.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.6.0/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyAKZMu2HZPmmoZ1fFT7DNA9Q6ystbKEPgE",
  authDomain: "samnanger-g14-f10a1.firebaseapp.com",
  projectId: "samnanger-g14-f10a1",
  storageBucket: "samnanger-g14-f10a1.firebasestorage.app",
  messagingSenderId: "926427862844",
  appId: "1:926427862844:web:5e6d11bb689c802d01b039",
  measurementId: "G-EJL3YYC63R"
};

firebase.initializeApp(firebaseConfig);

self.addEventListener("push", function(event) {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch (error) {
    payload = { data: { body: event.data.text() } };
  }

  const message = payload.data || payload.notification || {};
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
