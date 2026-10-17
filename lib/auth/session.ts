import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/supabase/types";

/** Profilo completo dell'utente collegato, o null. Una sola query per richiesta. */
export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return null;

  const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  return data;
});

/** Per le pagine dell'app: richiede un profilo attivo che abbia completato il primo accesso. */
export async function requireProfile(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile || !profile.active) redirect("/esci");
  if (profile.must_change_pin || !profile.privacy_accepted_at) redirect("/primo-accesso");
  return profile;
}

export async function requireAdmin(): Promise<Profile> {
  const profile = await requireProfile();
  if (profile.role !== "admin") redirect("/");
  return profile;
}
