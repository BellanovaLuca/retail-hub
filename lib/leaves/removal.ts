import "server-only";
import { ActionError, dbErrorMessage } from "@/lib/auth/guards";
import { chunk } from "@/lib/data/paginate";
import { notify } from "@/lib/notifications";
import { removedLeaveNotices } from "@/lib/schedule/leave-cells";
import type { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/types";

type Db = Awaited<ReturnType<typeof createClient>>;

/** Riga di `leaves` da togliere, con quello che serve per avvisare chi aveva una richiesta. */
export type LeaveRow = Pick<
  Tables<"leaves">,
  "profile_id" | "date" | "type" | "hours" | "status" | "source" | "request_id"
>;

/**
 * Revoca l'approvazione di una richiesta: torna "rifiutata" con la nota indicata. La guardia sullo
 * stato sta nell'UPDATE (se nel frattempo è cambiata non si tocca nulla); il trigger
 * `revoke_request_leaves` elimina le sue assenze e i segnali di conflitto dei turni.
 */
export async function revokeApprovedRequest(
  db: Db,
  actorId: string,
  requestId: string,
  note: string,
) {
  const { data, error } = await db
    .from("requests")
    .update({
      status: "rejected",
      decided_by: actorId,
      decided_at: new Date().toISOString(),
      decision_note: note,
    })
    .eq("id", requestId)
    .eq("status", "approved")
    .select("id, profile_id, type, start_date, end_date");
  if (error) throw new ActionError(dbErrorMessage(error, "Richiesta non aggiornata."));
  return data?.[0] ?? null;
}

export type LeaveRemoval = {
  removed: number;
  /** Richieste approvate rimaste senza giorni: riportate a "rifiutata". */
  revokedRequests: number;
  /** Avvisi mandati (uno per persona e richiesta). */
  notices: number;
};

/**
 * Toglie le assenze indicate (foglio turni e foglio ferie fanno la stessa cosa): le righe di
 * `leaves` spariscono e i turni di quelle giornate non sono più in conflitto (RPC
 * `remove_leave_days`). Una richiesta approvata rimasta senza nessun giorno torna "rifiutata"
 * con `note`; chi aveva un'assenza nata da una richiesta approvata viene avvisato con `title`.
 */
export async function removeLeaveRows(
  db: Db,
  actorId: string,
  targets: LeaveRow[],
  opts: { note: string; title: string },
): Promise<LeaveRemoval> {
  if (targets.length === 0) return { removed: 0, revokedRequests: 0, notices: 0 };

  let removed = 0;
  // A blocchi: una selezione larga (un anno per più persone) non va in un'unica chiamata.
  for (const part of chunk(targets, 1000)) {
    const { data: count, error } = await db.rpc("remove_leave_days", {
      p_days: part.map((l) => ({ profile_id: l.profile_id, date: l.date })),
    });
    if (error) throw new ActionError(dbErrorMessage(error, "Assenza non tolta."));
    removed += count ?? part.length;
  }

  // Una richiesta approvata rimasta senza nessun giorno di assenza non ha più senso come
  // "approvata": torna rifiutata (il dipendente la vede così, con la nota).
  const emptied = new Set<string>();
  const requestIds = [...new Set(targets.flatMap((l) => (l.request_id ? [l.request_id] : [])))];
  for (const id of requestIds) {
    const { count: left, error: countError } = await db
      .from("leaves")
      .select("id", { count: "exact", head: true })
      .eq("request_id", id);
    if (countError || (left ?? 0) > 0) continue;
    if (await revokeApprovedRequest(db, actorId, id, opts.note)) emptied.add(id);
  }

  const notices = removedLeaveNotices(
    targets.map((l) => ({
      profileId: l.profile_id,
      date: l.date,
      type: l.type,
      hours: l.hours,
      status: l.status,
      source: l.source,
      requestId: l.request_id,
    })),
    emptied,
  );
  for (const n of notices) {
    await notify([n.profileId], {
      kind: "request_decided",
      title: opts.title,
      body: n.body,
      link: n.link,
    });
  }
  return { removed, revokedRequests: emptied.size, notices: notices.length };
}
