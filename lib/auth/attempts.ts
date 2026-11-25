import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { LOCKOUT_MINUTES, MAX_FAILED_PER_CODE, MAX_FAILED_PER_IP } from "./lockout";

type Admin = ReturnType<typeof createAdminClient>;

export type AttemptGate = { ok: true; attemptId: string } | { ok: false; lockedUntil: Date };

/** IP del client: prima quello messo dalla piattaforma (Vercel), poi x-forwarded-for. */
export function clientIp(headers: Headers): string {
  return (
    headers.get("x-real-ip")?.trim() ||
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "sconosciuto"
  );
}

/**
 * Controllo del blocco e registrazione del tentativo in un solo passo atomico (funzione SQL
 * `login_attempt_begin`, sotto lock per codice e per IP): richieste in parallelo non possono
 * superare la soglia. Il tentativo nasce «fallito»: chi verifica il PIN lo segna riuscito con
 * `markAttemptSucceeded`. Se il database non risponde lancia: senza contatore non si prova il PIN.
 */
export async function beginLoginAttempt(admin: Admin, code: string, ip: string): Promise<AttemptGate> {
  const { data, error } = await admin.rpc("login_attempt_begin", {
    p_code: code,
    p_ip: ip,
    p_max_code: MAX_FAILED_PER_CODE,
    p_max_ip: MAX_FAILED_PER_IP,
    p_minutes: LOCKOUT_MINUTES,
  });
  if (error) throw new Error(`Tentativi di accesso non registrabili: ${error.message}`);
  const gate = data as { attempt_id: string | null; locked_until: string | null } | null;
  if (gate?.attempt_id) return { ok: true, attemptId: gate.attempt_id };
  if (gate?.locked_until) return { ok: false, lockedUntil: new Date(gate.locked_until) };
  throw new Error("Tentativi di accesso: risposta inattesa.");
}

/** PIN corretto: il tentativo non conta più tra gli errori e azzera il conteggio del codice. */
export async function markAttemptSucceeded(admin: Admin, attemptId: string): Promise<void> {
  const { error } = await admin.from("login_attempts").update({ success: true }).eq("id", attemptId);
  if (error) console.error("tentativi di accesso", error);
}

/** Il PIN non è stato verificato (es. servizio non raggiungibile): il tentativo non va contato. */
export async function discardAttempt(admin: Admin, attemptId: string): Promise<void> {
  await admin.from("login_attempts").delete().eq("id", attemptId);
}
