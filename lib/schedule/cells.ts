import { formatShiftCompact, formatShiftLong } from "@/lib/shifts/parse";
import type { PublishedShift, SchedulePerson, ShiftRecord, TemplateRecord } from "./types";

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);

/** Ordina i pezzi di una giornata (turni spezzati) per orario d'inizio. */
export function sortShifts<T extends { start?: string | null; start_time?: string | null }>(
  list: T[],
) {
  return [...list].sort((a, b) =>
    (a.start ?? a.start_time ?? "").localeCompare(b.start ?? b.start_time ?? ""),
  );
}

/**
 * Testo della cella persona × giorno, quello che si edita e si copia nel foglio:
 * il codice del turno rapido se la giornata è esattamente quel turno, altrimenti gli orari.
 * Con `backOfficeOf` (back office risolto del pezzo) una giornata mista «back office + vendita»
 * porta il marcatore `BO` sui pezzi in back office: così copia/incolla e annulla la riportano
 * con gli stessi pezzi, invece di unirli in un turno solo.
 */
export function cellText(
  dayShifts: ShiftRecord[],
  templates: Map<string, TemplateRecord>,
  backOfficeOf?: (shift: ShiftRecord) => boolean,
): string {
  if (dayShifts.length === 0) return "";
  const sorted = sortShifts(dayShifts);
  if (sorted.length === 1 && sorted[0].templateId) {
    const tpl = templates.get(sorted[0].templateId);
    if (
      tpl &&
      (tpl.isAbsence || (tpl.startTime === sorted[0].start && tpl.endTime === sorted[0].end))
    ) {
      return tpl.code;
    }
  }
  const timed = sorted.filter((s) => s.start && s.end);
  const flags = timed.map((s) => (backOfficeOf ? backOfficeOf(s) : false));
  const mixed = flags.includes(true) && flags.includes(false);
  const segments = timed.map((s, i) => ({
    start: s.start!,
    end: s.end!,
    ...(mixed ? { isBackOffice: flags[i] } : {}),
  }));
  return segments.length ? formatShiftCompact(segments) : "";
}

/** Testo di una giornata dell'istantanea pubblicata (per prima/dopo e viste dei dipendenti). */
export function publishedDayText(dayShifts: PublishedShift[], long = false): string {
  if (dayShifts.length === 0) return "";
  const sorted = sortShifts(dayShifts);
  const absence = sorted.find((s) => s.is_absence);
  if (absence) return absence.template_label ?? absence.template_code ?? "Assenza";
  const segments = sorted
    .filter((s) => s.start_time && s.end_time)
    .map((s) => ({ start: hhmm(s.start_time)!, end: hhmm(s.end_time)! }));
  if (segments.length === 0) return "";
  return long ? formatShiftLong(segments) : formatShiftCompact(segments);
}

/** Back office risolto: valore del turno, altrimenti il predefinito del profilo. */
export function resolveBackOffice(
  shift: Pick<ShiftRecord, "isBackOffice">,
  person?: SchedulePerson,
) {
  return shift.isBackOffice ?? (person ? !person.countsForCoverage : false);
}

/** Area del turno: per i fissi è l'area di base; per i jolly quella scelta sul turno. */
export function resolveZone(shift: Pick<ShiftRecord, "zone">, person?: SchedulePerson) {
  if (shift.zone) return shift.zone;
  if (person && person.homeZone !== "jolly") return person.homeZone;
  return null;
}

/**
 * Costruisce l'istantanea da pubblicare e segna le giornate cambiate rispetto alla precedente.
 * Il badge "Modificato" resta anche sulle giornate già segnate nella versione precedente e
 * rimaste uguali: una ripubblicazione senza modifiche (o parziale) non lo azzera.
 */
