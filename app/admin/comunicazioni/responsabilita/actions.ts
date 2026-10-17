"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { nowInRome, toISODate } from "@/lib/dates";
import {
  ActionError,
  adminAction,
  dbErrorMessage,
  runAction,
  zodFieldErrors,
  type ActionResult,
} from "@/lib/auth/guards";
import { attachmentSchema, parseAttachments } from "@/lib/announcements/model";
import { removeAttachmentFiles } from "@/lib/announcements/storage";
import { notify } from "@/lib/notifications";
import { scheduleLabel } from "@/lib/responsibilities/labels";

function revalidateAll() {
  revalidatePath("/admin/comunicazioni/responsabilita", "layout");
  revalidatePath("/comunicazioni/responsabilita");
  revalidatePath("/");
}

const responsibilitySchema = z
  .object({
    id: z.uuid(),
    title: z.string().trim().min(1, "Scrivi un titolo.").max(120, "Titolo troppo lungo."),
    description: z.string().max(20000, "Testo troppo lungo."),
    scheduleDays: z.array(z.number().int().min(1).max(7)).min(1, "Scegli almeno un giorno.").max(7),
    active: z.boolean(),
    allStaff: z.boolean(),
    ownerId: z.uuid().nullable(),
    supportIds: z.array(z.uuid()).max(30),
    attachments: z.array(attachmentSchema).max(20),
  })
  .superRefine((v, ctx) => {
    if (!v.allStaff && !v.ownerId)
      ctx.addIssue({
        code: "custom",
        path: ["ownerId"],
        message: "Scegli il responsabile, oppure indica che è un'attività per tutti.",
      });
    if (v.ownerId && v.supportIds.includes(v.ownerId))
      ctx.addIssue({
        code: "custom",
        path: ["supportIds"],
        message: "Il responsabile non può essere anche supporto.",
      });
    if (new Set(v.supportIds).size !== v.supportIds.length)
      ctx.addIssue({ code: "custom", path: ["supportIds"], message: "Persone ripetute." });
  });

export type ResponsibilityInput = z.input<typeof responsibilitySchema>;

type Assignee = { profile_id: string; role: "owner" | "support"; sort_order: number };

/**
 * Crea o modifica un'attività con le sue assegnazioni. Le assegnazioni cambiate si tolgono e si
 * rimettono (mai update): così il registro modifiche conserva lo storico completo di chi era
 * responsabile e da quando. I nuovi assegnatari ricevono la notifica `assignment_new`.
 */
export async function saveResponsibility(
  input: ResponsibilityInput,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const parsed = responsibilitySchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        message: "Controlla i campi evidenziati.",
        fieldErrors: zodFieldErrors(parsed.error.issues),
      };
    }
    const v = parsed.data;
    const { supabase } = await adminAction();

    const [{ data: existing }, { data: oldAssignees }] = await Promise.all([
      supabase.from("responsibilities").select("id, attachments").eq("id", v.id).maybeSingle(),
      supabase
        .from("responsibility_assignees")
        .select("profile_id, role, sort_order")
        .eq("responsibility_id", v.id),
    ]);

    const row = {
      title: v.title,
      description_md: v.description,
      schedule_days: [...new Set(v.scheduleDays)].sort(),
      active: v.active,
      all_staff: v.allStaff,
      attachments: v.attachments,
    };
    if (existing) {
      const { error } = await supabase.from("responsibilities").update(row).eq("id", v.id);
      if (error) return { ok: false, message: dbErrorMessage(error, "Attività non salvata.") };
    } else {
      const { data: last } = await supabase
        .from("responsibilities")
        .select("sort_order")
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      const { error } = await supabase
        .from("responsibilities")
        .insert({ id: v.id, ...row, sort_order: (last?.sort_order ?? 0) + 1 });
      if (error) return { ok: false, message: dbErrorMessage(error, "Attività non salvata.") };
    }

    // Assegnazioni desiderate.
    const desired: Assignee[] = v.allStaff
      ? []
      : [
          ...(v.ownerId ? [{ profile_id: v.ownerId, role: "owner" as const, sort_order: 0 }] : []),
          ...v.supportIds.map((id, i) => ({
            profile_id: id,
            role: "support" as const,
            sort_order: i + 1,
          })),
        ];
    const same = (a: Assignee, b: Assignee) =>
      a.profile_id === b.profile_id && a.role === b.role && a.sort_order === b.sort_order;
    const old = (oldAssignees ?? []) as Assignee[];
    const toRemove = old.filter((o) => !desired.some((d) => same(o, d)));
    const toAdd = desired.filter((d) => !old.some((o) => same(o, d)));

    if (toRemove.length > 0) {
      const { error } = await supabase
        .from("responsibility_assignees")
        .delete()
        .eq("responsibility_id", v.id)
        .in(
          "profile_id",
          toRemove.map((r) => r.profile_id),
        );
      if (error) return { ok: false, message: dbErrorMessage(error, "Assegnazioni non salvate.") };
    }
    if (toAdd.length > 0) {
      const { error } = await supabase
        .from("responsibility_assignees")
        .insert(toAdd.map((a) => ({ ...a, responsibility_id: v.id })));
      if (error) return { ok: false, message: dbErrorMessage(error, "Assegnazioni non salvate.") };
    }

    if (existing) {
      const kept = new Set(v.attachments.map((a) => a.path));
      await removeAttachmentFiles(
        parseAttachments(existing.attachments)
          .map((a) => a.path)
          .filter((p) => !kept.has(p)),
      );
    }

    // Notifica solo chi prima non era assegnato con quel ruolo.
    const oldKey = new Set(old.map((o) => `${o.profile_id}:${o.role}`));
    const newcomers = desired.filter((d) => !oldKey.has(`${d.profile_id}:${d.role}`));
    const days = scheduleLabel(row.schedule_days);
    await Promise.all(
      (["owner", "support"] as const).map((role) =>
        notify(
          newcomers.filter((n) => n.role === role).map((n) => n.profile_id),
          {
            kind: "assignment_new",
            title:
              role === "owner"
                ? `Sei responsabile di «${v.title}»`
                : `Sei di supporto per «${v.title}»`,
            body: `Nuova responsabilità · ${days}`,
            link: "/comunicazioni/responsabilita",
          },
        ),
      ),
    );

    revalidateAll();
    return {
      ok: true,
      message: existing ? "Attività aggiornata." : "Attività creata.",
      data: { id: v.id },
    };
  });
}

