/* Service worker del Portale Staff Cordusio.
 * - Notifiche push (VAPID) e apertura della pagina giusta al tocco.
 * - Copia offline delle ultime pagine viste di Home e Orari (network-first),
 *   così i turni restano consultabili senza rete (§9 PWA). */

const CACHE = "staff-pagine-v1";
const OFFLINE_PATHS = ["/", "/orari", "/orari/negozio"];

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith("staff-pagine-") && k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

function isCacheable(url) {
  return url.origin === self.location.origin && OFFLINE_PATHS.includes(url.pathname);
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || request.mode !== "navigate") return;
  const url = new URL(request.url);
  if (!isCacheable(url)) return;

  event.respondWith(
    (async () => {
      try {
        const response = await fetch(request);
        if (response.ok && !response.redirected) {
          const cache = await caches.open(CACHE);
          await cache.put(url.pathname + url.search, response.clone());
          if (url.search) await cache.put(url.pathname, response.clone());
        }
        return response;
      } catch {
        const cache = await caches.open(CACHE);
        const cached = (await cache.match(url.pathname + url.search)) || (await cache.match(url.pathname));
        if (cached) return cached;
        return new Response(
          '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sei offline</title><body style="font-family:-apple-system,Helvetica,sans-serif;padding:2rem;color:#0a0a0a"><p style="letter-spacing:.2em;font-size:11px;text-transform:uppercase">Salmoiraghi &amp; Viganò · Cordusio</p><h1 style="font-weight:300">Sei offline</h1><p>Questa pagina non è ancora stata salvata sul telefono. Riprova quando torna la connessione.</p></body>',
          { headers: { "Content-Type": "text/html; charset=utf-8" } },
        );
      }
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "logout") event.waitUntil(caches.delete(CACHE));
});

self.addEventListener("push", (event) => {
  let data = { title: "Staff Cordusio", body: "", url: "/", tag: undefined };
  try {
    data = { ...data, ...event.data.json() };
  } catch {
    if (event.data) data.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag,
      data: { url: data.url },
      icon: "/icon.svg",
      badge: "/icon.svg",
      lang: "it",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const w of windows) {
        if ("focus" in w) {
          await w.navigate(url).catch(() => undefined);
          return w.focus();
        }
      }
      return self.clients.openWindow(url);
    })(),
  );
});
