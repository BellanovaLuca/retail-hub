import "server-only";
import { getCurrentProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/supabase/types";

export type ActionResult<T = undefined> =
  | { ok: true; message?: string; data?: T }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

export class ActionError extends Error {}

/** Per le Server Actions: profilo attivo e client con la sessione dell'utente. */
export async function authedAction() {
  const profile = await getCurrentProfile();
  if (!profile || !profile.active) throw new ActionError("Sessione scaduta: accedi di nuovo.");
  return { profile, supabase: await createClient() };
}

/** Per le Server Actions riservate agli admin (RLS resta comunque la difesa finale). */
export async function adminAction(): Promise<{
  profile: Profile;
  supabase: Awaited<ReturnType<typeof createClient>>;
}> {
  const ctx = await authedAction();
  if (ctx.profile.role !== "admin") throw new ActionError("Operazione riservata ai responsabili.");
  return ctx;
}

/** Trasforma le eccezioni in un esito leggibile, senza esporre dettagli interni. */
export async function runAction<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof ActionError) return { ok: false, message: error.message };
    // Le eccezioni di redirect/notFound di Next devono propagarsi.
    if (error && typeof error === "object" && "digest" in error) throw error;
    console.error(error);
    return { ok: false, message: "Si è verificato un errore. Riprova." };
  }
}

/** Errori Postgres comuni → messaggi in italiano. */
export function dbErrorMessage(
  error: { code?: string; message?: string } | null,
  fallback: string,
) {
  if (!error) return fallback;
  if (error.code === "23505") return "Esiste già un elemento con questi dati.";
  if (error.code === "42501") return "Non hai i permessi per questa operazione.";
  if (error.code === "23514") return "Dati non validi.";
  return fallback;
}

export function zodFieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join(".");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
