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
import { nowInRome, toISODate } from "@/lib/dates";
import { canToggleCheck, isScheduledOn } from "./assignment";

function revalidateBoards() {
  revalidatePath("/comunicazioni/responsabilita", "layout");
  revalidatePath("/admin/comunicazioni/responsabilita");
  revalidatePath("/");
}

const toggleSchema = z.object({
  responsibilityId: z.uuid(),
  date: z.iso.date(),
  done: z.boolean(),
  /** Solo admin: segna l'attività come svolta da questa persona (dal controllo delle spunte). */
  onBehalfOf: z.uuid().optional(),
});

export type CheckResult = { doneByName: string; doneAt: string } | null;

/**
 * Spunta (o toglie la spunta) di un'attività in una data. Il controllo vero è la policy RLS:
 * qui si ripete per dare un messaggio chiaro.
 */
export async function toggleResponsibilityCheck(input: {
  responsibilityId: string;
  date: string;
  done: boolean;
  onBehalfOf?: string;
}): Promise<ActionResult<CheckResult>> {
  return runAction(async () => {
    const parsed = toggleSchema.safeParse(input);
    if (!parsed.success) throw new ActionError("Dati non validi.");
    const { responsibilityId, date, done, onBehalfOf } = parsed.data;
    const { supabase, profile } = await authedAction();
    const isAdmin = profile.role === "admin";
    if (onBehalfOf && !isAdmin) throw new ActionError("Operazione riservata ai responsabili.");

    // Assegnato quel giorno: gruppo della settimana, se c'è, altrimenti responsabile e supporti.
    const [{ data: r }, { data: assignee }] = await Promise.all([
      supabase
        .from("responsibilities")
        .select("id, all_staff, schedule_days, active")
        .eq("id", responsibilityId)
        .maybeSingle(),
      supabase.rpc("is_responsibility_assignee_on", {
        p_responsibility_id: responsibilityId,
        uid: profile.id,
        p_date: date,
      }),
    ]);
    if (!r) throw new ActionError("Attività non trovata.");
    const today = toISODate(nowInRome());
    if (done && date > today) throw new ActionError("Non si può spuntare un giorno futuro.");
    if (done && !isAdmin) {
      if (!r.active) throw new ActionError("Questa attività non è più attiva.");
      if (!isScheduledOn(r.schedule_days, date))
        throw new ActionError("L'attività non è prevista in questo giorno.");
    }
    const allowed = canToggleCheck({
      isAdmin,
      isAssignee: !!assignee,
      allStaff: r.all_staff,
      date,
      today,
    });
    if (!allowed) {
      throw new ActionError(
        !assignee && !r.all_staff
          ? "Puoi spuntare solo le attività che ti sono assegnate."
          : "Puoi spuntare solo le attività di oggi o di ieri.",
      );
    }

    if (done) {
      const doneAt = new Date().toISOString();
      let doneById = profile.id;
      let doneByName = profile.display_name;
      if (onBehalfOf && onBehalfOf !== profile.id) {
        const { data: person } = await supabase
          .from("public_profiles")
          .select("id, display_name")
          .eq("id", onBehalfOf)
          .maybeSingle();
        if (!person?.id) throw new ActionError("Persona non trovata.");
        doneById = person.id;
        doneByName = person.display_name ?? "—";
      }
      const { error } = await supabase.from("responsibility_checks").insert({
        responsibility_id: responsibilityId,
        date,
        done_by: doneById,
        done_at: doneAt,
        note: doneById !== profile.id ? `Segnata da ${profile.display_name}` : null,
      });
      if (error && error.code !== "23505")
        return { ok: false, message: dbErrorMessage(error, "Spunta non salvata.") };
      revalidateBoards();
      if (error) {
        // Già spuntata da qualcun altro nel frattempo: si restituisce la spunta vera.
        const { data: existing } = await supabase
          .from("responsibility_checks")
          .select("done_by, done_at")
          .eq("responsibility_id", responsibilityId)
          .eq("date", date)
          .maybeSingle();
        if (existing) {
          const { data: who } = existing.done_by
            ? await supabase
                .from("public_profiles")
                .select("display_name")
                .eq("id", existing.done_by)
                .maybeSingle()
            : { data: null };
          return {
            ok: true,
            data: { doneByName: who?.display_name ?? "—", doneAt: existing.done_at },
          };
        }
      }
      return { ok: true, data: { doneByName, doneAt } };
    }

    const { data: removed, error } = await supabase
      .from("responsibility_checks")
      .delete()
      .eq("responsibility_id", responsibilityId)
      .eq("date", date)
      .select("id");
    if (error) return { ok: false, message: dbErrorMessage(error, "Spunta non tolta.") };
    if (!removed?.length) {
      // RLS nasconde le righe che non si possono cancellare: verifichiamo se esiste ancora.
      const { data: still } = await supabase
        .from("responsibility_checks")
        .select("id")
        .eq("responsibility_id", responsibilityId)
        .eq("date", date)
        .maybeSingle();
      if (still) return { ok: false, message: "Non puoi togliere questa spunta." };
    }
    revalidateBoards();
    return { ok: true, data: null };
  });
}

const taskSchema = z.object({ taskId: z.uuid(), done: z.boolean() });

/** "Fatto" (o "Riapri") su un'attività extra: RPC riservata agli assegnatari e agli admin. */
export async function setExtraTaskDone(input: {
  taskId: string;
  done: boolean;
}): Promise<ActionResult> {
  return runAction(async () => {
    const parsed = taskSchema.safeParse(input);
    if (!parsed.success) throw new ActionError("Dati non validi.");
    const { supabase } = await authedAction();
    const { error } = await supabase.rpc("set_extra_task_done", {
      p_task_id: parsed.data.taskId,
      p_done: parsed.data.done,
    });
    if (error) {
      return {
        ok: false,
        message:
          error.code === "42501"
            ? "Solo gli assegnatari possono chiudere questa attività."
            : "Operazione non riuscita. Riprova.",
      };
    }
    revalidateBoards();
    return { ok: true, message: parsed.data.done ? "Attività chiusa." : "Attività riaperta." };
  });
}
