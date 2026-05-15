// Service worker para CEMEX Sites Hub
// Estrategia: cache-first para shell, network-first para datos.
// También maneja Web Push (con VAPID configurado en server) y mensajes para notificaciones locales.

const CACHE_VERSION = "cemex-sites-v1";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      cache.addAll(["/", "/map", "/manifest.webmanifest"]).catch(() => undefined),
    ),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !k.startsWith(CACHE_VERSION))
          .map((k) => caches.delete(k)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // Nunca interceptar peticiones a Supabase ni Mapbox
  if (
    url.hostname.includes("supabase.co") ||
    url.hostname.includes("mapbox.com")
  ) {
    return;
  }

  // Solo same-origin
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((res) => {
          if (res.ok && res.type === "basic") {
            const clone = res.clone();
            caches.open(SHELL_CACHE).then((c) => c.put(request, clone));
          }
          return res;
        })
        .catch(
          () =>
            cached ||
            new Response("Sin conexión", { status: 503, statusText: "offline" }),
        );
    }),
  );
});

// === Web Push ===
self.addEventListener("push", (event) => {
  let payload = { title: "CEMEX Sites", body: "Tienes una alerta nueva" };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch (_e) {
    if (event.data) payload.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: payload.tag,
      data: payload.data || {},
    }),
  );
});

// === Notificaciones locales lanzadas desde la app ===
self.addEventListener("message", (event) => {
  const msg = event.data;
  if (!msg || msg.type !== "notify") return;
  self.registration.showNotification(msg.title || "CEMEX Sites", {
    body: msg.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: msg.tag,
    data: msg.data || {},
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/alertas";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((all) => {
      for (const client of all) {
        if ("focus" in client) {
          client.navigate(target).catch(() => undefined);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    }),
  );
});
