"use server";

import { z } from "zod";
import {
  ActionError,
  authedAction,
  dbErrorMessage,
  runAction,
  type ActionResult,
} from "@/lib/auth/guards";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const entriesSchema = z
  .array(
    z.object({
      kpiId: z.uuid(),
      date: isoDate,
      /** null = cella svuotata: si cancella il numero. */
      value: z.number().min(0).max(99_999).nullable(),
    }),
  )
  .min(1)
  .max(200);

/**
 * Salva i numeri del giorno del dipendente (upsert su daily_entries con la SUA sessione):
 * RLS accetta solo le proprie righe da 7 giorni fa a oggi.
 */
export async function saveMyEntries(
  input: z.input<typeof entriesSchema>,
): Promise<ActionResult<{ savedAt: string }>> {
  return runAction(async () => {
    const { supabase, profile } = await authedAction();
    const parsed = entriesSchema.safeParse(input);
    if (!parsed.success) return { ok: false, message: "Numeri non validi." };

    const upserts = parsed.data.filter((e) => e.value !== null);
    const deletes = parsed.data.filter((e) => e.value === null);
    if (upserts.length) {
      const { error } = await supabase.from("daily_entries").upsert(
        upserts.map((e) => ({
          profile_id: profile.id,
          kpi_id: e.kpiId,
          date: e.date,
          value: e.value!,
        })),
        { onConflict: "profile_id,date,kpi_id" },
      );
      if (error) {
        throw new ActionError(
          error.code === "42501"
            ? "Puoi modificare solo i giorni da 7 giorni fa a oggi."
            : dbErrorMessage(error, "Numeri non salvati."),
        );
      }
    }
    for (const e of deletes) {
      const { error } = await supabase
        .from("daily_entries")
        .delete()
        .eq("profile_id", profile.id)
        .eq("kpi_id", e.kpiId)
        .eq("date", e.date);
      if (error) throw new ActionError(dbErrorMessage(error, "Numeri non salvati."));
    }
    // Niente revalidatePath: la pagina aggiorna in modo ottimistico e la Home si ricarica da sola.
    return { ok: true, data: { savedAt: new Date().toISOString() } };
  });
}

const noteSchema = z.object({ weekStart: isoDate, body: z.string().max(4000) });

/** "La mia nota" della settimana (employee_week_notes, scrittura propria). */
export async function saveMyNote(input: z.input<typeof noteSchema>): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, profile } = await authedAction();
    const parsed = noteSchema.safeParse(input);
    if (!parsed.success) return { ok: false, message: "Nota troppo lunga." };
    const { error } = await supabase.from("employee_week_notes").upsert(
      {
        profile_id: profile.id,
        week_start: parsed.data.weekStart,
        body: parsed.data.body.trim(),
      },
      { onConflict: "profile_id,week_start" },
    );
    if (error) throw new ActionError(dbErrorMessage(error, "Nota non salvata."));
    return { ok: true };
  });
}
