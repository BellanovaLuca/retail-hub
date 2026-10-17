"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { adminAction, dbErrorMessage, runAction, type ActionResult } from "@/lib/auth/guards";
import { notify } from "@/lib/notifications";
import { awaitsAdmin, formatRange, requestTypeLabel, type RequestStatus } from "@/lib/requests";

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
