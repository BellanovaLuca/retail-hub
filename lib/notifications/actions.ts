"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authedAction, dbErrorMessage, runAction, type ActionResult } from "@/lib/auth/guards";

const subscriptionSchema = z.object({
  endpoint: z.url().max(1000),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
});

export async function savePushSubscription(
  input: z.input<typeof subscriptionSchema>,
  userAgent: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, profile } = await authedAction();
    const parsed = subscriptionSchema.safeParse(input);
    if (!parsed.success) return { ok: false, message: "Sottoscrizione non valida." };
    // Lo stesso dispositivo può passare a un altro utente: si riassegna.
    await supabase.from("push_subscriptions").delete().eq("endpoint", parsed.data.endpoint);
    const { error } = await supabase.from("push_subscriptions").insert({
      profile_id: profile.id,
      endpoint: parsed.data.endpoint,
      keys: parsed.data.keys,
      user_agent: userAgent.slice(0, 200),
    });
    if (error) return { ok: false, message: dbErrorMessage(error, "Notifiche non attivate.") };
    return { ok: true, message: "Notifiche attive su questo dispositivo." };
  });
}

export async function deletePushSubscription(endpoint: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await authedAction();
    await supabase
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", z.string().max(1000).parse(endpoint));
    return { ok: true, message: "Notifiche disattivate su questo dispositivo." };
  });
}

export async function markNotificationRead(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, profile } = await authedAction();
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", z.uuid().parse(id))
      .eq("profile_id", profile.id);
    revalidatePath("/notifiche");
    return { ok: true };
  });
}

export async function markAllNotificationsRead(): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, profile } = await authedAction();
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("profile_id", profile.id)
      .is("read_at", null);
    revalidatePath("/", "layout");
    return { ok: true, message: "Tutte segnate come lette." };
  });
}

export async function unreadNotificationsCount(): Promise<number> {
  try {
    const { supabase, profile } = await authedAction();
    const { count } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", profile.id)
      .is("read_at", null);
    return count ?? 0;
  } catch {
    return 0;
  }
}

const prefsSchema = z.object({
  push: z.boolean(),
  email: z.boolean(),
  shift_reminder: z.boolean(),
});

/** Preferenze di notifica ed email/telefono: i soli campi che il dipendente modifica da sé. */
export async function saveNotificationSettings(input: {
  prefs: z.input<typeof prefsSchema>;
  email: string;
  phone: string;
}): Promise<ActionResult> {
  return runAction(async () => {
    const { profile } = await authedAction();
    const parsed = z
      .object({
        prefs: prefsSchema,
        email: z.union([z.literal(""), z.email("Email non valida.")]),
        phone: z.string().trim().max(30),
      })
      .safeParse(input);
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
    const v = parsed.data;
    if (v.prefs.email && !v.email)
      return { ok: false, message: "Per ricevere le email inserisci un indirizzo." };

    // notification_prefs non è tra i campi modificabili dal dipendente via RLS (guardia sul profilo):
    // l'aggiornamento passa dal server, solo sulla riga della persona collegata.
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const { error } = await createAdminClient()
      .from("profiles")
      .update({ notification_prefs: v.prefs, email: v.email || null, phone: v.phone || null })
      .eq("id", profile.id);
    if (error) return { ok: false, message: dbErrorMessage(error, "Preferenze non salvate.") };
    revalidatePath("/profilo");
    return { ok: true, message: "Preferenze salvate." };
  });
}
