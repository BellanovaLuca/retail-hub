/**
 * Parser delle celle del foglio turni (§8.1).
 *
 * Una cella può contenere:
 * - un codice di turno rapido (`MAN`, `R`, `F`…), senza distinzione maiuscole/minuscole;
 * - un orario (`10-14`, `10:30-20`, `10.30-20`, `10,30-20`, `1030-2000`, `10–20`, `10 - 14`);
 * - due o più fasce per lo spezzato (`10-14 16-20`, `10-14/16-20`, `10-14 · 16-20`, `10-14;16-20`).
 *
 * Regole: orari tra 00:00 e 24:00, minuti a passo di 15 (quarti d'ora: la griglia "foglio orario"
 * usa le mezz'ore, ma un turno 10:15–… è comune e non va rifiutato), fine dopo l'inizio, fasce
 * non sovrapposte. Le fasce vengono ordinate; quelle contigue (`10-14 14-20`) vengono unite.
 */
import { formatTimeCompact, fromMinutes, toMinutes } from "@/lib/domain/time";
import type { Interval } from "@/lib/domain/types";

/** Passo minimo dei minuti accettati dal parser. */
export const SHIFT_MINUTE_STEP = 15;

export type ShiftTemplateRef = {
  code: string;
  startTime: string | null;
  endTime: string | null;
  breakMinutes: number;
  isAbsence: boolean;
};

export type ParsedShiftCell =
  | { kind: "empty" }
  | { kind: "template"; code: string }
  | { kind: "times"; segments: Interval[] }
  | { kind: "error"; message: string };

/** Un orario dentro una fascia: "10", "10:30", "10.30", "10,30", "1030", "930". */
function parseClock(raw: string): number | string {
  let h: number;
  let m: number;
  let match = /^(\d{1,2})(?:[:.,](\d{2}))?$/.exec(raw);
  if (match) {
    h = Number(match[1]);
    m = match[2] ? Number(match[2]) : 0;
  } else if ((match = /^(\d{1,2})(\d{2})$/.exec(raw))) {
    h = Number(match[1]);
    m = Number(match[2]);
  } else {
    return `"${raw}" non è un orario valido`;
  }
  if (m > 59) return `"${raw}": i minuti devono essere tra 00 e 59`;
  if (h > 24 || (h === 24 && m > 0)) return `"${raw}": l'orario deve essere tra 00:00 e 24:00`;
  if (m % SHIFT_MINUTE_STEP !== 0) return `"${raw}": usa i quarti d'ora (:00, :15, :30, :45)`;
  return h * 60 + m;
}

/** Interpreta il testo di una cella del foglio turni. */
export function parseShiftCell(text: string, templates: ShiftTemplateRef[]): ParsedShiftCell {
  const trimmed = text.trim();
  if (trimmed === "") return { kind: "empty" };

  const upper = trimmed.replace(/\s+/g, " ").toUpperCase();
  const template = templates.find((t) => t.code.trim().toUpperCase() === upper);
  if (template) return { kind: "template", code: template.code };

  // Trattini lunghi → "-", spazi attorno al trattino eliminati, poi separatori tra fasce.
  const normalized = trimmed.replace(/[–—−]/g, "-").replace(/\s*-\s*/g, "-");
  const pieces = normalized.split(/[\s/;·•|+]+/).filter((p) => p !== "");
  if (pieces.length === 0) return { kind: "empty" };

  const ranges: { start: number; end: number }[] = [];
  for (const piece of pieces) {
    const parts = piece.split("-");
    if (parts.length !== 2 || parts[0] === "" || parts[1] === "") {
      if (!/\d/.test(piece))
        return { kind: "error", message: `Codice turno "${trimmed}" sconosciuto` };
      return { kind: "error", message: `"${piece}" non è una fascia valida (es. 10-14)` };
    }
    const start = parseClock(parts[0]);
    if (typeof start === "string") return { kind: "error", message: start };
    const end = parseClock(parts[1]);
    if (typeof end === "string") return { kind: "error", message: end };
    if (end <= start) {
      return {
        kind: "error",
        message: `${fromMinutes(start)}–${fromMinutes(end)}: la fine deve venire dopo l'inizio`,
      };
    }
    ranges.push({ start, end });
  }

  ranges.sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r.start < last.end) {
      return {
        kind: "error",
        message: `Le fasce ${fromMinutes(last.start)}–${fromMinutes(last.end)} e ${fromMinutes(r.start)}–${fromMinutes(r.end)} si sovrappongono`,
      };
    }
    if (last && r.start === last.end) last.end = r.end;
    else merged.push({ ...r });
  }

  return {
    kind: "times",
    segments: merged.map((r) => ({ start: fromMinutes(r.start), end: fromMinutes(r.end) })),
  };
}

/** Forma compatta per la cella: `10–20`, `10:30–20`, `10–14 · 16–20`. */
export function formatShiftCompact(segments: Interval[]): string {
  return segments
    .map((s) => `${formatTimeCompact(s.start)}–${formatTimeCompact(s.end)}`)
    .join(" · ");
}

/** Forma estesa: `10:00–14:00 · 16:00–20:00`. */
export function formatShiftLong(segments: Interval[]): string {
  return segments
    .map((s) => `${fromMinutes(toMinutes(s.start))}–${fromMinutes(toMinutes(s.end))}`)
    .join(" · ");
}
