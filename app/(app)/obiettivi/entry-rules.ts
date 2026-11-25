/**
 * Quali numeri giornalieri può salvare un dipendente (§8.3): solo sulle voci del proprio foglio
 * oppure su quelle per cui ha un obiettivo nella settimana di quel giorno. Logica pura.
 */

/** Lunedì (yyyy-MM-dd) della settimana che contiene la data, senza dipendere dal fuso. */
export function mondayOfDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d));
  const back = (day.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(y, m - 1, d - back)).toISOString().slice(0, 10);
}

/** Settimane (lunedì) toccate da un gruppo di date, senza ripetizioni. */
export function weeksOfDates(dates: string[]): string[] {
  return [...new Set(dates.map(mondayOfDate))].sort();
}

/**
 * Numeri che NON si possono salvare: voce fuori dal foglio della persona e senza un suo obiettivo
 * nella settimana del giorno indicato.
 */
export function entriesOutsideSheet<T extends { kpiId: string; date: string }>(
  entries: T[],
  allowed: {
    /** Voci del foglio della persona (proprie o del gruppo della sua area). */
    sheetKpiIds: Iterable<string>;
    /** Obiettivi assegnati alla persona nelle settimane interessate. */
    targets: { kpiId: string; weekStart: string }[];
  },
): T[] {
  const sheet = new Set(allowed.sheetKpiIds);
  const withTarget = new Set(allowed.targets.map((t) => `${t.kpiId}|${t.weekStart}`));
  return entries.filter(
    (e) => !sheet.has(e.kpiId) && !withTarget.has(`${e.kpiId}|${mondayOfDate(e.date)}`),
  );
}
