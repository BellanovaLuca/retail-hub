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

/** Ore nette di un turno: durata meno la pausa, mai sotto zero. */
export function shiftNetHours(shift: Pick<ShiftInput, "start" | "end" | "breakMinutes">): number {
  const minutes = toMinutes(shift.end) - toMinutes(shift.start) - (shift.breakMinutes ?? 0);
  return Math.max(0, minutes) / 60;
}

/** Ore nette di una persona in un giorno (somma dei pezzi di turno). */
export function personDayHours(shifts: ShiftInput[], profileId: string, date: ISODate): number {
  return shifts
    .filter((s) => s.profileId === profileId && s.date === date)
    .reduce((sum, s) => sum + shiftNetHours(s), 0);
}

/** Ore nette di una persona nella settimana (o nei soli `days`, se indicati). */
export function personWeekHours(shifts: ShiftInput[], profileId: string, days?: ISODate[]): number {
  const inDays = days ? new Set(days) : null;
  return shifts
    .filter((s) => s.profileId === profileId && (!inDays || inDays.has(s.date)))
    .reduce((sum, s) => sum + shiftNetHours(s), 0);
}

/** Ore nette per persona e per giorno: `{ [profileId]: { [date]: ore } }`. */
export function hoursByPersonDay(shifts: ShiftInput[]): Record<string, Record<ISODate, number>> {
  const out: Record<string, Record<ISODate, number>> = {};
  for (const s of shifts) {
    const byDay = (out[s.profileId] ??= {});
    byDay[s.date] = (byDay[s.date] ?? 0) + shiftNetHours(s);
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
    const planned = shiftsOfWeek
      .filter((s) => s.date === date)
      .reduce((sum, s) => sum + shiftNetHours(s), 0);
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
