const CACHE_NAME = "rider-reports-shell-v1";
const SHELL_ASSETS = ["/", "/manifest.webmanifest", "/logo.png", "/favicon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match("/"))),
  );
});

// ---- Web Push ------------------------------------------------------------
// The count on the app icon is the number of pushes received since the app
// was last opened. It lives in the cache (the worker can be stopped between
// pushes, so it can't be kept in memory).
const BADGE_KEY = "/__badge-count";

async function readBadge() {
  const cache = await caches.open(CACHE_NAME);
  const stored = await cache.match(BADGE_KEY);
  return stored ? Number(await stored.text()) || 0 : 0;
}

async function setBadge(count) {
  const cache = await caches.open(CACHE_NAME);
  await cache.put(BADGE_KEY, new Response(String(count)));
  try {
    if (count > 0) await self.navigator.setAppBadge?.(count);
    else await self.navigator.clearAppBadge?.();
  } catch {
    // Badging API unsupported or blocked — the notification itself still shows.
  }
}

self.addEventListener("push", (event) => {
  let message = {};
  try {
    message = event.data ? event.data.json() : {};
  } catch {
    message = {};
  }
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(message.title || "مندوبي", {
        body: message.body || "",
        icon: "/logo.png",
        badge: "/favicon.png",
        tag: message.tag,
        dir: "auto",
        lang: "ar",
        data: { url: message.url || "/" },
      });
      await setBadge((await readBadge()) + 1);
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      await setBadge(0);
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((client) => "focus" in client);
      if (open) {
        await open.focus();
        await open.navigate?.(target).catch(() => {});
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "clear-badge") event.waitUntil(setBadge(0));
});
