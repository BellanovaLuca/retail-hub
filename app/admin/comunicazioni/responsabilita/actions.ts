"use server";

import { getISOWeek, parseISO } from "date-fns";
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
import { getResponsibilities } from "@/lib/data/responsibilities";
import { notify, notifyEach } from "@/lib/notifications";
import {
  daysOfPerson,
  gridState,
  isoWeekdayOf,
  mondayOf,
  normalizePersonDays,
} from "@/lib/responsibilities/assignment";
import { scheduleLabel } from "@/lib/responsibilities/labels";

function revalidateAll() {
  revalidatePath("/admin/comunicazioni/responsabilita", "layout");
  revalidatePath("/comunicazioni/responsabilita", "layout");
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

    const currentWeek = mondayOf(toISODate(nowInRome()));
    const [{ data: existing }, { data: oldAssignees }, { data: weekRows, error: weekError }] =
      await Promise.all([
        supabase
          .from("responsibilities")
          .select("id, attachments, all_staff")
          .eq("id", v.id)
          .maybeSingle(),
        supabase
          .from("responsibility_assignees")
          .select("profile_id, role, sort_order")
          .eq("responsibility_id", v.id),
        supabase
          .from("responsibility_week_assignments")
          .select("week_start, profile_ids")
          .eq("responsibility_id", v.id)
          .order("week_start", { ascending: false }),
      ]);
    if (weekError)
      return { ok: false, message: dbErrorMessage(weekError, "Attività non salvata.") };
    const grid = gridState(weekRows ?? [], currentWeek);
    // Entrando o uscendo da «Per tutti» le assegnazioni della griglia da questa settimana in poi
    // si tolgono: altrimenti, togliendo «Per tutti», tornerebbe in vigore un gruppo vecchio.
    const clearGrid = grid.any && (v.allStaff || existing?.all_staff === true);
    // Assegnata dalla griglia «Chi fa cosa»: persone e giorni si scelgono lì. Dalla scheda non
    // si toccano (non avrebbero effetto) e nessuno viene avvisato di una responsabilità che non ha.
    const gridManaged = !v.allStaff && (clearGrid ? grid.hasPast : grid.inForce);

    const scheduleDays = [...new Set(v.scheduleDays)].sort();
    const row = {
      title: v.title,
      description_md: v.description,
      ...(gridManaged ? {} : { schedule_days: scheduleDays }),
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

    if (clearGrid) {
      const { error } = await supabase
        .from("responsibility_week_assignments")
        .delete()
        .eq("responsibility_id", v.id)
        .gte("week_start", currentWeek);
      if (error) return { ok: false, message: dbErrorMessage(error, "Assegnazioni non salvate.") };
      // Se valeva un gruppo ripreso da una settimana passata, lo si chiude qui con una riga
      // vuota: le settimane passate restano com'erano.
      if (grid.pastTeam) {
        const { error: emptyError } = await supabase
          .from("responsibility_week_assignments")
          .insert({ responsibility_id: v.id, week_start: currentWeek, profile_ids: [] });
        if (emptyError)
          return { ok: false, message: dbErrorMessage(emptyError, "Assegnazioni non salvate.") };
      }
    }

    // Assegnazioni desiderate (con la griglia in vigore restano quelle che sono).
    const old = (oldAssignees ?? []) as Assignee[];
    const desired: Assignee[] = gridManaged
      ? old
      : v.allStaff
        ? []
        : [
            ...(v.ownerId
              ? [{ profile_id: v.ownerId, role: "owner" as const, sort_order: 0 }]
              : []),
            ...v.supportIds.map((id, i) => ({
              profile_id: id,
              role: "support" as const,
              sort_order: i + 1,
            })),
          ];
    const same = (a: Assignee, b: Assignee) =>
      a.profile_id === b.profile_id && a.role === b.role && a.sort_order === b.sort_order;
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
      if (error) {
        // Si rimettono le assegnazioni appena tolte: meglio lo stato di prima che uno a metà.
        if (toRemove.length > 0)
          await supabase
            .from("responsibility_assignees")
            .insert(toRemove.map((a) => ({ ...a, responsibility_id: v.id })));
        return { ok: false, message: dbErrorMessage(error, "Assegnazioni non salvate.") };
      }
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
    const days = scheduleLabel(scheduleDays);
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

// ---------------------------------------------------------------------------
// Assegnazione settimanale (griglia persone × attività)
// ---------------------------------------------------------------------------

const weekAssignmentsSchema = z.object({
  weekStart: z.iso.date().refine((d) => isoWeekdayOf(d) === 1, "Serve il lunedì della settimana."),
  changes: z
    .array(
      z.object({
        responsibilityId: z.uuid(),
        /** Per ogni persona, i giorni (1 = lunedì … 7 = domenica) in cui fa l'attività. */
        personDays: z
          .record(z.uuid(), z.array(z.number().int().min(1).max(7)).max(7))
          .refine((r) => Object.keys(r).length <= 100, "Troppe persone."),
      }),
    )
    .min(1, "Nessuna modifica da salvare.")
    .max(200),
});

export type WeekAssignmentsInput = z.input<typeof weekAssignmentsSchema>;

/**
 * Salva chi fa cosa nella settimana, giorno per giorno: per ogni attività cambiata, le persone
 * (una o più) e i giorni di ciascuna. L'assegnazione vale anche per le settimane seguenti finché
 * non si cambia. Chi riceve un'attività nuova, o giorni diversi, viene avvisato con un'unica
 * notifica.
 */
export async function saveWeekAssignments(
  input: WeekAssignmentsInput,
): Promise<ActionResult<{ saved: number }>> {
  return runAction(async () => {
    const parsed = weekAssignmentsSchema.safeParse(input);
    if (!parsed.success) throw new ActionError(parsed.error.issues[0].message);
    const { weekStart } = parsed.data;
    const changes = parsed.data.changes.map((c) => ({
      responsibilityId: c.responsibilityId,
      personDays: normalizePersonDays(c.personDays),
    }));
    const currentWeek = mondayOf(toISODate(nowInRome()));
    if (weekStart < currentWeek)
      throw new ActionError("Le settimane passate non si possono più modificare.");
    if (new Set(changes.map((c) => c.responsibilityId)).size !== changes.length)
      throw new ActionError("Attività ripetute.");

    const { supabase } = await adminAction();
    // Prima del salvataggio: chi era già assegnato quella settimana e in quali giorni.
    const before = await getResponsibilities(supabase, { includeInactive: true, week: weekStart });
    const byId = new Map(before.map((r) => [r.id, r]));
    for (const c of changes) {
      const r = byId.get(c.responsibilityId);
      if (!r) throw new ActionError("Attività non trovata: ricarica la pagina.");
      if (r.allStaff) throw new ActionError(`«${r.title}» è un'attività per tutti.`);
    }

    const { error } = await supabase.from("responsibility_week_assignments").upsert(
      changes.map((c) => ({
        responsibility_id: c.responsibilityId,
        week_start: weekStart,
        profile_ids: Object.keys(c.personDays),
        person_days: c.personDays,
      })),
      { onConflict: "responsibility_id,week_start" },
    );
    if (error) return { ok: false, message: dbErrorMessage(error, "Assegnazioni non salvate.") };

    // Una notifica per persona: le attività nuove e quelle con i giorni cambiati.
    const news = new Map<string, { title: string; days: number[]; isNew: boolean }[]>();
    for (const c of changes) {
      const r = byId.get(c.responsibilityId)!;
      for (const [id, days] of Object.entries(c.personDays)) {
        const old = daysOfPerson(r, id);
        if (old.join() === days.join()) continue;
        news.set(id, [...(news.get(id) ?? []), { title: r.title, days, isNew: old.length === 0 }]);
      }
    }
    const week = `Week ${getISOWeek(parseISO(weekStart))}`;
    await notifyEach(
      [...news].map(([profileId, list]) => ({
        profileId,
        notification: {
          kind: "assignment_new" as const,
          title: !list.every((x) => x.isNew)
            ? `${week}: cambiano le tue responsabilità`
            : list.length === 1
              ? `${week}: ti occupi di «${list[0].title}»`
              : `${week}: ti occupi di ${list.length} attività`,
          body: list.map((x) => `${x.title} (${scheduleLabel(x.days)})`).join(" · "),
          link: "/comunicazioni/responsabilita",
        },
      })),
    );

    revalidateAll();
    const n = changes.length;
    return {
      ok: true,
      message: `${n === 1 ? "Assegnazione salvata" : `${n} assegnazioni salvate`}${news.size ? ` · avvisate ${news.size} ${news.size === 1 ? "persona" : "persone"}` : ""}.`,
      data: { saved: n },
    };
  });
}

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

const quickTitleSchema = z
  .string()
  .trim()
  .min(1, "Scrivi il nome della responsabilità.")
  .max(120, "Nome troppo lungo.");

/**
 * Aggiunge al volo una responsabilità dalla griglia «Chi fa cosa»: prevista tutti i giorni, senza
 * procedura (si completa poi dalla sua scheda) e senza persone (si spuntano nella griglia).
 */
export async function quickAddResponsibility(title: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const parsed = quickTitleSchema.safeParse(title);
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
    const { supabase } = await adminAction();
    const { data: all } = await supabase
      .from("responsibilities")
      .select("title, active, sort_order");
    const same = (all ?? []).find(
      (r) => r.title.trim().toLowerCase() === parsed.data.toLowerCase(),
    );
    if (same)
      return {
        ok: false,
        message: same.active
          ? `«${same.title}» c'è già.`
          : `«${same.title}» esiste ma è stata tolta dal tabellone: rimettila dall'elenco «Attività» qui sotto.`,
      };
    const { data, error } = await supabase
      .from("responsibilities")
      .insert({
        title: parsed.data,
        sort_order: Math.max(0, ...(all ?? []).map((r) => r.sort_order)) + 1,
      })
      .select("id")
      .single();
    if (error || !data)
      return { ok: false, message: dbErrorMessage(error, "Responsabilità non aggiunta.") };
    revalidateAll();
    return { ok: true, message: `«${parsed.data}» aggiunta.`, data: { id: data.id } };
  });
}

