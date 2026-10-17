/**
 * Logica pura del planning ferie (§8.2): giorni dell'anno, periodi consecutivi,
 * conteggi per giorno e reparto, soglie, conversione delle celle in scritture.
 * Nessuna dipendenza da React o dal database.
 */
import type { ISODate, LeaveStatus, LeaveType } from "@/lib/domain/types";
import { parseLeaveCell } from "./parse";

const pad = (n: number) => String(n).padStart(2, "0");

/** Data ISO da anno, mese (1-12) e giorno, senza passare dal fuso orario. */
export function isoDate(year: number, month: number, day: number): ISODate {
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function isLeapYear(year: number) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Tutti i giorni di un mese (1-12). */
export function monthDates(year: number, month: number): ISODate[] {
  return Array.from({ length: daysInMonth(year, month) }, (_, i) => isoDate(year, month, i + 1));
}

/** Tutti i giorni dell'anno (365 o 366). */
export function yearDates(year: number): ISODate[] {
  return Array.from({ length: 12 }, (_, m) => monthDates(year, m + 1)).flat();
}

/** Giorno ISO della settimana: 1 = lunedì … 7 = domenica. */
export function isoWeekdayOf(date: ISODate): number {
  const [y, m, d] = date.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Lettera del giorno come nel calendario ferie: L M M G V S D. */
export function weekdayLetter(date: ISODate) {
  return "LMMGVSD"[isoWeekdayOf(date) - 1];
}

export function isWeekendDate(date: ISODate) {
  return isoWeekdayOf(date) >= 6;
}

/** Giorno successivo (in UTC, quindi senza sorprese col cambio dell'ora). */
export function nextDate(date: ISODate, step = 1): ISODate {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + step));
  return isoDate(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
}

/** Giorni da `from` a `to` compresi (in qualsiasi ordine). Limite di sicurezza: 400 giorni. */
export function dateRange(from: ISODate, to: ISODate): ISODate[] {
  const [a, b] = from <= to ? [from, to] : [to, from];
  const out: ISODate[] = [];
  for (let d = a; d <= b && out.length < 400; d = nextDate(d)) out.push(d);
  return out;
}

/* --------------------------------------------------------------- periodi */

export type LeaveDay = {
  date: ISODate;
  type: LeaveType;
  status: LeaveStatus;
  hours: number | null;
};

export type LeavePeriod = {
  from: ISODate;
  to: ISODate;
  /** Giorni del periodo (righe di `leaves`, una per giorno). */
  days: number;
  type: LeaveType;
  status: LeaveStatus;
  /** Ore totali se il periodo è fatto di permessi orari. */
  hours: number | null;
};

/**
 * Raggruppa i giorni di assenza di UNA persona in periodi: giorni consecutivi con lo stesso
 * tipo e lo stesso stato (un "F?" in mezzo a "F" spezza il periodo). I permessi orari restano
 * giornate singole.
 */
export function groupLeavePeriods(days: LeaveDay[]): LeavePeriod[] {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const out: LeavePeriod[] = [];
  for (const d of sorted) {
    const last = out.at(-1);
    if (
      last &&
      d.hours == null &&
      last.hours == null &&
      last.type === d.type &&
      last.status === d.status &&
      nextDate(last.to) === d.date
    ) {
      last.to = d.date;
      last.days += 1;
      continue;
    }
    out.push({
      from: d.date,
      to: d.date,
      days: 1,
      type: d.type,
      status: d.status,
      hours: d.hours,
    });
  }
  return out;
}

/** Totale dei giorni di ferie dell'anno, confermati e da confermare. */
export function leaveTotals(days: LeaveDay[], year: number) {
  const prefix = `${year}-`;
  let confirmed = 0;
  let tentative = 0;
  for (const d of days) {
    if (d.type !== "ferie" || !d.date.startsWith(prefix)) continue;
    if (d.status === "tentative") tentative += 1;
    else confirmed += 1;
  }
  return { confirmed, tentative, total: confirmed + tentative };
}

/* ------------------------------------------------------ conteggi e soglie */

export type CountableLeave = {
  profileId: string;
  date: ISODate;
  /** "assente" = vista pubblica (motivo nascosto). */
  type: LeaveType | "assente";
  hours?: number | null;
};

export type DayCount = { total: number; byDepartment: Record<string, number> };

/**
 * Persone in ferie per giorno, in totale e per reparto principale. Contano solo le ferie
 * (anche da confermare); i permessi orari e le altre assenze no.
 */
export function countOnLeaveByDay(
  leaves: CountableLeave[],
  departmentOf: (profileId: string) => string | null | undefined,
): Map<ISODate, DayCount> {
  const out = new Map<ISODate, DayCount>();
  for (const l of leaves) {
    if (l.type !== "ferie" || l.hours) continue;
    const entry = out.get(l.date) ?? { total: 0, byDepartment: {} };
    entry.total += 1;
    const dep = departmentOf(l.profileId);
    if (dep) entry.byDepartment[dep] = (entry.byDepartment[dep] ?? 0) + 1;
    out.set(l.date, entry);
  }
  return out;
}

/** Legge `store_settings.leave_thresholds` ({ "<department_id>": 2 }) tollerando valori sporchi. */
export function parseLeaveThresholds(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = typeof v === "string" ? Number(v) : v;
    if (typeof n === "number" && Number.isInteger(n) && n >= 0) out[k] = n;
  }
  return out;
}

