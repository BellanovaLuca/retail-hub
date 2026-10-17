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

const noteSchema = z.object({
  goalId: z.uuid(),
  note: z.string().max(2000, "Massimo 2000 caratteri."),
});

/** "La tua nota" su un proprio obiettivo pubblicato (RPC set_performance_note). */
export async function savePerformanceNote(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const parsed = noteSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? "Nota non valida." };
    }
    const { supabase } = await authedAction();
    const { error } = await supabase.rpc("set_performance_note", {
      p_goal_id: parsed.data.goalId,
      p_note: parsed.data.note,
    });
    if (error) throw new ActionError(dbErrorMessage(error, "Nota non salvata."));
    revalidatePath("/performance");
    return { ok: true, message: parsed.data.note.trim() ? "Nota salvata." : "Nota tolta." };
  });
}
