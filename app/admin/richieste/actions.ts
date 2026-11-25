"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { adminAction, dbErrorMessage, runAction, type ActionResult } from "@/lib/auth/guards";
import { format, parseISO } from "date-fns";
import { weekStart } from "@/lib/dates";
import { notify } from "@/lib/notifications";
import { publishSnapshot } from "@/lib/schedule/publish";
import { removeAttachmentFiles } from "@/lib/announcements/storage";
import { ownAttachmentPaths } from "./attachments";
import {
  awaitsAdmin,
  formatRange,
  RESET_CONFIRM_WORD,
  requestTypeLabel,
  type RequestStatus,
} from "@/lib/requests";

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
      // La guardia sullo stato sta nell'UPDATE stesso: se nel frattempo il dipendente ha
      // annullato (o un altro admin ha deciso) non si aggiorna nessuna riga e la richiesta
      // conta come non aggiornata, invece di tornare "approvata" e creare ferie.
      const { data: updated, error } = await supabase
        .from("requests")
        .update({
          status: decision,
          decided_by: profile.id,
          decided_at: new Date().toISOString(),
          decision_note: decisionNote || null,
        })
        .eq("id", r.id)
        .eq("status", r.type === "scambio_turno" ? "peer_accepted" : "pending")
        .select("id");
      if (error) {
        failed++;
        lastError = error.message.includes("Turni dello scambio")
          ? "I turni dello scambio non esistono più: controlla il foglio turni."
          : dbErrorMessage(error, "Decisione non salvata.");
        continue;
      }
      if (!updated?.length) {
        failed++;
        lastError = "Alcune richieste non sono più in attesa.";
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

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const resetSchema = z.object({
  /** Togli anche ferie/permessi/assenze nati da richieste approvate. */
  removeLeaves: z.boolean(),
  /** Parola di conferma scritta dall'admin. */
  confirm: z.string(),
});

/**
 * «Azzera tutte le richieste»: elimina tutte le richieste dei dipendenti, di qualsiasi stato
 * (anche approvate), con commenti e allegati. Con `removeLeaves` le richieste approvate vengono
 * prima revocate, così spariscono anche le assenze che avevano creato; senza, ferie e permessi
 * restano nel calendario. Gli scambi di turno già approvati restano come sono.
 */
export async function resetAllRequests(
  input: z.input<typeof resetSchema>,
): Promise<ActionResult<{ deleted: number }>> {
  return runAction(async () => {
    const parsed = resetSchema.safeParse(input);
    if (!parsed.success) return { ok: false, message: "Dati non validi." };
    if (parsed.data.confirm.trim().toUpperCase() !== RESET_CONFIRM_WORD)
      return { ok: false, message: `Per confermare scrivi ${RESET_CONFIRM_WORD}.` };
    const { supabase } = await adminAction();

    // A pagine: PostgREST restituisce al massimo 1000 righe per richiesta.
    const PAGE = 1000;
    const rows: {
      id: string;
      profile_id: string;
      status: string;
      attachment_path: string | null;
    }[] = [];
    for (let page = 0; ; page++) {
      const { data, error: readError } = await supabase
        .from("requests")
        .select("id, profile_id, status, attachment_path")
        .order("id")
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (readError)
        return { ok: false, message: dbErrorMessage(readError, "Richieste non lette.") };
      rows.push(...(data ?? []));
      if (!data || data.length < PAGE) break;
    }
    if (rows.length === 0)
      return { ok: true, message: "Non ci sono richieste.", data: { deleted: 0 } };

    if (parsed.data.removeLeaves) {
      // La revoca (trigger) toglie le assenze create e il segnale di conflitto dai turni.
      const approved = rows.filter((r) => r.status === "approved").map((r) => r.id);
      for (const ids of chunks(approved, 100)) {
        const { error } = await supabase
          .from("requests")
          .update({ status: "cancelled" })
          .in("id", ids);
        if (error) return { ok: false, message: dbErrorMessage(error, "Assenze non revocate.") };
      }
    }

    // A blocchi: gli id viaggiano nell'indirizzo della richiesta.
    for (const ids of chunks(
      rows.map((r) => r.id),
      100,
    )) {
      const { error } = await supabase.from("requests").delete().in("id", ids);
      if (error) return { ok: false, message: dbErrorMessage(error, "Richieste non eliminate.") };
    }

    // I file si tolgono con il service role: solo quelli nella cartella di chi ha fatto la
    // richiesta. Il percorso lo scrive il dipendente e non va preso per buono (potrebbe indicare
    // l'allegato di una comunicazione o di un collega).
    await removeAttachmentFiles(ownAttachmentPaths(rows));

    revalidatePath("/", "layout");
    revalidatePath("/admin", "layout");
    const n = rows.length;
    return {
      ok: true,
      message: `${n === 1 ? "Eliminata 1 richiesta" : `Eliminate ${n} richieste`}.`,
      data: { deleted: n },
    };
  });
}
