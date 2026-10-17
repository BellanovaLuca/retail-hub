"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { adminAction, dbErrorMessage, runAction, type ActionResult } from "@/lib/auth/guards";
import { format, parseISO } from "date-fns";
import { weekStart } from "@/lib/dates";
import { notify } from "@/lib/notifications";
import { publishSnapshot } from "@/lib/schedule/publish";
import { awaitsAdmin, formatRange, requestTypeLabel, type RequestStatus } from "@/lib/requests";

/**
 * Uno scambio approvato diventa visibile subito: si ripubblicano solo le giornate dei due
 * colleghi coinvolti (le altre modifiche in bozza della settimana restano in bozza).
 */
async function publishSwap(
  db: Awaited<ReturnType<typeof adminAction>>["supabase"],
  actorId: string,
  r: {
    profile_id: string;
    target_profile_id: string | null;
    start_date: string;
    target_date: string | null;
  },
) {
  const dates = [r.start_date, r.target_date].filter((d): d is string => Boolean(d));
  const keys = new Set(
    dates.flatMap((d) =>
      [r.profile_id, r.target_profile_id].filter(Boolean).map((p) => `${p}|${d}`),
    ),
  );
  const weeks = [...new Set(dates.map((d) => format(weekStart(parseISO(d)), "yyyy-MM-dd")))];
  for (const w of weeks) {
    const { data } = await db
      .from("schedule_weeks")
      .select("status")
      .eq("week_start", w)
      .maybeSingle();
    if (data?.status === "published")
      await publishSnapshot(db, w, actorId, { mode: "changed", onlyDays: keys });
  }
}

/** Approva o rifiuta una o più richieste (§6.2). Gli effetti su ferie e turni li applica il DB. */
export async function decideRequests(
  ids: string[],
  decision: "approved" | "rejected",
  note: string,
): Promise<ActionResult<{ done: number; failed: number }>> {
  return runAction(async () => {
    const { supabase, profile } = await adminAction();
    const list = z.array(z.uuid()).min(1).max(100).parse(ids);
    const decisionNote = z.string().trim().max(1000).parse(note);
    const { data: requests } = await supabase.from("requests").select("*").in("id", list);
    let done = 0;
    let failed = 0;
    let lastError = "";

    for (const r of requests ?? []) {
      if (!awaitsAdmin({ type: r.type, status: r.status as RequestStatus })) {
        failed++;
        lastError = "Alcune richieste non sono più in attesa.";
        continue;
      }
      const { error } = await supabase
        .from("requests")
        .update({
          status: decision,
          decided_by: profile.id,
          decided_at: new Date().toISOString(),
          decision_note: decisionNote || null,
        })
        .eq("id", r.id);
      if (error) {
        failed++;
        lastError = error.message.includes("Turni dello scambio")
          ? "I turni dello scambio non esistono più: controlla il foglio turni."
          : dbErrorMessage(error, "Decisione non salvata.");
        continue;
      }
      done++;
      if (decision === "approved" && r.type === "scambio_turno") {
        await publishSwap(supabase, profile.id, r);
      }
      const what = `${requestTypeLabel(r.type)} · ${formatRange(r.start_date, r.end_date)}`;
      const recipients =
        r.type === "scambio_turno" && r.target_profile_id
          ? [r.profile_id, r.target_profile_id]
          : [r.profile_id];
      await notify(recipients, {
        kind: "request_decided",
        title: decision === "approved" ? "Richiesta approvata" : "Richiesta rifiutata",
        body: decisionNote ? `${what}\n${decisionNote}` : what,
        link: `/richieste/${r.id}`,
      });
    }

    revalidatePath("/admin/richieste", "layout");
    revalidatePath("/admin");
    revalidatePath("/richieste", "layout");
    revalidatePath("/admin/turni", "layout");
    revalidatePath("/admin/ferie", "layout");
    revalidatePath("/orari", "layout");
    revalidatePath("/");
    if (failed && !done) return { ok: false, message: lastError };
    return {
      ok: true,
      message:
        `${done} richiest${done === 1 ? "a" : "e"} ${decision === "approved" ? "approvat" : "rifiutat"}${done === 1 ? "a" : "e"}` +
        (failed ? ` · ${failed} non aggiornate: ${lastError}` : "."),
      data: { done, failed },
    };
  });
}
