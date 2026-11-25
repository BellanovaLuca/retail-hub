import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

/** Giorni dopo i quali una sessione registrata non può più valere (limite di 30 + margine). */
const KEEP_DAYS = 35;

/** `session_id` scritto nel token di accesso di Supabase Auth (non verificato: solo letto). */
export function sessionIdFromToken(accessToken: string | undefined | null): string | null {
  const payload = accessToken?.split(".")[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      session_id?: unknown;
    };
    return typeof claims.session_id === "string" && /^[0-9a-f-]{36}$/i.test(claims.session_id)
      ? claims.session_id
      : null;
  } catch {
    return null;
  }
}

/**
 * Registra la sessione appena aperta con il PIN: il database fa valere solo le sessioni
 * registrate (funzione `session_fresh()`), non quelle aperte parlando direttamente con Supabase
 * Auth. Lancia se non riesce: una sessione non registrata non servirebbe a nulla.
 */
export async function registerLoginSession(
  admin: Admin,
  profileId: string,
  accessToken: string | undefined | null,
): Promise<void> {
  const sessionId = sessionIdFromToken(accessToken);
  if (!sessionId) throw new Error("Sessione senza identificativo: accesso non registrabile.");
  const { error } = await admin
    .from("login_sessions")
    .upsert({ session_id: sessionId, profile_id: profileId }, { onConflict: "session_id" });
  if (error) throw new Error(`Sessione non registrata: ${error.message}`);
  // Pulizia: le sessioni più vecchie del limite non valgono comunque più.
  const before = new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString();
  await admin.from("login_sessions").delete().eq("profile_id", profileId).lt("created_at", before);
}

/**
 * Chiude subito le sessioni di una persona per il database (tutte, o tutte tranne `exceptSessionId`).
 * Serve all'uscita, a «Esci da tutti i dispositivi», al cambio e al reset del PIN: il token già
 * emesso resterebbe altrimenti valido fino a un'ora.
 */
export async function forgetLoginSessions(
  admin: Admin,
  profileId: string,
  opts: { only?: string | null; except?: string | null } = {},
): Promise<void> {
  let query = admin.from("login_sessions").delete().eq("profile_id", profileId);
  if (opts.only) query = query.eq("session_id", opts.only);
  if (opts.except) query = query.neq("session_id", opts.except);
  const { error } = await query;
  if (error) console.error("sessioni non chiuse nel registro", error);
}
