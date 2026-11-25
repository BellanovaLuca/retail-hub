import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import type { LeaveRecord } from "./types";
import { isFullDayLeave, key, leaveLabelAdmin } from "./view";

/**
 * Assenze nel foglio turni dell'admin (richiesta del 27/11/2026): le celle dei giorni di assenza
 * si scrivono come le altre, e l'assenza si può togliere direttamente dal foglio. Modulo puro.
 */

/** Richiesta approvata da cui nasce un'assenza, come la mostra il dettaglio della giornata. */
export type LeaveRequestInfo = {
  id: string;
  /** "Ferie", "Giorno libero"… */
  title: string;
  /** Periodo e dettagli: "14–18 dic", "1–31 dic · ogni lun, mer". */
  detail: string;
  /** Ancora approvata: dal foglio si può togliere tutta la richiesta. */
  revocable: boolean;
};

/** "Ferie · richiesta approvata", "Permesso 2h", "Ferie?" (da confermare). */
export function leaveTitle(leave: Pick<LeaveRecord, "type" | "hours" | "status" | "source">) {
  return `${leaveLabelAdmin(leave)}${leave.source === "request" ? " · richiesta approvata" : ""}`;
}

export type LeaveCellState = {
  tone: "danger" | "hatched" | "dashed";
  title: string;
};

/**
 * Aspetto della cella persona × giorno quando c'è un'assenza a giornata intera o un turno in
 * conflitto. La cella NON è mai in sola lettura: il tratteggio (o il rosso del conflitto) dice
 * soltanto che lì c'è un'assenza. Senza assenza a giornata intera né conflitto: `undefined`.
 */
export function leaveCellState(
  leave: Pick<LeaveRecord, "type" | "hours" | "status" | "source"> | undefined,
  hasConflict: boolean,
): LeaveCellState | undefined {
  const fullDay = leave && isFullDayLeave(leave) ? leave : undefined;
  if (hasConflict) {
    return {
      tone: "danger",
      title: fullDay
        ? `Turno in conflitto con l'assenza (${leaveTitle(fullDay)}): doppio clic per tenere il turno o togliere l'assenza.`
        : "Turno segnalato in conflitto con un'assenza: doppio clic per aprire il dettaglio e risolvere.",
    };
  }
  if (!fullDay) return undefined;
  return {
    tone: fullDay.status === "tentative" ? "dashed" : "hatched",
    title: `${leaveTitle(fullDay)}. La cella si può scrivere lo stesso; doppio clic per togliere l'assenza.`,
  };
}

/** Assenze (anche di poche ore) nelle celle selezionate: quelle che «Togli l'assenza» toglierebbe. */
export function leavesInSelection(
  leaves: LeaveRecord[],
  rowIds: string[],
  colIds: string[],
): LeaveRecord[] {
  const rows = new Set(rowIds);
  const cols = new Set(colIds);
  return leaves
    .filter((l) => !l.fromShift && rows.has(l.profileId) && cols.has(l.date))
    .sort((a, b) => a.date.localeCompare(b.date) || a.profileId.localeCompare(b.profileId));
}

/** Firma stabile di un gruppo di assenze (per non aggiornare lo stato se non cambia nulla). */
export function leaveKeys(leaves: Pick<LeaveRecord, "profileId" | "date">[]): string {
  return leaves.map((l) => key(l.profileId, l.date)).join(",");
}

const shortDay = (date: string) => format(parseISO(date), "EEE d MMM", { locale: it });

export type RemovedLeave = {
  profileId: string;
  date: string;
  type: LeaveRecord["type"];
  hours: number | null;
  status: LeaveRecord["status"];
  source: LeaveRecord["source"];
  requestId: string | null;
};

/**
 * Avvisi ai dipendenti dopo che l'admin ha tolto delle assenze dal foglio turni: uno per persona
 * e richiesta, solo per le assenze nate da una richiesta approvata (il dipendente la crede ancora
 * valida). Quelle inserite a mano dall'admin nel planning si tolgono senza avviso, come da Ferie.
 *
 * `emptiedRequestIds` = richieste rimaste senza nessun giorno di assenza: l'azione le riporta a
 * "rifiutata", e l'avviso lo dice.
 */
export function removedLeaveNotices(
  removed: RemovedLeave[],
  emptiedRequestIds: ReadonlySet<string> = new Set(),
): { profileId: string; body: string; link: string }[] {
  const groups = new Map<string, RemovedLeave[]>();
  for (const l of removed) {
    if (l.source !== "request") continue;
    const k = `${l.profileId}|${l.requestId ?? ""}`;
    groups.set(k, [...(groups.get(k) ?? []), l]);
  }
  return [...groups.values()].map((list) => {
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
    const { profileId, requestId } = sorted[0];
    const days = `${leaveLabelAdmin(sorted[0])} · ${sorted.map((l) => shortDay(l.date)).join(", ")}`;
    // La richiesta può non esserci più (eliminata dall'elenco): resta solo il calendario ferie.
    if (!requestId) return { profileId, body: days, link: "/ferie" };
    return {
      profileId,
      body: `${days}\n${
        emptiedRequestIds.has(requestId)
          ? "La richiesta non ha più giorni di assenza: ora risulta rifiutata."
          : "Gli altri giorni della richiesta restano approvati."
      }`,
      link: `/richieste/${requestId}`,
    };
  });
}
