import type { PersonInput, ShiftInput } from "@/lib/domain/types";
import { resolveBackOffice, resolveZone } from "./cells";
import type { PublishedShift, SchedulePerson, ShiftRecord } from "./types";

/** Turno di lavoro (admin) → input della logica di copertura e regole. Esclude le assenze. */
export function shiftRecordsToInputs(
  shifts: ShiftRecord[],
  people: Map<string, SchedulePerson>,
): ShiftInput[] {
  return shifts
    .filter((s) => s.start && s.end)
    .map((s) => {
      const person = people.get(s.profileId);
      return {
        id: s.id,
        profileId: s.profileId,
        date: s.date,
        start: s.start!,
        end: s.end!,
        breakMinutes: s.breakMinutes,
        zone: resolveZone(s, person),
        backOffice: resolveBackOffice(s, person),
        departmentId: s.departmentId,
      };
    });
}

/** Turno pubblicato → input della logica di copertura. */
export function publishedToInputs(shifts: PublishedShift[]): ShiftInput[] {
  return shifts
    .filter((s) => !s.is_absence && s.start_time && s.end_time)
    .map((s) => ({
      id: s.id,
      profileId: s.profile_id,
      date: s.date,
      start: s.start_time!,
      end: s.end_time!,
      breakMinutes: s.break_minutes,
      zone: s.zone,
      backOffice: s.is_back_office,
      departmentId: s.department_id,
    }));
}

export function peopleToInputs(people: SchedulePerson[]): PersonInput[] {
  return people.map((p) => ({
    id: p.id,
    displayName: p.displayName,
    weeklyHours: p.weeklyHours,
    homeZone: p.homeZone,
    departmentIds: p.departmentIds,
    primaryDepartmentId: p.primaryDepartmentId,
  }));
}
