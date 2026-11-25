/**
 * Orario di apertura effettivo di un giorno (§7), in un posto solo: lo usano le regole, il foglio
 * orario, la riga "Copertura" del foglio turni e la griglia del negozio.
 *
 * Precedenza: eccezione del giorno (un orario diverso, oppure chiuso) > festività a negozio
 * chiuso > orario standard del giorno della settimana. Un'eccezione con orario in un festivo
 * "chiuso" è quindi un'apertura straordinaria.
 */
import { weekdayOf } from "@/lib/domain/time";
import type { Interval, ISODate } from "@/lib/domain/types";

/** Applica la precedenza; `exception` undefined = nessuna eccezione, null = chiuso quel giorno. */
export function resolveOpening<T>(opts: {
  exception: T | null | undefined;
  closedHoliday: boolean;
  standard: T | null | undefined;
}): T | null {
  if (opts.exception !== undefined) return opts.exception;
  if (opts.closedHoliday) return null;
  return opts.standard ?? null;
}

/** Calendario del negozio come lo carica `getStoreCalendar` (orari "open"/"close"). */
export type OpeningCalendar = {
  /** Chiavi "1".."7" (1 = lunedì). */
  openingHours: Record<string, { open: string; close: string } | null>;
  exceptions: Record<ISODate, { open: string; close: string } | null>;
  holidays: { date: ISODate; storeClosed: boolean }[];
};

/** Orario di apertura del giorno; null = negozio chiuso. */
export function openingFor(date: ISODate, calendar: OpeningCalendar): Interval | null {
  const hours = resolveOpening({
    exception: date in calendar.exceptions ? calendar.exceptions[date] : undefined,
    closedHoliday: isClosedHoliday(date, calendar),
    standard: calendar.openingHours[String(weekdayOf(date))],
  });
  return hours ? { start: hours.open, end: hours.close } : null;
}

function isClosedHoliday(date: ISODate, calendar: Pick<OpeningCalendar, "holidays">): boolean {
  return calendar.holidays.some((h) => h.date === date && h.storeClosed);
}

/**
 * Giorno da mostrare come "chiuso per festività": festivo a negozio chiuso senza un'eccezione che
 * lo riapra.
 */
export function isHolidayClosure(date: ISODate, calendar: OpeningCalendar): boolean {
  return isClosedHoliday(date, calendar) && openingFor(date, calendar) === null;
}
