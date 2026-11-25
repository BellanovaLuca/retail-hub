/**
 * Conto alla rovescia del turno di oggi nella Home (§6.1). Logica pura: con un turno spezzato
 * (es. 10–13 e 14–19) durante la pausa non è "In corso", si aspetta il pezzo successivo.
 */

/** Un pezzo del turno di oggi, orari "HH:mm". */
export type ShiftPiece = { start: string; end: string | null };

const toMinutes = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

const span = (minutes: number) =>
  minutes < 60
    ? `${minutes} min`
    : `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;

/**
 * Testo del conto alla rovescia a `nowMinutes` (minuti dalla mezzanotte, ora di Roma):
 * "In corso" dentro un pezzo, "Tra …" prima del primo, "Riprendi tra …" nella pausa tra due
 * pezzi, null quando il turno è finito.
 */
export function countdownLabel(pieces: ShiftPiece[], nowMinutes: number): string | null {
  const list = pieces
    .map((p) => ({ start: toMinutes(p.start), end: p.end ? toMinutes(p.end) : null }))
    .filter((p) => Number.isFinite(p.start))
    .sort((a, b) => a.start - b.start);
  // Un pezzo senza orario di fine si considera in corso da quando comincia.
  if (list.some((p) => p.start <= nowMinutes && (p.end === null || nowMinutes < p.end))) {
    return "In corso";
  }
  const next = list.find((p) => p.start > nowMinutes);
  if (!next) return null;
  const started = list.some((p) => p.start <= nowMinutes);
  return `${started ? "Riprendi tra" : "Tra"} ${span(next.start - nowMinutes)}`;
}

/** Giorno ("yyyy-MM-dd") e minuti dalla mezzanotte di un istante, nel fuso del negozio. */
export function romeClock(instant: Date): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}
