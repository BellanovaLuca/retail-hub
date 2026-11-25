import { addDays, addMonths, endOfMonth, format, parseISO, startOfWeek } from "date-fns";
import { it } from "date-fns/locale";
import { isoWeekday } from "@/lib/dates";
import type { RequestStatus } from "./index";

/**
 * Calendario mensile delle richieste (/admin/richieste, scheda «Calendario»): quali richieste
 * cadono in quali giorni. Modulo puro: i mesi sono stringhe "yyyy-MM", i giorni "yyyy-MM-dd".
 */

/** Quello che serve di una richiesta per metterla nel calendario (colonne della tabella). */
export type CalendarRequest = {
  id: string;
  type: string;
  status: RequestStatus | string;
  start_date: string;
  end_date: string;
  recurring_weekdays: number[] | null;
  target_date: string | null;
};

const iso = (d: Date) => format(d, "yyyy-MM-dd");

/** Parametro `mese` dell'URL ("yyyy-MM"): null se manca o non è un mese vero. */
export function parseCalendarMonth(value: string | undefined | null): string | null {
  const m = /^(\d{4})-(\d{2})$/.exec(value ?? "");
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (year < 2000 || year > 2100 || month < 1 || month > 12) return null;
  return `${m[1]}-${m[2]}`;
}

/** Mese spostato di `delta` mesi ("2026-12" + 1 → "2027-01"). */
export function shiftMonth(month: string, delta: number): string {
  return format(addMonths(parseISO(`${month}-01`), delta), "yyyy-MM");
}

/** "Dicembre 2026". */
export function monthLabel(month: string): string {
  const text = format(parseISO(`${month}-01`), "LLLL yyyy", { locale: it });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Giorni della griglia del mese, a settimane intere lun→dom: dal lunedì della settimana del
 * giorno 1 alla domenica della settimana dell'ultimo giorno (28, 35 o 42 giorni).
 */
export function monthGridDays(month: string): string[] {
  const first = parseISO(`${month}-01`);
  const last = endOfMonth(first);
  const out: string[] = [];
  for (
    let d = startOfWeek(first, { weekStartsOn: 1 });
    d <= last || out.length % 7 !== 0;
    d = addDays(d, 1)
  )
    out.push(iso(d));
  return out;
}

/**
 * Giorni coperti da una richiesta tra `from` e `to` (compresi):
 * - scambio di turno: il giorno del turno ceduto e, se c'è, quello del turno preso in cambio;
 * - indisponibilità ricorrente: solo i giorni della settimana indicati (1 = lunedì);
 * - tutte le altre: ogni giorno da `start_date` a `end_date`.
 */
export function requestDays(r: CalendarRequest, from: string, to: string): string[] {
  if (r.type === "scambio_turno") {
    const days = [r.start_date, r.target_date].filter((d): d is string => Boolean(d));
    return [...new Set(days)].filter((d) => d >= from && d <= to).sort();
  }
  const start = r.start_date > from ? r.start_date : from;
  const end = r.end_date < to ? r.end_date : to;
  const weekdays = r.recurring_weekdays?.length ? r.recurring_weekdays : null;
  const out: string[] = [];
  for (let d = parseISO(start); iso(d) <= end; d = addDays(d, 1)) {
    if (weekdays && !weekdays.includes(isoWeekday(d))) continue;
    out.push(iso(d));
  }
  return out;
}

/** Come si disegna una richiesta nel calendario. */
export type CalendarTone = "pending" | "approved" | "closed";

/** In attesa (anche lo scambio accettato dal collega) · approvata · rifiutata o annullata. */
export function calendarTone(status: string): CalendarTone {
  if (status === "approved") return "approved";
  if (status === "pending" || status === "peer_accepted") return "pending";
  return "closed";
}

const TONE_RANK: Record<CalendarTone, number> = { pending: 0, approved: 1, closed: 2 };

/**
 * Richieste per giorno, per i giorni indicati (di solito `monthGridDays`). In ogni giorno prima
 * quelle in attesa, poi le approvate, poi rifiutate e annullate; a parità resta l'ordine in cui
 * arrivano (chi chiama le ordina, ad esempio per nome).
 */
export function requestsByDay<T extends CalendarRequest>(
  requests: T[],
  days: string[],
): Map<string, T[]> {
  const out = new Map<string, T[]>(days.map((d) => [d, []]));
  if (days.length === 0) return out;
  const sorted = [...days].sort();
  const from = sorted[0];
  const to = sorted[sorted.length - 1];
  for (const r of requests) {
    for (const day of requestDays(r, from, to)) out.get(day)?.push(r);
  }
  for (const list of out.values()) {
    // Array.prototype.sort è stabile: a parità di stato resta l'ordine d'ingresso.
    list.sort((a, b) => TONE_RANK[calendarTone(a.status)] - TONE_RANK[calendarTone(b.status)]);
  }
  return out;
}

/**
 * Quante voci mostrare in una casella del giorno: fino a `max` si vedono tutte, oltre se ne
 * vedono `max - 1` e l'ultima riga diventa «+N altre» (che apre l'elenco del giorno).
 */
export function visibleCount(total: number, max = 4): { shown: number; hidden: number } {
  if (total <= max) return { shown: total, hidden: 0 };
  return { shown: max - 1, hidden: total - (max - 1) };
}
