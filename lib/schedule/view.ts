import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { shiftNetHours } from "@/lib/hours";
import type { LeaveRecord, SchedulePerson, ShiftRecord, TemplateRecord } from "./types";

export const key = (profileId: string, date: string) => `${profileId}|${date}`;

export function dayHeader(date: string) {
  const d = parseISO(date);
  const label = format(d, "EEE", { locale: it });
  return {
    label: label.charAt(0).toUpperCase() + label.slice(1),
    sublabel: format(d, "d MMM", { locale: it }),
  };
}

export function isWeekend(date: string) {
  const day = parseISO(date).getDay();
  return day === 0 || day === 6;
}

/** Etichetta dell'assenza per l'admin (con il motivo). Per i colleghi usare "Ferie"/"Assente". */
export function leaveLabelAdmin(l: Pick<LeaveRecord, "type" | "hours" | "status">) {
  const base =
    l.type === "ferie"
      ? "Ferie"
      : l.type === "permesso"
        ? "Permesso"
        : l.type === "malattia"
          ? "Malattia"
          : "Assente";
  const hours = l.hours ? ` ${String(l.hours).replace(".", ",")}h` : "";
  return `${base}${hours}${l.status === "tentative" ? "?" : ""}`;
}

/** Un permesso di poche ore non blocca la giornata: le assenze a giornata intera sì. */
export function isFullDayLeave(l: Pick<LeaveRecord, "hours">) {
  return !l.hours;
}

export function groupShiftsByDay(shifts: ShiftRecord[]) {
  const map = new Map<string, ShiftRecord[]>();
  for (const s of shifts) {
    const k = key(s.profileId, s.date);
    map.set(k, [...(map.get(k) ?? []), s]);
  }
  return map;
}

export function weekHoursByPerson(shifts: ShiftRecord[]) {
  const out = new Map<string, number>();
  for (const s of shifts) {
    if (!s.start || !s.end) continue;
    out.set(
      s.profileId,
      (out.get(s.profileId) ?? 0) +
        shiftNetHours({ start: s.start, end: s.end, breakMinutes: s.breakMinutes }),
    );
  }
  return out;
}

export function formatHoursIt(n: number) {
  return (Math.round(n * 2) / 2).toLocaleString("it-IT", { maximumFractionDigits: 1 });
}

/** Righe raggruppate per reparto principale, nell'ordine dei reparti e poi manuale. */
export function groupPeopleByDepartment(
  people: SchedulePerson[],
  departments: { id: string; name: string }[],
) {
  const known = new Set(departments.map((d) => d.id));
  const groups = departments
    .map((d) => ({
      id: d.id,
      label: d.name,
      people: people.filter((p) => p.primaryDepartmentId === d.id),
    }))
    .filter((g) => g.people.length > 0);
  const orphans = people.filter((p) => !p.primaryDepartmentId || !known.has(p.primaryDepartmentId));
  if (orphans.length) groups.push({ id: "senza-reparto", label: "Senza reparto", people: orphans });
  return groups;
}

/** Tipo di assenza di un turno rapido, dal codice (F, PE, MA) o dall'etichetta. */
export function absenceTypeOf(tpl: Pick<TemplateRecord, "code" | "label">): LeaveRecord["type"] {
  const code = tpl.code.toUpperCase();
  const label = tpl.label.toLowerCase();
  if (code === "F" || label.startsWith("ferie")) return "ferie";
  if (code === "PE" || label.startsWith("permess")) return "permesso";
  if (code === "MA" || label.startsWith("malatti")) return "malattia";
  return "altro";
}

/**
 * Assenze del foglio orario: quelle del planning più i turni rapidi di assenza scritti nella
 * griglia (es. "F" su una persona), così anche il foglio orario e il PDF mostrano il riempimento.
 * Le assenze del planning hanno la precedenza.
 */
export function withAbsenceShifts(
  leaves: LeaveRecord[],
  shifts: ShiftRecord[],
  templates: Map<string, TemplateRecord>,
): LeaveRecord[] {
  const taken = new Set(leaves.map((l) => key(l.profileId, l.date)));
  const extra: LeaveRecord[] = [];
  for (const s of shifts) {
    const tpl = s.templateId ? templates.get(s.templateId) : undefined;
    if (!tpl?.isAbsence || s.start) continue;
    const k = key(s.profileId, s.date);
    if (taken.has(k)) continue;
    taken.add(k);
    extra.push({
      profileId: s.profileId,
      date: s.date,
      type: absenceTypeOf(tpl),
      hours: null,
      status: "confirmed",
      source: "planning",
      fromShift: true,
    });
  }
  return [...leaves, ...extra];
}
