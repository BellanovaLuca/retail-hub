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
 */
export function cellText(dayShifts: ShiftRecord[], templates: Map<string, TemplateRecord>): string {
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
  const segments = sorted
    .filter((s) => s.start && s.end)
    .map((s) => ({ start: s.start!, end: s.end! }));
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

/** Costruisce l'istantanea da pubblicare e segna le giornate cambiate rispetto alla precedente. */
export function buildSnapshot(
  shifts: ShiftRecord[],
  templates: Map<string, TemplateRecord>,
  people: Map<string, SchedulePerson>,
  previous: PublishedShift[],
): { snapshot: PublishedShift[]; changes: DayChange[] } {
  const snapshot: PublishedShift[] = shifts.map((s) => {
    const tpl = s.templateId ? templates.get(s.templateId) : undefined;
    const person = people.get(s.profileId);
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
      zone: resolveZone(s, person),
      is_back_office: resolveBackOffice(s, person),
      department_id: s.departmentId ?? person?.primaryDepartmentId ?? null,
      note: s.note,
      changed: false,
    };
  });

  const changes = diffSnapshots(previous, snapshot);
  const changedKeys = new Set(changes.map((c) => `${c.profileId}|${c.date}`));
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

/** Giornate (persona, data) diverse tra due istantanee, con il prima e dopo leggibile. */
export function diffSnapshots(before: PublishedShift[], after: PublishedShift[]): DayChange[] {
  const a = groupByDay(before);
  const b = groupByDay(after);
  const keys = new Set([...a.keys(), ...b.keys()]);
  const out: DayChange[] = [];
  for (const key of keys) {
    const beforeText = publishedDayText(a.get(key) ?? [], true);
    const afterText = publishedDayText(b.get(key) ?? [], true);
    const zoneBefore = (a.get(key) ?? []).map((s) => s.zone).join();
    const zoneAfter = (b.get(key) ?? []).map((s) => s.zone).join();
    if (beforeText !== afterText || zoneBefore !== zoneAfter) {
      const [profileId, date] = key.split("|");
      out.push({ profileId, date, before: beforeText || "Libero", after: afterText || "Libero" });
    }
  }
  return out.sort((x, y) => x.date.localeCompare(y.date) || x.profileId.localeCompare(y.profileId));
}
