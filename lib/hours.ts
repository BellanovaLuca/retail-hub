/**
 * Calcolo delle ore: durata delle fasce, ore nette dei turni, ore per persona e residui settimanali.
 * Una mezz'ora vale 0,5 (§7.1).
 */
import { toMinutes } from "@/lib/domain/time";
import type { ISODate, Interval, PersonInput, ShiftInput } from "@/lib/domain/types";

/** Durata di una fascia in ore (mezz'ora = 0,5). Fasce rovesciate valgono 0. */
export function intervalHours(interval: Interval): number {
  return Math.max(0, toMinutes(interval.end) - toMinutes(interval.start)) / 60;
}

/**
 * Ore nette di un turno: durata meno la pausa, mai sotto zero. Per le ore di una giornata con più
 * pezzi usare `dayNetHours`, che applica la pausa all'intera giornata.
 */
export function shiftNetHours(shift: Pick<ShiftInput, "start" | "end" | "breakMinutes">): number {
  const minutes = toMinutes(shift.end) - toMinutes(shift.start) - (shift.breakMinutes ?? 0);
  return Math.max(0, minutes) / 60;
}

type Piece = Pick<ShiftInput, "start" | "end" | "breakMinutes">;

/**
 * Ore nette di UNA giornata di una persona (tutti i suoi pezzi di turno): somma delle durate meno
 * le pause, mai sotto zero. La pausa non ha una posizione: vale per la giornata, anche se è
 * registrata su un pezzo più corto della pausa stessa.
 */
export function dayNetHours(pieces: Piece[]): number {
  let minutes = 0;
  let pause = 0;
  for (const p of pieces) {
    minutes += Math.max(0, toMinutes(p.end) - toMinutes(p.start));
    pause += p.breakMinutes ?? 0;
  }
  return Math.max(0, minutes - pause) / 60;
}

/** Raggruppa i pezzi per chiave e somma le ore nette di ogni gruppo-giornata. */
function netHoursBy<T extends Piece>(shifts: T[], keyOf: (s: T) => string): Map<string, number> {
  const groups = new Map<string, T[]>();
  for (const s of shifts) {
    const k = keyOf(s);
    const list = groups.get(k);
    if (list) list.push(s);
    else groups.set(k, [s]);
  }
  return new Map([...groups].map(([k, list]) => [k, dayNetHours(list)]));
}

/** Ore nette di una persona in un giorno (somma dei pezzi di turno). */
export function personDayHours(shifts: ShiftInput[], profileId: string, date: ISODate): number {
  return dayNetHours(shifts.filter((s) => s.profileId === profileId && s.date === date));
}

/** Ore nette di una persona nella settimana (o nei soli `days`, se indicati). */
export function personWeekHours(shifts: ShiftInput[], profileId: string, days?: ISODate[]): number {
  const inDays = days ? new Set(days) : null;
  const mine = shifts.filter((s) => s.profileId === profileId && (!inDays || inDays.has(s.date)));
  return [...netHoursBy(mine, (s) => s.date).values()].reduce((sum, h) => sum + h, 0);
}

/** Ore nette per persona e per giorno: `{ [profileId]: { [date]: ore } }`. */
export function hoursByPersonDay(shifts: ShiftInput[]): Record<string, Record<ISODate, number>> {
  const out: Record<string, Record<ISODate, number>> = {};
  for (const [key, hours] of netHoursBy(shifts, (s) => `${s.profileId}|${s.date}`)) {
    const [profileId, date] = key.split("|");
    (out[profileId] ??= {})[date] = hours;
  }
  return out;
}

export type ResidualDay = {
  date: ISODate;
  /** Ore pianificate nel giorno. */
  planned: number;
  /**
   * Residuo PRIMA del giorno: contratto − ore dei giorni precedenti.
   * È il valore della riga ORARIO in testa al giorno nel foglio orario (lunedì = 40 per chi ha 40h).
   */
  before: number | null;
  /** Residuo DOPO il giorno: contratto − ore fino a quel giorno incluso (= `before` del giorno dopo). */
  after: number | null;
};

/**
 * Ore residue della settimana giorno per giorno, per UNA persona (`shiftsOfWeek` = i suoi turni).
 * La riga ORARIO del foglio orario mostra `before`: 40 → 32 → 24…; può andare sotto zero.
 * Con `weeklyHours` null (contratto non indicato) i residui sono null.
 */
export function residualHoursByDay(
  weeklyHours: number | null,
  shiftsOfWeek: ShiftInput[],
  days: ISODate[],
): ResidualDay[] {
  let used = 0;
  return days.map((date) => {
    const planned = dayNetHours(shiftsOfWeek.filter((s) => s.date === date));
    const before = weeklyHours == null ? null : round2(weeklyHours - used);
    used += planned;
    const after = weeklyHours == null ? null : round2(weeklyHours - used);
    return { date, planned, before, after };
  });
}

/** Totale delle ore di contratto (es. 280 nell'intestazione del foglio orario). */
export function totalContractHours(people: Pick<PersonInput, "weeklyHours">[]): number {
  return round2(people.reduce((sum, p) => sum + (p.weeklyHours ?? 0), 0));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Ore all'italiana: 38.5 → "38,5", 40 → "40", 7.75 → "7,75". */
export function formatHours(n: number): string {
  const rounded = round2(n);
  return String(Object.is(rounded, -0) ? 0 : rounded).replace(".", ",");
}
