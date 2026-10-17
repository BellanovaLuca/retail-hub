"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  ActionError,
  adminAction,
  dbErrorMessage,
  runAction,
  zodFieldErrors,
  type ActionResult,
} from "@/lib/auth/guards";
import {
  announcementInputSchema,
  fromRomeLocalInput,
  parseAttachments,
  type AnnouncementInput,
} from "@/lib/announcements/model";
import { notifyAnnouncement, remindAnnouncement } from "@/lib/announcements/notify";
import { removeAttachmentFiles } from "@/lib/announcements/storage";

function revalidateAll(id?: string) {
  revalidatePath("/admin/comunicazioni");
  revalidatePath("/comunicazioni");
  if (id) revalidatePath(`/comunicazioni/${id}`);
  revalidatePath("/");
  revalidatePath("/admin");
}

/**
 * Crea o aggiorna una comunicazione. L'id lo genera l'editor, così gli allegati si caricano
 * nella cartella giusta già prima del primo salvataggio. Se è già il momento della
 * pubblicazione, notifica i destinatari (una volta sola); le programmate le notifica il cron
 * con `sendDueAnnouncementNotifications()`.
 */
export async function saveAnnouncement(
  input: AnnouncementInput,
): Promise<ActionResult<{ id: string; notified: number; scheduled: boolean }>> {
  return runAction(async () => {
    const parsed = announcementInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        message: "Controlla i campi evidenziati.",
        fieldErrors: zodFieldErrors(parsed.error.issues),
      };
    }
    const v = parsed.data;
    const { supabase, profile } = await adminAction();

    const id = v.id ?? crypto.randomUUID();
    const { data: existing } = await supabase
      .from("announcements")
      .select("id, attachments, publish_at")
      .eq("id", id)
      .maybeSingle();

    const publishAt = v.publishAt
      ? fromRomeLocalInput(v.publishAt)!
      : (existing?.publish_at ?? new Date().toISOString());
    const row = {
      title: v.title,
      body_md: v.body,
      category: v.category,
      audience: v.audience,
      department_ids: v.audience === "department" ? v.departmentIds : [],
      profile_ids: v.audience === "people" ? v.profileIds : [],
      pinned: v.pinned,
      requires_ack: v.requiresAck,
      attachments: v.attachments,
      publish_at: publishAt,
      expires_at: v.expiresAt ? fromRomeLocalInput(v.expiresAt) : null,
    };

    if (existing) {
      const { error } = await supabase.from("announcements").update(row).eq("id", id);
      if (error) return { ok: false, message: dbErrorMessage(error, "Comunicazione non salvata.") };
      const kept = new Set(v.attachments.map((a) => a.path));
      await removeAttachmentFiles(
        parseAttachments(existing.attachments)
          .map((a) => a.path)
          .filter((p) => !kept.has(p)),
      );
    } else {
      const { error } = await supabase
        .from("announcements")
        .insert({ id, ...row, author_id: profile.id });
      if (error) return { ok: false, message: dbErrorMessage(error, "Comunicazione non salvata.") };
    }

    const scheduled = new Date(publishAt) > new Date();
    const notified = scheduled ? 0 : await notifyAnnouncement(id);
    revalidateAll(id);
    return {
      ok: true,
      message: scheduled
        ? "Comunicazione programmata."
        : notified > 0
          ? `Comunicazione pubblicata: notificata a ${notified} ${notified === 1 ? "persona" : "persone"}.`
          : "Comunicazione salvata.",
      data: { id, notified, scheduled },
    };
  });
}

const idSchema = z.uuid();

export async function deleteAnnouncement(id: string): Promise<ActionResult> {
  return runAction(async () => {
    if (!idSchema.safeParse(id).success) throw new ActionError("Comunicazione non valida.");
    const { supabase } = await adminAction();
    const { data, error } = await supabase
      .from("announcements")
      .delete()
      .eq("id", id)
      .select("attachments");
    if (error) return { ok: false, message: dbErrorMessage(error, "Eliminazione non riuscita.") };
    await removeAttachmentFiles(parseAttachments(data?.[0]?.attachments).map((a) => a.path));
    revalidateAll(id);
    return { ok: true, message: "Comunicazione eliminata." };
  });
}

/** "Sollecita": promemoria in-app e push a chi non ha letto o non ha confermato. */
export async function remindUnread(id: string): Promise<ActionResult<{ count: number }>> {
  return runAction(async () => {
    if (!idSchema.safeParse(id).success) throw new ActionError("Comunicazione non valida.");
    const { supabase } = await adminAction();
    const { data: a } = await supabase
      .from("announcements")
      .select("publish_at")
      .eq("id", id)
      .maybeSingle();
    if (!a) throw new ActionError("Comunicazione non trovata.");
    if (new Date(a.publish_at) > new Date())
      throw new ActionError("La comunicazione non è ancora pubblicata.");
    const count = await remindAnnouncement(id);
    return {
      ok: true,
      message:
        count === 0
          ? "Tutti i destinatari l'hanno già letta."
          : `Sollecito inviato a ${count} ${count === 1 ? "persona" : "persone"}.`,
      data: { count },
    };
  });
}
