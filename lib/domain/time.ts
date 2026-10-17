/**
 * Utilità pure per orari ("HH:mm" ↔ minuti dalla mezzanotte), fasce e date ISO.
 * Gli orari del giorno non passano mai da `Date`: solo minuti interi.
 */
import { addDays } from "date-fns";
import { isoWeekday, toISODate } from "@/lib/dates";
import type { ISODate, Interval, Time } from "./types";

/** Fascia in minuti dalla mezzanotte, [start, end). */
export type MinuteRange = { start: number; end: number };

export const MINUTES_PER_DAY = 24 * 60;

const TIME_RE = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

/**
 * "HH:mm" (o "HH:mm:ss", come arriva da Postgres) → minuti dalla mezzanotte.
 * Ammette "24:00" (= 1440) come fine giornata. Lancia un errore se il formato non è valido.
 */
export function toMinutes(time: Time): number {
  const m = TIME_RE.exec(time.trim());
  if (!m) throw new Error(`Orario non valido: "${time}"`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (min > 59 || h > 24 || (h === 24 && min !== 0))
    throw new Error(`Orario non valido: "${time}"`);
  return h * 60 + min;
}

/** Minuti dalla mezzanotte → "HH:mm" (1440 → "24:00"). */
export function fromMinutes(minutes: number): Time {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function toRange(interval: Interval): MinuteRange {
  return { start: toMinutes(interval.start), end: toMinutes(interval.end) };
}

export function toInterval(range: MinuteRange): Interval {
  return { start: fromMinutes(range.start), end: fromMinutes(range.end) };
}

/** Intersezione di due fasce; null se vuota. */
export function intersectRange(a: MinuteRange, b: MinuteRange): MinuteRange | null {
  const start = Math.max(a.start, b.start);
  const end = Math.min(a.end, b.end);
  return end > start ? { start, end } : null;
}

/** Ordina e unisce fasce sovrapposte o contigue. */
export function mergeRanges(ranges: MinuteRange[]): MinuteRange[] {
  const sorted = ranges.filter((r) => r.end > r.start).sort((a, b) => a.start - b.start);
  const out: MinuteRange[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else out.push({ ...r });
  }
  return out;
}

/** "Orologio" compatto: 10:00 → "10", 10:30 → "10:30", 08:30 → "8:30". */
export function formatTimeCompact(time: Time): string {
  const minutes = toMinutes(time);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? String(h) : `${h}:${String(m).padStart(2, "0")}`;
}

/** "Yyyy-MM-dd" → Date a mezzanotte locale (solo per l'aritmetica di calendario). */
function parseISODate(date: ISODate): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Giorno ISO della settimana: 1 = lunedì … 7 = domenica. */
export function weekdayOf(date: ISODate): number {
  return isoWeekday(parseISODate(date));
}

/** Somma `n` giorni a una data ISO. */
export function addDaysISO(date: ISODate, n: number): ISODate {
  return toISODate(addDays(parseISODate(date), n));
}

/** Differenza in giorni di calendario b − a. */
export function diffDaysISO(a: ISODate, b: ISODate): number {
  const [ya, ma, da] = a.split("-").map(Number);
  const [yb, mb, db] = b.split("-").map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86_400_000);
}

/** I 7 giorni lun→dom a partire dal lunedì `weekStart`. */
export function weekDates(weekStart: ISODate): ISODate[] {
  return Array.from({ length: 7 }, (_, i) => addDaysISO(weekStart, i));
}

export const WEEKDAY_SHORT = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"] as const;

/** "Mar 14": giorno abbreviato con maiuscola + numero del giorno, come nei messaggi di avviso. */
export function formatDayShort(date: ISODate): string {
  const label = WEEKDAY_SHORT[weekdayOf(date) - 1];
  return `${label[0].toUpperCase()}${label.slice(1)} ${Number(date.slice(8, 10))}`;
}

/** "dd/MM/yyyy". */
export function formatDateIT(date: ISODate): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
}
