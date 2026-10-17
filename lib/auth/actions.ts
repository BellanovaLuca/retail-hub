"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { validateNewPin } from "@/lib/auth/pin";
import { authPassword } from "@/lib/auth/secret";
import { getCurrentProfile } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { THEME_COOKIE, themeSchema } from "@/lib/theme";

export type ActionResult = { ok: true } | { ok: false; error: string };

const changePinSchema = z.object({
  pin: z.string(),
  confirm: z.string(),
  acceptPrivacy: z.boolean().optional(),
});

/**
 * Cambio PIN: al primo accesso (obbligatorio, con accettazione dell'informativa)
 * e dal profilo.
 */
export async function changePin(input: z.infer<typeof changePinSchema>): Promise<ActionResult> {
  const parsed = changePinSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Dati non validi." };
  const { pin, confirm, acceptPrivacy } = parsed.data;

  const profile = await getCurrentProfile();
  if (!profile || !profile.active)
    return { ok: false, error: "Sessione scaduta: accedi di nuovo." };

  const pinError = validateNewPin(pin, profile.role);
  if (pinError) return { ok: false, error: pinError };
  if (pin !== confirm) return { ok: false, error: "I due PIN non coincidono." };
  if (!profile.privacy_accepted_at && !acceptPrivacy) {
    return { ok: false, error: "Per continuare devi accettare l'informativa privacy." };
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

  return { ok: true };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/accesso");
}

/** Esce da tutti i dispositivi (revoca tutte le sessioni). */
export async function signOutEverywhere() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "global" });
  redirect("/accesso");
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
