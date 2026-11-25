/**
 * Indirizzi ammessi per le sottoscrizioni push: solo i servizi push dei browser.
 * Il server fa una richiesta HTTPS a questo indirizzo a ogni notifica: senza elenco chiunque
 * potrebbe registrare un host qualsiasi (richieste verso terzi, invii che restano appesi).
 */
const PUSH_HOSTS = [
  "fcm.googleapis.com", // Chrome, Edge (Android/desktop), Samsung Internet
  "android.googleapis.com", // endpoint storici di Chrome
];
const PUSH_HOST_SUFFIXES = [
  ".push.apple.com", // Safari / iOS (web.push.apple.com)
  ".mozilla.com", // Firefox (updates.push.services.mozilla.com)
  ".mozaws.net", // Firefox (autopush)
  ".notify.windows.com", // Edge / Windows (WNS)
];

export const PUSH_ENDPOINT_MAX_LENGTH = 1000;

export function isAllowedPushEndpoint(endpoint: string): boolean {
  if (!endpoint || endpoint.length > PUSH_ENDPOINT_MAX_LENGTH) return false;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password) return false;
  if (url.port && url.port !== "443") return false;
  const host = url.hostname.toLowerCase();
  return PUSH_HOSTS.includes(host) || PUSH_HOST_SUFFIXES.some((s) => host.endsWith(s));
}

/**
 * `sub` del token VAPID: `mailto:` con il solo indirizzo. EMAIL_FROM può essere nella forma
 * «Nome <indirizzo>», che alcuni servizi push (Apple) rifiutano.
 */
export function vapidSubject(emailFrom: string | undefined | null): string {
  const fallback = "mailto:staff@example.com";
  const raw = (emailFrom ?? "").trim();
  if (!raw) return fallback;
  const address = (/<([^<>]+)>/.exec(raw)?.[1] ?? raw).trim();
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address) ? `mailto:${address}` : fallback;
}