/** La soglia è il massimo ammesso: si segnala quando il numero la supera. */
export function exceedsThreshold(count: number, threshold: number | undefined) {
  return threshold != null && count > threshold;
}

/** Giorni in cui almeno un reparto supera la propria soglia. */
export function daysOverThreshold(
  counts: Map<ISODate, DayCount>,
  thresholds: Record<string, number>,
): { date: ISODate; departmentId: string; count: number; threshold: number }[] {
  const out: { date: ISODate; departmentId: string; count: number; threshold: number }[] = [];
  for (const [date, c] of [...counts.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    for (const [dep, n] of Object.entries(c.byDepartment)) {
      if (exceedsThreshold(n, thresholds[dep])) {
        out.push({ date, departmentId: dep, count: n, threshold: thresholds[dep] });
      }
    }
  }
  return out;
}

/* ------------------------------------------------- celle → scritture sul DB */

export type LeaveWrite =
  | {
      kind: "upsert";
      profileId: string;
      date: ISODate;
      type: LeaveType;
      status: LeaveStatus;
      hours: number | null;
    }
  | { kind: "delete"; profileId: string; date: ISODate };

/**
 * Converte le modifiche del foglio (testo delle celle) in scritture. Le celle non valide
 * finiscono in `errors`; a parità di cella vale l'ultima modifica.
 */
export function cellsToWrites(changes: { profileId: string; date: ISODate; value: string }[]): {
  writes: LeaveWrite[];
  errors: string[];
} {
  const byCell = new Map<string, LeaveWrite>();
  const errors: string[] = [];
  for (const c of changes) {
    const parsed = parseLeaveCell(c.value);
    const k = `${c.profileId}|${c.date}`;
    if (parsed.kind === "error") {
      errors.push(parsed.message);
      continue;
    }
    byCell.set(
      k,
      parsed.kind === "empty"
        ? { kind: "delete", profileId: c.profileId, date: c.date }
        : {
            kind: "upsert",
            profileId: c.profileId,
            date: c.date,
            type: parsed.type,
            status: parsed.status,
            hours: parsed.hours,
          },
    );
  }
  return { writes: [...byCell.values()], errors };
}

/* ------------------------------------------------------------- richiesta */

/** Link alla nuova richiesta di ferie con le date già compilate (pagina Richieste, §6.1). */
export function leaveRequestHref(from: ISODate, to: ISODate) {
  const [a, b] = from <= to ? [from, to] : [to, from];
  return `/richieste/nuova?tipo=ferie&dal=${a}&al=${b}`;
}

export const MONTH_NAMES = [
  "Gennaio",
  "Febbraio",
  "Marzo",
  "Aprile",
  "Maggio",
  "Giugno",
  "Luglio",
  "Agosto",
  "Settembre",
  "Ottobre",
  "Novembre",
  "Dicembre",
] as const;

/** "3 ago" o "3 ago 2026": date brevi per elenchi e riepiloghi. */
export function formatDayIt(date: ISODate, withYear = false) {
  const [y, m, d] = date.split("-").map(Number);
  const month = MONTH_NAMES[m - 1].slice(0, 3).toLowerCase();
  return `${d} ${month}${withYear ? ` ${y}` : ""}`;
}

/** "3 ago – 14 ago" (o un giorno solo). */
export function formatRangeIt(from: ISODate, to: ISODate) {
  if (from === to) return formatDayIt(from);
  return `${formatDayIt(from)} – ${formatDayIt(to)}`;
}

/** Anno valido da un parametro di URL, altrimenti `fallback`. */
export function parseYearParam(value: string | undefined | null, fallback: number): number {
  if (!value || !/^\d{4}$/.test(value)) return fallback;
  const n = Number(value);
  return n >= 2000 && n <= 2100 ? n : fallback;
}