const idSchema = z.uuid();

/** Elimina un'attività con tutte le sue spunte (meglio disattivarla, per conservarle). */
export async function deleteResponsibility(id: string): Promise<ActionResult> {
  return runAction(async () => {
    if (!idSchema.safeParse(id).success) throw new ActionError("Attività non valida.");
    const { supabase } = await adminAction();
    const { data, error } = await supabase
      .from("responsibilities")
      .delete()
      .eq("id", id)
      .select("attachments");
    if (error) return { ok: false, message: dbErrorMessage(error, "Eliminazione non riuscita.") };
    await removeAttachmentFiles(parseAttachments(data?.[0]?.attachments).map((a) => a.path));
    revalidateAll();
    return { ok: true, message: "Attività eliminata." };
  });
}

export async function reorderResponsibilities(orderedIds: string[]): Promise<ActionResult> {
  return runAction(async () => {
    const parsed = z.array(z.uuid()).max(200).safeParse(orderedIds);
    if (!parsed.success) throw new ActionError("Ordine non valido.");
    const { supabase } = await adminAction();
    const results = await Promise.all(
      parsed.data.map((id, i) =>
        supabase
          .from("responsibilities")
          .update({ sort_order: i + 1 })
          .eq("id", id),
      ),
    );
    const failed = results.find((r) => r.error);
    if (failed) return { ok: false, message: dbErrorMessage(failed.error, "Ordine non salvato.") };
    revalidateAll();
    return { ok: true, message: "Ordine salvato." };
  });
}

// ---------------------------------------------------------------------------
// Attività extra
// ---------------------------------------------------------------------------

const extraTaskSchema = z.object({
  title: z.string().trim().min(1, "Scrivi un titolo.").max(160, "Titolo troppo lungo."),
  description: z.string().max(10000, "Testo troppo lungo."),
  dueDate: z
    .union([z.iso.date(), z.literal("")])
    .refine((d) => !d || d >= toISODate(nowInRome()), "La scadenza non può essere nel passato."),
  assigneeIds: z.array(z.uuid()).min(1, "Scegli almeno una persona.").max(50),
});

export type ExtraTaskInput = z.input<typeof extraTaskSchema>;

export async function createExtraTask(input: ExtraTaskInput): Promise<ActionResult> {
  return runAction(async () => {
    const parsed = extraTaskSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        message: "Controlla i campi evidenziati.",
        fieldErrors: zodFieldErrors(parsed.error.issues),
      };
    }
    const v = parsed.data;
    const { supabase, profile } = await adminAction();
    const { data: task, error } = await supabase
      .from("extra_tasks")
      .insert({
        title: v.title,
        description_md: v.description,
        due_date: v.dueDate || null,
        created_by: profile.id,
      })
      .select("id")
      .single();
    if (error || !task)
      return { ok: false, message: dbErrorMessage(error, "Attività non salvata.") };
    const { error: aError } = await supabase
      .from("extra_task_assignees")
      .insert(v.assigneeIds.map((id) => ({ task_id: task.id, profile_id: id })));
    if (aError) return { ok: false, message: dbErrorMessage(aError, "Assegnatari non salvati.") };

    await notify(v.assigneeIds, {
      kind: "assignment_new",
      title: `Nuova attività extra: ${v.title}`,
      body: v.dueDate
        ? `Da fare entro il ${new Date(`${v.dueDate}T12:00:00`).toLocaleDateString("it-IT", { day: "numeric", month: "long" })}.`
        : "Segnala «Fatto» quando l'hai completata.",
      link: "/comunicazioni/responsabilita",
    });
    revalidateAll();
    return { ok: true, message: "Attività extra creata e notificata." };
  });
}

/** Annulla (resta nello storico) o elimina un'attività extra. */
export async function closeExtraTask(id: string, mode: "cancel" | "delete"): Promise<ActionResult> {
  return runAction(async () => {
    if (!idSchema.safeParse(id).success) throw new ActionError("Attività non valida.");
    const { supabase } = await adminAction();
    const { error } =
      mode === "cancel"
        ? await supabase.from("extra_tasks").update({ status: "cancelled" }).eq("id", id)
        : await supabase.from("extra_tasks").delete().eq("id", id);
    if (error) return { ok: false, message: dbErrorMessage(error, "Operazione non riuscita.") };
    revalidateAll();
    return { ok: true, message: mode === "cancel" ? "Attività annullata." : "Attività eliminata." };
  });
}
