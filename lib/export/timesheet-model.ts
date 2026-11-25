/**
 * Modello del "foglio orario" (§8.1, modalità Week 39/40), condiviso dall'interfaccia
 * (`components/schedule/timesheet.tsx`) e dagli export Excel/PDF. Tutto puro: riceve dati già caricati.
 */
import { computeCoverage, coverageByHour, dailyTotals, type CoverageSlot } from "@/lib/coverage";
import { weekNumber } from "@/lib/dates";
import { toMinutes, weekdayOf } from "@/lib/domain/time";
import type { DepartmentRef, Interval, PersonInput, ShiftInput, Zone } from "@/lib/domain/types";
import { residualHoursByDay, totalContractHours } from "@/lib/hours";
import { resolveBackOffice, resolveZone } from "@/lib/schedule/cells";
import type { LeaveRecord, SchedulePerson, ShiftRecord } from "@/lib/schedule/types";
import { isHolidayClosure, openingFor } from "@/lib/schedule/opening";
import { isFullDayLeave, leaveLabelAdmin } from "@/lib/schedule/view";
import {
  hourCellValue,
  markedSlotsToSegments,
  repaintedSegments,
  segmentsToMarkedSlots,
  SLOT_COUNT,
  SLOT_FIRST_HOUR,
  SLOT_LAST_HOUR,
  slotTime,
  type MarkedSegment,
  type SlotMark,
} from "@/lib/shifts/slots";

/** Calendario del negozio (stessa forma di `StoreCalendar` in lib/data/schedule, senza "server-only"). */
export type TimesheetCalendar = {
  openingHours: Record<string, { open: string; close: string } | null>;
  exceptions: Record<string, { open: string; close: string } | null>;
  holidays: { date: string; label: string; storeClosed: boolean }[];
};

export type ZoneGroupId = "vista" | "sole" | "jolly";

export const ZONE_GROUP_LABEL: Record<ZoneGroupId, string> = {
  vista: "Vista",
  sole: "Sole",
  jolly: "Jolly",
};

/** Ore del foglio: 7…21 (la riga "21" copre 21:00–22:00). */
export const TIMESHEET_HOURS = Array.from(
  { length: SLOT_LAST_HOUR - SLOT_FIRST_HOUR },
  (_, i) => SLOT_FIRST_HOUR + i,
);

/** Colonne persone raggruppate per area di base: Vista, poi Sole, poi Jolly (ordine dell'array). */
export function timesheetGroups<P extends Pick<SchedulePerson, "homeZone">>(
  people: P[],
): { zone: ZoneGroupId; label: string; people: P[] }[] {
  return (["vista", "sole", "jolly"] as const)
    .map((zone) => ({
      zone,
      label: ZONE_GROUP_LABEL[zone],
      people: people.filter((p) => p.homeZone === zone),
    }))
    .filter((g) => g.people.length > 0);
}

export function toPersonInput(p: SchedulePerson): PersonInput {
  return {
    id: p.id,
    displayName: p.displayName,
    weeklyHours: p.weeklyHours,
    homeZone: p.homeZone,
    departmentIds: p.departmentIds,
    primaryDepartmentId: p.primaryDepartmentId,
  };
}

/** Turni con orario → input del dominio (back office e area risolti). I turni-assenza sono scartati. */
export function toShiftInputs(
  shifts: ShiftRecord[],
  peopleById: Map<string, SchedulePerson>,
): ShiftInput[] {
  const out: ShiftInput[] = [];
  for (const s of shifts) {
    if (!s.start || !s.end) continue;
    const person = peopleById.get(s.profileId);
    out.push({
      id: s.id,
      profileId: s.profileId,
      date: s.date,
      start: s.start,
      end: s.end,
      breakMinutes: s.breakMinutes,
      zone: resolveZone(s, person),
      backOffice: resolveBackOffice(s, person),
      departmentId: s.departmentId,
    });
  }
  return out;
}

/** Mezze celle segnate di una giornata a partire dai suoi turni. */
export function marksFromShifts(dayShifts: ShiftInput[]): SlotMark[] {
  return segmentsToMarkedSlots(
    dayShifts.map((s) => ({ start: s.start, end: s.end, backOffice: s.backOffice })),
  );
}

/**
 * Giornata ridipinta → turni del dominio (per indicatori e ore, prima che il server risponda).
 * Con `original` (i turni com'erano, back office risolto) si applicano solo le mezze celle
 * cambiate: gli estremi non toccati restano quelli veri (quarti d'ora, ore fuori 07–22).
 */
export function shiftsFromMarks(
  marks: SlotMark[],
  base: {
    profileId: string;
    date: string;
    zone: Zone | null;
    departmentId: string | null;
    breakMinutes: number;
  },
  original?: MarkedSegment[],
): ShiftInput[] {
  const segments = original ? repaintedSegments(original, marks) : markedSlotsToSegments(marks);
  return segments.map((seg, i) => ({
    profileId: base.profileId,
    date: base.date,
    start: seg.start,
    end: seg.end,
    breakMinutes: i === 0 ? repaintBreak(base.breakMinutes, original, segments.length) : 0,
    zone: base.zone,
    backOffice: seg.backOffice,
    departmentId: base.departmentId,
  }));
}

/**
 * Pausa di una giornata ridipinta: resta quella di prima se il numero di pezzi non cambia (si
 * sono solo spostati gli estremi); se i pezzi cambiano, i vuoti dipinti sono già la pausa.
 */
export function repaintBreak(
  breakMinutes: number,
  original: MarkedSegment[] | undefined,
  pieces: number,
): number {
  return pieces === (original ? Math.max(1, original.length) : 1) ? breakMinutes : 0;
}

