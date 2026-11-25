import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/supabase/types";

/**
 * Profilo completo dell'utente collegato, o null (nessuna sessione, profilo assente o non più
 * leggibile perché disattivato). Una sola query per richiesta.
 *
 * Se la lettura fallisce per un errore (database non raggiungibile…) LANCIA: un guasto
 * momentaneo non deve sembrare «account disattivato» e chiudere la sessione.
 */
export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(`Profilo non leggibile: ${error.message}`);
  return data;
});

/** Primo accesso completato: PIN personale scelto e informativa accettata. */
export function isOnboarded(
  profile: Pick<Profile, "must_change_pin" | "privacy_accepted_at">,
): boolean {
  return !profile.must_change_pin && Boolean(profile.privacy_accepted_at);
}

/** Per le pagine dell'app: richiede un profilo attivo che abbia completato il primo accesso. */
export async function requireProfile(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile || !profile.active) redirect("/esci");
  if (!isOnboarded(profile)) redirect("/primo-accesso");
  return profile;
}

export async function requireAdmin(): Promise<Profile> {
  const profile = await requireProfile();
  if (profile.role !== "admin") redirect("/");
  return profile;
}
