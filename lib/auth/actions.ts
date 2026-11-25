"use server";

import { randomBytes } from "node:crypto";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  beginLoginAttempt,
  clientIp,
  discardAttempt,
  markAttemptSucceeded,
} from "@/lib/auth/attempts";
import { ActionError, authedAction } from "@/lib/auth/guards";
import { lockoutMessage } from "@/lib/auth/lockout";
import { syntheticEmail, validateNewPin } from "@/lib/auth/pin";
import { authPassword } from "@/lib/auth/secret";
import { getCurrentProfile, isOnboarded } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/supabase/types";
import { THEME_COOKIE, themeSchema } from "@/lib/theme";

export type ActionResult = { ok: true } | { ok: false; error: string };

const changePinSchema = z.object({
  pin: z.string(),
  confirm: z.string(),
  acceptPrivacy: z.boolean().optional(),
  /** PIN attuale: obbligatorio dal profilo, non al primo accesso. */
  currentPin: z.string().max(20).optional(),
});

/**
 * Verifica il PIN attuale con un client usa-e-getta (nessun cookie toccato): chi trova un
 * telefono sbloccato non può cambiare il PIN senza conoscerlo. Gli errori contano nel blocco
 * dei tentativi, come all'accesso.
 */
async function checkCurrentPin(profile: Profile, currentPin: string): Promise<string | null> {
  const admin = createAdminClient();
  const gate = await beginLoginAttempt(admin, profile.employee_code, clientIp(await headers()));
  if (!gate.ok) return lockoutMessage(gate.lockedUntil);

  const probe = createSupabaseClient(supabaseUrl(), supabaseAnonKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await probe.auth.signInWithPassword({
    email: syntheticEmail(profile.employee_code),
    password: authPassword(profile.id, currentPin),
  });
  if (error || data.user?.id !== profile.id) {
    if (error && error.code !== "invalid_credentials") {
      // Verifica non riuscita per un guasto: non è un PIN sbagliato, il tentativo non conta.
      await discardAttempt(admin, gate.attemptId);
      return "Non è stato possibile verificare il PIN attuale. Riprova.";
    }
    return "Il PIN attuale non è corretto.";
  }
  // La sessione aperta per la verifica non serve: si chiude subito.
  await probe.auth.signOut({ scope: "local" }).catch(() => undefined);
  await markAttemptSucceeded(admin, gate.attemptId);
  return null;
}

/**
 * Cambio PIN: al primo accesso (obbligatorio, con accettazione dell'informativa)
 * e dal profilo (serve il PIN attuale; le altre sessioni vengono chiuse).
 */
export async function changePin(input: z.infer<typeof changePinSchema>): Promise<ActionResult> {
  const parsed = changePinSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Dati non validi." };
  const { pin, confirm, acceptPrivacy, currentPin } = parsed.data;

  let profile: Profile | null;
  try {
    profile = await getCurrentProfile();
  } catch {
    return { ok: false, error: "Si è verificato un errore. Riprova." };
  }
  if (!profile || !profile.active)
    return { ok: false, error: "Sessione scaduta: accedi di nuovo." };

  const pinError = validateNewPin(pin, profile.role);
  if (pinError) return { ok: false, error: pinError };
  if (pin !== confirm) return { ok: false, error: "I due PIN non coincidono." };
  if (!profile.privacy_accepted_at && !acceptPrivacy) {
    return { ok: false, error: "Per continuare devi accettare l'informativa privacy." };
  }

  // Dal profilo (primo accesso già completato) serve il PIN attuale.
  if (isOnboarded(profile)) {
    if (!currentPin || !/^\d{6,12}$/.test(currentPin))
      return { ok: false, error: "Inserisci il PIN attuale." };
    if (currentPin === pin)
      return { ok: false, error: "Il nuovo PIN deve essere diverso da quello attuale." };
    try {
      const currentError = await checkCurrentPin(profile, currentPin);
      if (currentError) return { ok: false, error: currentError };
    } catch (error) {
      console.error(error);
      return { ok: false, error: "Non è stato possibile verificare il PIN attuale. Riprova." };
    }
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: authPassword(profile.id, pin) });
  if (error) {
    return {
      ok: false,
      error:
        error.code === "same_password"
          ? "Il nuovo PIN deve essere diverso da quello provvisorio."
          : "Non è stato possibile cambiare il PIN. Riprova.",
    };
  }

  // I campi del profilo li può scrivere solo un admin: qui agisce il server.
  await createAdminClient()
    .from("profiles")
    .update({
      must_change_pin: false,
      privacy_accepted_at: profile.privacy_accepted_at ?? new Date().toISOString(),
    })
    .eq("id", profile.id);

  // Chi era collegato altrove con il vecchio PIN deve rientrare.
  const { error: othersError } = await supabase.auth.signOut({ scope: "others" });
  if (othersError) console.error("cambio PIN: altre sessioni non chiuse", othersError);

  return { ok: true };
}

const endpointSchema = z.url().max(1000);

/**
 * Esce da questo dispositivo. `pushEndpoint` è la sottoscrizione push del browser (se c'è):
 * si elimina, così il dispositivo non riceve più le notifiche di chi è uscito.
 */
export async function signOut(pushEndpoint?: unknown) {
  const supabase = await createClient();
  const endpoint = endpointSchema.safeParse(pushEndpoint);
  if (endpoint.success) {
    // RLS: si eliminano solo le proprie sottoscrizioni.
    await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint.data);
  }
  await supabase.auth.signOut({ scope: "local" });
  redirect("/accesso");
}

/** Esce da tutti i dispositivi (revoca tutte le sessioni e le notifiche push). */
export async function signOutEverywhere() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (userId) await supabase.from("push_subscriptions").delete().eq("profile_id", userId);
  await supabase.auth.signOut({ scope: "global" });
  redirect("/accesso");
}

/**
 * «Rigenera link» del calendario: nuovo token iCal, il vecchio indirizzo smette di funzionare.
 * Il token lo scrive il server: la guardia sul profilo non lo lascia modificare al dipendente.
 */
export async function regenerateCalendarLink(): Promise<
  { ok: true; token: string } | { ok: false; error: string }
> {
  try {
    const { profile } = await authedAction();
    const token = randomBytes(18).toString("hex");
    const { error } = await createAdminClient()
      .from("profiles")
      .update({ ical_token: token })
      .eq("id", profile.id);
    if (error) return { ok: false, error: "Link non rigenerato. Riprova." };
    revalidatePath("/orari");
    return { ok: true, token };
  } catch (error) {
    if (error instanceof ActionError) return { ok: false, error: error.message };
    console.error(error);
    return { ok: false, error: "Si è verificato un errore. Riprova." };
  }
}

export async function setTheme(theme: string) {
  const parsed = themeSchema.safeParse(theme);
  if (!parsed.success) return;
  const store = await cookies();
  store.set(THEME_COOKIE, parsed.data, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}