export function emptyMarks(): SlotMark[] {
  return Array<SlotMark>(SLOT_COUNT).fill(null);
}

/** Tipo di riempimento della colonna per un'assenza (§8.1). */
export type LeaveFill = "ferie" | "request" | "pending" | "other";

export function leaveFill(leave: Pick<LeaveRecord, "type" | "source">): LeaveFill {
  if (leave.type === "ferie") return "ferie";
  if (leave.source === "request") return "request";
  return "other";
}

/** Orario di apertura del giorno (eccezione > festivo chiuso > standard); null = negozio chiuso. */
export { openingFor };

/** true se la mezza cella `slot` cade fuori dall'orario di apertura. */
export function isSlotOutsideOpening(slot: number, opening: Interval | null): boolean {
  if (!opening) return true;
  const start = toMinutes(slotTime(slot));
  return start < toMinutes(opening.start) || start + 30 > toMinutes(opening.end);
}

// ---------------------------------------------------------------------------------------------
// Modello completo della settimana, usato dagli export.
// ---------------------------------------------------------------------------------------------

export type TimesheetHourCell = { value: 0 | 0.5 | 1; marks: [SlotMark, SlotMark] };

export type TimesheetDay = {
  date: string;
  /** "lun 19/10". */
  label: string;
  weekday: string;
  closed: boolean;
  holidayLabel: string | null;
  opening: Interval | null;
  /** Riga ORARIO: residuo prima del giorno, per colonna (null = contratto non indicato). */
  residual: (number | null)[];
  /** [ora][colonna]. */
  cells: TimesheetHourCell[][];
  /** Assenza a giornata intera per colonna. */
  leaves: ({ fill: LeaveFill; label: string } | null)[];
  /** Riga TOT: ore nette del giorno per colonna, più il totale del negozio. */
  tot: number[];
  total: number;
  /** Indicatori per ora (minimo delle due mezz'ore). */
  indicators: CoverageSlot[];
};

export type TimesheetModel = {
  weekNumber: number;
  contractTotal: number;
  columns: { id: string; shortLabel: string; displayName: string; zone: ZoneGroupId }[];
  groups: { zone: ZoneGroupId; label: string; span: number }[];
  /** Ore di contratto per colonna. */
  contract: (number | null)[];
  days: TimesheetDay[];
};

const WEEKDAYS = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"];

export function buildTimesheetModel(input: {
  days: string[];
  shifts: ShiftRecord[];
  leaves: LeaveRecord[];
  people: SchedulePerson[];
  departments: DepartmentRef[];
  calendar: TimesheetCalendar;
}): TimesheetModel {
  const { days, shifts, leaves, people, departments, calendar } = input;
  const groups = timesheetGroups(people);
  const ordered = groups.flatMap((g) => g.people);
  const peopleById = new Map(people.map((p) => [p.id, p]));
  const inputs = toShiftInputs(shifts, peopleById);
  const personInputs = people.map(toPersonInput);
  const leaveByKey = new Map(
    leaves.filter(isFullDayLeave).map((l) => [`${l.profileId}|${l.date}`, l]),
  );

  const residuals = new Map(
    ordered.map((p) => [
      p.id,
      residualHoursByDay(
        p.weeklyHours,
        inputs.filter((s) => s.profileId === p.id),
        days,
      ),
    ]),
  );

  const dayModels: TimesheetDay[] = days.map((date, dayIndex) => {
    const dayInputs = inputs.filter((s) => s.date === date);
    const marksBy = new Map(
      ordered.map((p) => [p.id, marksFromShifts(dayInputs.filter((s) => s.profileId === p.id))]),
    );
    const totals = dailyTotals(date, dayInputs);
    const holiday = calendar.holidays.find((h) => h.date === date) ?? null;
    const [, m, d] = date.split("-");
    return {
      date,
      label: `${WEEKDAYS[weekdayOf(date) - 1]} ${d}/${m}`,
      weekday: WEEKDAYS[weekdayOf(date) - 1],
      closed: isHolidayClosure(date, calendar),
      holidayLabel: holiday?.label ?? null,
      opening: openingFor(date, calendar),
      residual: ordered.map((p) => residuals.get(p.id)?.[dayIndex]?.before ?? null),
      cells: TIMESHEET_HOURS.map((hour) =>
        ordered.map((p) => {
          const marks = marksBy.get(p.id)!;
          const first = (hour - SLOT_FIRST_HOUR) * 2;
          return {
            value: hourCellValue(marks, hour),
            marks: [marks[first], marks[first + 1]] as [SlotMark, SlotMark],
          };
        }),
      ),
      leaves: ordered.map((p) => {
        const leave = leaveByKey.get(`${p.id}|${date}`);
        return leave ? { fill: leaveFill(leave), label: leaveLabelAdmin(leave) } : null;
      }),
      tot: ordered.map((p) => totals.byPerson[p.id] ?? 0),
      total: totals.total,
      indicators: coverageByHour(
        computeCoverage({ date, shifts: dayInputs, people: personInputs, departments }),
      ),
    };
  });

  return {
    weekNumber: weekNumber(new Date(`${days[0]}T12:00:00`)),
    contractTotal: totalContractHours(people),
    columns: ordered.map((p) => ({
      id: p.id,
      shortLabel: p.shortLabel,
      displayName: p.displayName,
      zone: p.homeZone,
    })),
    groups: groups.map((g) => ({ zone: g.zone, label: g.label, span: g.people.length })),
    contract: ordered.map((p) => p.weeklyHours),
    days: dayModels,
  };
}
