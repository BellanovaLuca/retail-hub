export const DAY_NAMES = [
  "lunedì",
  "martedì",
  "mercoledì",
  "giovedì",
  "venerdì",
  "sabato",
  "domenica",
] as const;

/** Giorni previsti in parole: "tutti i giorni", "lun–sab", "solo mercoledì", "lun, mer, ven". */
export function scheduleLabel(days: number[]): string {
  const sorted = [...new Set(days)].sort();
  if (sorted.length === 7) return "tutti i giorni";
  if (sorted.length === 0) return "nessun giorno";
  if (sorted.length === 1) return `solo ${DAY_NAMES[sorted[0] - 1]}`;
  const contiguous = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
  const short = (d: number) => DAY_NAMES[d - 1].slice(0, 3);
  if (contiguous && sorted.length > 2) return `${short(sorted[0])}–${short(sorted.at(-1)!)}`;
  return sorted.map(short).join(", ");
}
