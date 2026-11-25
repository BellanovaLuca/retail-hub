"use client";

/** Svuota la copia offline delle pagine (dati personali): messaggio al service worker. */
export function clearOfflineCopy() {
  if (typeof navigator === "undefined") return;
  navigator.serviceWorker?.controller?.postMessage("logout");
}

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T | undefined> =>
  Promise.race([promise, new Promise<undefined>((resolve) => setTimeout(resolve, ms))]);

/**
 * Stacca questo dispositivo da chi sta uscendo: svuota la copia offline e annulla la
 * sottoscrizione push del browser. Restituisce l'indirizzo della sottoscrizione (se c'era), da
 * passare a `signOut` perché il server elimini la riga. Non lancia mai e non blocca l'uscita.
 */
export async function leaveDevice(): Promise<string | undefined> {
  clearOfflineCopy();
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return undefined;
  try {
    return await withTimeout(
      (async () => {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager?.getSubscription();
        if (!sub) return undefined;
        const endpoint = sub.endpoint;
        await sub.unsubscribe().catch(() => undefined);
        return endpoint;
      })(),
      3000,
    );
  } catch {
    return undefined;
  }
}
