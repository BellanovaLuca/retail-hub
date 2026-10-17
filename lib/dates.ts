import { TZDate } from "@date-fns/tz";
import { addDays, format, getISOWeek, startOfWeek } from "date-fns";
import { it } from "date-fns/locale";

export const TIME_ZONE = "Europe/Rome";

/** Adesso, nel fuso del negozio. */
export function nowInRome(): TZDate {
  return TZDate.tz(TIME_ZONE);
}

/**
 * Formatta un istante (timestamptz ISO) nel fuso del negozio: sul server (Vercel, UTC)
 * `format(parseISO(…))` darebbe l'ora UTC e un errore di hydration.
 */
export function formatInRome(iso: string, pattern: string): string {
  return format(new TZDate(iso, TIME_ZONE), pattern, { locale: it });
}

/** Lunedì della settimana che contiene `date` (le settimane vanno da lunedì a domenica). */
export function weekStart(date: Date): Date {
  return startOfWeek(date, { weekStartsOn: 1 });
}

/** I 7 giorni lun→dom della settimana che contiene `date`. */
export function weekDays(date: Date): Date[] {
  const monday = weekStart(date);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** Numero di settimana ISO, come nei fogli "Week 39". */
export function weekNumber(date: Date): number {
  return getISOWeek(date);
}

/** Data in formato ISO (yyyy-MM-dd) nel fuso di `date`, per le colonne `date` del database. */
export function toISODate(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

/** 1 = lunedì … 7 = domenica, come in store_settings.opening_hours. */
export function isoWeekday(date: Date): number {
  return ((date.getDay() + 6) % 7) + 1;
}

export function formatLong(date: Date): string {
  return format(date, "EEEE d MMMM", { locale: it });
}

export function formatShortDay(date: Date): string {
  return format(date, "EEE d", { locale: it });
}

/** Lettera del giorno come nel calendario ferie: L M M G V S D. */
export function dayLetter(date: Date): string {
  return "LMMGVSD"[isoWeekday(date) - 1];
}
