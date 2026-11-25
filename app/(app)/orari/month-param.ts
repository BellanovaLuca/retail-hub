/**
 * Parametro `mese` di /orari ("yyyy-MM"): restituisce il primo giorno del mese ("yyyy-MM-01")
 * oppure null se il valore manca o non è un mese vero (mese 13, anno fuori intervallo…): la
 * pagina ripiega sul mese corrente invece di andare in errore.
 */
export function parseMonthParam(value: string | undefined | null): string | null {
  const m = /^(\d{4})-(\d{2})$/.exec(value ?? "");
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (year < 2000 || year > 2100 || month < 1 || month > 12) return null;
  return `${m[1]}-${m[2]}-01`;
}