export function buildSnapshot(
  shifts: ShiftRecord[],
  templates: Map<string, TemplateRecord>,
  people: Map<string, SchedulePerson>,
  previous: PublishedShift[],
): { snapshot: PublishedShift[]; changes: DayChange[] } {
  const previousById = new Map(previous.map((s) => [s.id, s]));
  const previousByDay = groupByDay(previous);
  const snapshot: PublishedShift[] = shifts.map((s) => {
    const tpl = s.templateId ? templates.get(s.templateId) : undefined;
    const person = people.get(s.profileId);
    // Persona non più in elenco (disattivata): i suoi predefiniti (area di base, back office,
    // reparto principale) non si possono più risolvere. Si tengono quelli già pubblicati, così
    // la ripubblicazione non produce modifiche fantasma né cambia le coperture pubblicate.
    const kept = person
      ? undefined
      : (previousById.get(s.id) ?? previousByDay.get(`${s.profileId}|${s.date}`)?.[0]);
    return {
      id: s.id,
      profile_id: s.profileId,
      date: s.date,
      start_time: s.start,
      end_time: s.end,
      break_minutes: s.breakMinutes,
      template_code: tpl?.code ?? null,
      template_label: tpl?.label ?? null,
      is_absence: tpl?.isAbsence ?? false,
      zone: s.zone ?? kept?.zone ?? resolveZone(s, person),
      is_back_office: s.isBackOffice ?? kept?.is_back_office ?? resolveBackOffice(s, person),
      department_id: s.departmentId ?? kept?.department_id ?? person?.primaryDepartmentId ?? null,
      note: s.note,
      changed: false,
    };
  });

  const changes = diffSnapshots(previous, snapshot);
  const changedKeys = new Set(changes.map((c) => `${c.profileId}|${c.date}`));
  for (const s of previous) if (s.changed) changedKeys.add(`${s.profile_id}|${s.date}`);
  for (const s of snapshot) s.changed = changedKeys.has(`${s.profile_id}|${s.date}`);
  return { snapshot, changes };
}

export type DayChange = { profileId: string; date: string; before: string; after: string };

function groupByDay(list: PublishedShift[]) {
  const map = new Map<string, PublishedShift[]>();
  for (const s of list) {
    const key = `${s.profile_id}|${s.date}`;
    map.set(key, [...(map.get(key) ?? []), s]);
  }
  return map;
}

const ZONE_LABEL = { vista: "Vista", sole: "Sole" } as const;

/**
 * Confronto di una giornata pubblicata: testo (orari o assenza) e dettagli che non si vedono
 * negli orari (area, pausa, back office). I pezzi si ordinano per orario: l'ordine in cui
 * arrivano dal database non conta.
 */
function daySignature(list: PublishedShift[]) {
  const sorted = sortShifts(list);
  const text = publishedDayText(sorted, true);
  const timed = sorted.filter((s) => s.start_time && s.end_time);
  if (timed.length === 0 || sorted.some((s) => s.is_absence))
    return { text, key: text, details: "" };
  const pause = timed.reduce((sum, s) => sum + (s.break_minutes ?? 0), 0);
  const zones = [...new Set(timed.map((s) => s.zone).filter((z) => z !== null))];
  const inBackOffice = timed.filter((s) => s.is_back_office).length;
  const details = [
    ...zones.map((z) => ZONE_LABEL[z]),
    ...(pause > 0 ? [`pausa ${pause}′`] : []),
    ...(inBackOffice === 0
      ? []
      : [inBackOffice === timed.length ? "back office" : "in parte back office"]),
  ].join(", ");
  const key = JSON.stringify([
    timed.map((s) => [hhmm(s.start_time), hhmm(s.end_time), s.zone, s.is_back_office]),
    pause,
  ]);
  return { text, key, details };
}

/**
 * Giornate (persona, data) diverse tra due istantanee, con il prima e dopo leggibile. Contano
 * orari, assenze, area, pausa (totale della giornata) e back office; se gli orari sono gli stessi
 * il prima e dopo riportano tra parentesi il dettaglio cambiato ("10:00–20:00 (pausa 60′)").
 */
export function diffSnapshots(before: PublishedShift[], after: PublishedShift[]): DayChange[] {
  const a = groupByDay(before);
  const b = groupByDay(after);
  const keys = new Set([...a.keys(), ...b.keys()]);
  const out: DayChange[] = [];
  for (const key of keys) {
    const was = daySignature(a.get(key) ?? []);
    const is = daySignature(b.get(key) ?? []);
    if (was.key === is.key) continue;
    const [profileId, date] = key.split("|");
    const sameText = was.text === is.text;
    const label = (d: { text: string; details: string }) =>
      d.text ? (sameText && d.details ? `${d.text} (${d.details})` : d.text) : "Libero";
    out.push({ profileId, date, before: label(was), after: label(is) });
  }
  return out.sort((x, y) => x.date.localeCompare(y.date) || x.profileId.localeCompare(y.profileId));
}

/**
 * Destinatari dell'avviso "orari pubblicati/aggiornati" a tutti: chi ha turni nell'istantanea e
 * chi li aveva ma è stato tolto dalla settimana (compare solo tra le giornate cambiate, §10).
 */
export function publishRecipients(
  snapshot: Pick<PublishedShift, "profile_id">[],
  changes: Pick<DayChange, "profileId">[],
): string[] {
  return [...new Set([...snapshot.map((s) => s.profile_id), ...changes.map((c) => c.profileId)])];
}
