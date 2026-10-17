/**
 * Modello della griglia persone × giorni da stampare o esportare (foglio "Turni" dell'Excel,
 * PDF A4 orizzontale per la bacheca). Puro: riceve dati già caricati.
 */
import { weekNumber } from "@/lib/dates";
import { cellText, publishedDayText } from "@/lib/schedule/cells";
import type {
  LeaveRecord,
  PublishedShift,
  SchedulePerson,
  ShiftRecord,
  TemplateRecord,
} from "@/lib/schedule/types";
import {
  dayHeader,
  formatHoursIt,
  groupPeopleByDepartment,
  groupShiftsByDay,
  isFullDayLeave,
  key,
  leaveLabelAdmin,
  weekHoursByPerson,
} from "@/lib/schedule/view";
import type { TimesheetCalendar } from "./timesheet-model";

export type GridCellTone = "shift" | "absence" | "empty" | "closed";

export type ScheduleGridModel = {
  weekNumber: number;
  title: string;
  subtitle: string;
  days: { date: string; label: string; sublabel: string; closed: boolean }[];
  /** true se la colonna "Ore" (pianificate / contratto) è presente. */
  showHours: boolean;
  groups: {
    label: string;
    rows: {
      id: string;
      name: string;
      cells: { text: string; tone: GridCellTone }[];
      hours: string | null;
    }[];
  }[];
  /** Righe di riepilogo in fondo (es. "Presenti"). */
  footer: { label: string; cells: string[] }[];
};

function dayColumns(days: string[], calendar?: TimesheetCalendar) {
  return days.map((date) => {
    const h = dayHeader(date);
    const holiday = calendar?.holidays.find((x) => x.date === date);
    return {
      date,
      label: h.label,
      sublabel: holiday ? `${h.sublabel} · ${holiday.label}` : h.sublabel,
      closed: Boolean(holiday?.storeClosed),
    };
  });
}

function weekTitle(days: string[]) {
  const n = weekNumber(new Date(`${days[0]}T12:00:00`));
  const first = dayHeader(days[0]).sublabel;
  const last = dayHeader(days[6]).sublabel;
  return { n, title: `Week ${n}`, range: `${first} – ${last} ${days[6].slice(0, 4)}` };
}

/** Griglia della versione di LAVORO (admin): testo compatto, assenze con il motivo, ore. */
export function buildAdminGridModel(input: {
  days: string[];
  shifts: ShiftRecord[];
  leaves: LeaveRecord[];
  people: SchedulePerson[];
  templates: TemplateRecord[];
  departments: { id: string; name: string }[];
  calendar?: TimesheetCalendar;
}): ScheduleGridModel {
  const { days, shifts, leaves, people, templates, departments, calendar } = input;
  const tplById = new Map(templates.map((t) => [t.id, t]));
  const byDay = groupShiftsByDay(shifts);
  const leaveByDay = new Map(leaves.map((l) => [key(l.profileId, l.date), l]));
  const hours = weekHoursByPerson(shifts);
  const columns = dayColumns(days, calendar);
  const { n, title, range } = weekTitle(days);

  const groups = groupPeopleByDepartment(people, departments).map((g) => ({
    label: g.label,
    rows: g.people.map((p) => ({
      id: p.id,
      name: p.displayName,
      cells: columns.map((col) => {
        const k = key(p.id, col.date);
        const dayShifts = byDay.get(k) ?? [];
        const text = cellText(dayShifts, tplById);
        const leave = leaveByDay.get(k);
        if (text) {
          const isAbsence = dayShifts.every(
            (s) => !s.start && s.templateId && tplById.get(s.templateId)?.isAbsence,
          );
          return { text, tone: (isAbsence ? "absence" : "shift") as GridCellTone };
        }
        if (leave && isFullDayLeave(leave))
          return { text: leaveLabelAdmin(leave), tone: "absence" as GridCellTone };
        return { text: "", tone: (col.closed ? "closed" : "empty") as GridCellTone };
      }),
      hours: `${formatHoursIt(hours.get(p.id) ?? 0)} / ${p.weeklyHours ? formatHoursIt(p.weeklyHours) : "—"}`,
    })),
  }));

  const present = (date: string) =>
    people.filter((p) => (byDay.get(key(p.id, date)) ?? []).some((s) => s.start)).length;
  const dayHours = (date: string) =>
    formatHoursIt(
      [...weekHoursByPerson(shifts.filter((s) => s.date === date)).values()].reduce(
        (a, b) => a + b,
        0,
      ),
    );

  return {
    weekNumber: n,
    title,
    subtitle: `${range} · versione di lavoro`,
    days: columns,
    showHours: true,
    groups,
    footer: [
      { label: "Presenti", cells: days.map((d) => String(present(d))) },
      { label: "Ore totali", cells: days.map(dayHours) },
    ],
  };
}

/** Assenza come la vede chiunque: "Ferie" o "Assente", mai il motivo. */
export type PublicLeave = {
  profileId: string;
  date: string;
  kind: "ferie" | "assente";
  status: "tentative" | "confirmed";
};

/** Griglia della versione PUBBLICATA (per tutti i dipendenti): niente motivi né ore di contratto. */
export function buildPublishedGridModel(input: {
  days: string[];
  shifts: PublishedShift[];
  leaves: PublicLeave[];
  people: SchedulePerson[];
  departments: { id: string; name: string }[];
  calendar?: TimesheetCalendar;
  version?: number | null;
}): ScheduleGridModel {
  const { days, shifts, leaves, people, departments, calendar } = input;
  const byDay = new Map<string, PublishedShift[]>();
  for (const s of shifts) {
    const k = key(s.profile_id, s.date);
    byDay.set(k, [...(byDay.get(k) ?? []), s]);
  }
  const leaveByDay = new Map(leaves.map((l) => [key(l.profileId, l.date), l]));
  const columns = dayColumns(days, calendar);
  const { n, title, range } = weekTitle(days);

  const groups = groupPeopleByDepartment(people, departments).map((g) => ({
    label: g.label,
    rows: g.people.map((p) => ({
      id: p.id,
      name: p.displayName,
      cells: columns.map((col) => {
        const k = key(p.id, col.date);
        const list = byDay.get(k) ?? [];
        const leave = leaveByDay.get(k);
        const absence = list.find((s) => s.is_absence);
        if (absence || (leave && !list.some((s) => s.start_time))) {
          // Il motivo non si mostra mai ai colleghi: solo Riposo, Ferie o Assente.
          const label =
            absence?.template_code === "R"
              ? "Riposo"
              : leave?.kind === "ferie" || absence?.template_code === "F"
                ? "Ferie"
                : "Assente";
          return { text: label, tone: "absence" as GridCellTone };
        }
        const text = publishedDayText(list);
        if (text) return { text, tone: "shift" as GridCellTone };
        return { text: "", tone: (col.closed ? "closed" : "empty") as GridCellTone };
      }),
      hours: null,
    })),
  }));

  const present = (date: string) =>
    people.filter((p) =>
      (byDay.get(key(p.id, date)) ?? []).some((s) => s.start_time && !s.is_absence),
    ).length;

  return {
    weekNumber: n,
    title,
    subtitle: `${range}${input.version ? ` · versione ${input.version}` : ""}`,
    days: columns,
    showHours: false,
    groups,
    footer: [{ label: "Presenti", cells: days.map((d) => String(present(d))) }],
  };
}
