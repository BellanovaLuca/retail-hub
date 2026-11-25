/**
 * Durata massima della sessione (§4): 30 giorni dall'accesso con il PIN, poi si rientra.
 *
 * Il momento dell'accesso sta nel token di Supabase Auth (claim `amr`: metodo + istante) e non
 * cambia quando il token viene rinnovato: il limite vale quindi anche se l'app viene usata tutti
 * i giorni. Lo stesso controllo lo fa il database (funzione `session_fresh()`).
 */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/** Istante dell'accesso (secondi Unix), o null se il token non lo riporta. */
export function sessionStartedAt(claims: unknown): number | null {
  const amr = (claims as { amr?: unknown } | null | undefined)?.amr;
  if (!Array.isArray(amr)) return null;
  let first: number | null = null;
  for (const entry of amr) {
    if (!entry || typeof entry !== "object") continue;
    const { method, timestamp } = entry as { method?: unknown; timestamp?: unknown };
    // I rinnovi del token non sono un accesso.
    if (method === "token_refresh") continue;
    if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) continue;
    if (first === null || timestamp < first) first = timestamp;
  }
  return first;
}

/** true se l'accesso risale a più di `maxAgeSeconds` fa. Senza istante dell'accesso: false. */
export function isSessionExpired(
  claims: unknown,
  nowSeconds: number,
  maxAgeSeconds: number = SESSION_MAX_AGE_SECONDS,
): boolean {
  const startedAt = sessionStartedAt(claims);
  return startedAt !== null && nowSeconds - startedAt > maxAgeSeconds;
}
