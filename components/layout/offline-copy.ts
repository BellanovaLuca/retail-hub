"use client";

/** Svuota la copia offline delle pagine (dati personali) quando si esce: messaggio al service worker. */
export function clearOfflineCopy() {
  if (typeof navigator === "undefined") return;
  navigator.serviceWorker?.controller?.postMessage("logout");
}
