"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  ActionError,
  authedAction,
  dbErrorMessage,
  runAction,
  type ActionResult,
} from "@/lib/auth/guards";

const id = z.uuid();

/** Segna come letta all'apertura (la prima lettura resta: niente sovrascritture). */
export async function markAnnouncementRead(announcementId: string): Promise<ActionResult> {
  return runAction(async () => {
    const parsed = id.safeParse(announcementId);
    if (!parsed.success) throw new ActionError("Comunicazione non valida.");
    const { supabase, profile } = await authedAction();
    const { error } = await supabase
      .from("announcement_reads")
      .upsert(
        { announcement_id: parsed.data, profile_id: profile.id },
        { onConflict: "announcement_id,profile_id", ignoreDuplicates: true },
      );
    if (error) return { ok: false, message: dbErrorMessage(error, "Lettura non registrata.") };
    revalidatePath("/comunicazioni");
    revalidatePath("/");
    return { ok: true };
  });
}

/** "Ho letto": conferma di lettura. */
export async function acknowledgeAnnouncement(announcementId: string): Promise<ActionResult> {
  return runAction(async () => {
    const parsed = id.safeParse(announcementId);
    if (!parsed.success) throw new ActionError("Comunicazione non valida.");
    const { supabase, profile } = await authedAction();
    const { data: a } = await supabase
      .from("announcements")
      .select("id, requires_ack")
      .eq("id", parsed.data)
      .maybeSingle();
    if (!a) throw new ActionError("Comunicazione non disponibile.");
    if (!a.requires_ack) throw new ActionError("Questa comunicazione non richiede conferma.");
    const { error } = await supabase.from("announcement_reads").upsert(
      {
        announcement_id: a.id,
        profile_id: profile.id,
        acknowledged_at: new Date().toISOString(),
      },
      { onConflict: "announcement_id,profile_id" },
    );
    if (error) return { ok: false, message: dbErrorMessage(error, "Conferma non registrata.") };
    revalidatePath("/comunicazioni");
    revalidatePath(`/comunicazioni/${a.id}`);
    revalidatePath("/admin/comunicazioni");
    revalidatePath("/");
    return { ok: true, message: "Lettura confermata." };
  });
}
