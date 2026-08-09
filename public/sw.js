const CACHE_NAME = "custom-newspaper-shell-v1";
const OFFLINE_URL = "/offline";
const SHELL_ASSETS = [OFFLINE_URL, "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE_URL)));
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }
  const deepLink = typeof payload.deepLink === "string" && payload.deepLink.startsWith("/") && !payload.deepLink.startsWith("//")
    ? payload.deepLink
    : "/insights";
  event.waitUntil(
    self.registration.showNotification(payload.title || "어제의 편집국", {
      body: payload.body || "새로운 생각거리가 도착했습니다.",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: payload.nudgeId || "custom-newspaper",
      renotify: false,
      data: { deepLink, nudgeId: payload.nudgeId, type: payload.type },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const deepLink = event.notification.data?.deepLink || "/insights";
  const targetUrl = new URL(deepLink, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windows) => {
      for (const client of windows) {
        if ("navigate" in client) await client.navigate(targetUrl);
        return client.focus();
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});
