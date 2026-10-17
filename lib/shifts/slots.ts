/**
 * Modalità "foglio orario" (§8.1): ogni ora dalle 07:00 alle 22:00 è divisa in due mezze celle
 * da 30 minuti (30 slot). Qui la conversione tra fasce orarie e mezze celle "dipinte".
 */
import { fromMinutes, toMinutes } from "@/lib/domain/time";
import type { Interval } from "@/lib/domain/types";

export const SLOT_MINUTES = 30;
export const SLOT_FIRST_HOUR = 7;
export const SLOT_LAST_HOUR = 22;
const FIRST = SLOT_FIRST_HOUR * 60;
export const SLOT_COUNT = ((SLOT_LAST_HOUR - SLOT_FIRST_HOUR) * 60) / SLOT_MINUTES; // 30

/** Segno di una mezza cella: vendita, back office (righe diagonali) o vuota. */
export type SlotMark = "sale" | "bo" | null;

/** Fascia con il flag back office, come una riga di `shifts`. */
export type MarkedSegment = Interval & { backOffice: boolean };

/**
 * Indice della mezza cella che contiene `time` (07:00 → 0, 07:30 → 1, 21:30 → 29).
 * Fuori dalla griglia restituisce valori < 0 o ≥ SLOT_COUNT: il chiamante decide se scartarli.
 */
export function slotIndex(time: string): number {
  return Math.floor((toMinutes(time) - FIRST) / SLOT_MINUTES);
}

/** Orario di inizio della mezza cella `i` (0 → "07:00", 30 → "22:00"). */
export function slotTime(i: number): string {
  return fromMinutes(FIRST + i * SLOT_MINUTES);
}

/** Indici delle mezze celle toccate da una fascia (anche solo in parte), limitati alla griglia. */
function slotsOf(segment: Interval): number[] {
  const start = toMinutes(segment.start);
  const end = toMinutes(segment.end);
  const out: number[] = [];
  for (let i = 0; i < SLOT_COUNT; i++) {
    const s = FIRST + i * SLOT_MINUTES;
    if (s < end && s + SLOT_MINUTES > start) out.push(i);
  }
  return out;
}

/**
 * Fasce → mezze celle dipinte. Una mezza cella è dipinta se una fascia la tocca anche solo in parte
 * (un turno 10:15–… dipinge la mezza cella 10:00–10:30); ciò che sta fuori 07–22 è tagliato.
 */
export function segmentsToSlots(segments: Interval[]): boolean[] {
  const slots = Array<boolean>(SLOT_COUNT).fill(false);
  for (const seg of segments) for (const i of slotsOf(seg)) slots[i] = true;
  return slots;
}

/** Mezze celle dipinte → fasce: le celle consecutive si uniscono, i vuoti in mezzo diventano pausa/spezzato. */
export function slotsToSegments(slots: boolean[]): Interval[] {
  return markedSlotsToSegments(slots.map((on) => (on ? "sale" : null))).map(({ start, end }) => ({
    start,
    end,
  }));
}

/** Fasce con flag back office → mezze celle segnate ("bo" vince su "sale" se si sovrappongono). */
export function segmentsToMarkedSlots(segments: MarkedSegment[]): SlotMark[] {
  const marks = Array<SlotMark>(SLOT_COUNT).fill(null);
  for (const seg of segments) {
    for (const i of slotsOf(seg)) {
      if (seg.backOffice) marks[i] = "bo";
      else if (marks[i] === null) marks[i] = "sale";
    }
  }
  return marks;
}

/**
 * Mezze celle segnate → fasce: celle consecutive dello stesso tipo formano una fascia;
 * il passaggio da back office a vendita (es. 08:30–10:00 bo, 10:00–17:30 vendita) spezza il turno.
 */
export function markedSlotsToSegments(marks: SlotMark[]): MarkedSegment[] {
  const out: MarkedSegment[] = [];
  let i = 0;
  while (i < marks.length) {
    const mark = marks[i];
    if (mark === null) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < marks.length && marks[j + 1] === mark) j++;
    out.push({ start: slotTime(i), end: slotTime(j + 1), backOffice: mark === "bo" });
    i = j + 1;
  }
  return out;
}

/** Valore della cella ORA (`hour` = 7…21): 1 se entrambe le mezze celle sono dipinte, 0,5 se una, 0 se nessuna. */
export function hourCellValue(slots: ReadonlyArray<boolean | SlotMark>, hour: number): 0 | 0.5 | 1 {
  const first = (hour - SLOT_FIRST_HOUR) * 2;
  const count = [slots[first], slots[first + 1]].filter((v) => !!v).length;
  return count === 2 ? 1 : count === 1 ? 0.5 : 0;
}