/** Toglie dal tabellone (o rimette) una responsabilità conservandone lo storico delle spunte. */
export async function setResponsibilityActive(id: string, active: boolean): Promise<ActionResult> {
  return runAction(async () => {
    if (!idSchema.safeParse(id).success) throw new ActionError("Attività non valida.");
    const { supabase } = await adminAction();
    const { data, error } = await supabase
      .from("responsibilities")
      .update({ active })
      .eq("id", id)
      .select("id");
    if (error) return { ok: false, message: dbErrorMessage(error, "Operazione non riuscita.") };
    if (!data?.length) return { ok: false, message: "Attività non trovata: ricarica la pagina." };
    revalidateAll();
    return {
      ok: true,
      message: active
        ? "Responsabilità rimessa nel tabellone."
        : "Responsabilità tolta dal tabellone.",
    };
  });
}

const daysSchema = z
  .array(z.number().int().min(1).max(7))
  .min(1, "Scegli almeno un giorno.")
  .max(7);

/** Cambia i giorni della settimana in cui la responsabilità è prevista (1 = lunedì … 7 = domenica). */
export async function setResponsibilityDays(id: string, days: number[]): Promise<ActionResult> {
  return runAction(async () => {
    if (!idSchema.safeParse(id).success) throw new ActionError("Attività non valida.");
    const parsed = daysSchema.safeParse(days);
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
    const { supabase } = await adminAction();
    const { data, error } = await supabase
      .from("responsibilities")
      .update({ schedule_days: [...new Set(parsed.data)].sort() })
      .eq("id", id)
      .select("id");
    if (error) return { ok: false, message: dbErrorMessage(error, "Giorni non salvati.") };
    if (!data?.length) return { ok: false, message: "Attività non trovata: ricarica la pagina." };
    revalidateAll();
    return { ok: true, message: "Giorni aggiornati." };
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
    if (aError) {
      // Niente attività senza assegnatari: si annulla la creazione.
      await supabase.from("extra_tasks").delete().eq("id", task.id);
      return { ok: false, message: dbErrorMessage(aError, "Assegnatari non salvati.") };
    }

    await notify(v.assigneeIds, {
      kind: "assignment_new",
      title: `Nuova attività extra: ${v.title}`,
      body: v.dueDate
        ? `Da fare entro il ${new Date(`${v.dueDate}T12:00:00`).toLocaleDateString("it-IT", { day: "numeric", month: "long" })}.`
        : "Segnala «Fatto» quando l'hai completata.",
      link: "/comunicazioni/responsabilita/spunte",
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
