/* Service worker del Portale Staff Cordusio.
 * - Notifiche push (VAPID) e apertura della pagina giusta al tocco.
 * - Copia offline delle ultime pagine viste di Home e Orari (network-first),
 *   così i turni restano consultabili senza rete (§9 PWA).
 *
 * La copia offline contiene dati personali: sta in una cache legata all'id di chi era
 * collegato (intestazione x-staff-user messa dal middleware) e ne esiste una sola alla volta.
 * Si svuota all'uscita, quando si arriva alla pagina di accesso (sessione scaduta, account
 * disattivato, uscita da un altro dispositivo) e quando entra un'altra persona. */

const CACHE_PREFIX = "staff-pagine-";
const USER_CACHE_PREFIX = CACHE_PREFIX + "v2-";
const USER_HEADER = "x-staff-user";
const OFFLINE_PATHS = ["/", "/orari", "/orari/negozio"];
const LOGIN_PATH = "/accesso";

self.addEventListener("install", () => self.skipWaiting());

/** Elimina le copie offline, tranne (se indicata) quella da tenere. */
async function clearCopies(keep) {
  const keys = await caches.keys();
  await Promise.all(
    keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== keep).map((k) => caches.delete(k)),
  );
}

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Le cache delle versioni precedenti non erano legate all'utente: si eliminano.
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith(CACHE_PREFIX) && !k.startsWith(USER_CACHE_PREFIX))
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

function isCacheable(url) {
  return url.origin === self.location.origin && OFFLINE_PATHS.includes(url.pathname);
}

function isLogin(url) {
  return url.origin === self.location.origin && url.pathname === LOGIN_PATH;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || request.mode !== "navigate") return;
  const url = new URL(request.url);
  if (!isCacheable(url) && !isLogin(url)) return;

  event.respondWith(
    (async () => {
      try {
        const response = await fetch(request);
        // Si è finiti sulla pagina di accesso (direttamente o per redirect): nessuno è collegato.
        if (response.ok && isLogin(new URL(response.url || request.url))) {
          await clearCopies();
          return response;
        }
        const userId = response.headers.get(USER_HEADER);
        if (isCacheable(url) && response.ok && !response.redirected && userId) {
          const name = USER_CACHE_PREFIX + userId;
          await clearCopies(name);
          const cache = await caches.open(name);
          await cache.put(url.pathname + url.search, response.clone());
          if (url.search) await cache.put(url.pathname, response.clone());
        }
        return response;
      } catch {
        if (isCacheable(url)) {
          // Senza rete: l'unica copia rimasta è quella dell'ultima persona collegata qui.
          const name = (await caches.keys()).find((k) => k.startsWith(USER_CACHE_PREFIX));
          if (name) {
            const cache = await caches.open(name);
            const cached =
              (await cache.match(url.pathname + url.search)) || (await cache.match(url.pathname));
            if (cached) return cached;
          }
        }
        return new Response(
          '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sei offline</title><body style="font-family:-apple-system,Helvetica,sans-serif;padding:2rem;color:#0a0a0a"><p style="letter-spacing:.2em;font-size:11px;text-transform:uppercase">Salmoiraghi &amp; Viganò · Cordusio</p><h1 style="font-weight:300">Sei offline</h1><p>Questa pagina non è ancora stata salvata sul telefono. Riprova quando torna la connessione.</p></body>',
          { headers: { "Content-Type": "text/html; charset=utf-8" } },
        );
      }
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "logout") event.waitUntil(clearCopies());
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
  // Solo pagine del portale: un indirizzo esterno nel messaggio apre la Home.
  let target = new URL("/", self.location.origin);
  try {
    const wanted = new URL(event.notification.data?.url || "/", self.location.origin);
    if (wanted.origin === self.location.origin) target = wanted;
  } catch {
    // indirizzo non valido: resta la Home
  }
  const url = target.href;
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
