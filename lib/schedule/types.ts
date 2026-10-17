import type { ISODate, Time } from "@/lib/domain/types";

/** Turno come lo usa l'interfaccia (serializzabile, orari "HH:mm"). */
export type ShiftRecord = {
  id: string;
  profileId: string;
  date: ISODate;
  templateId: string | null;
  start: Time | null;
  end: Time | null;
  breakMinutes: number;
  departmentId: string | null;
  zone: "vista" | "sole" | null;
  /** null = valore predefinito del profilo (counts_for_coverage). */
  isBackOffice: boolean | null;
  note: string | null;
  conflict: boolean;
};

export type TemplateRecord = {
  id: string;
  code: string;
  label: string;
  startTime: Time | null;
  endTime: Time | null;
  breakMinutes: number;
  isAbsence: boolean;
};

export type SchedulePerson = {
  id: string;
  displayName: string;
  shortLabel: string;
  color: string | null;
  homeZone: "vista" | "sole" | "jolly";
  weeklyHours: number | null;
  countsForCoverage: boolean;
  primaryDepartmentId: string | null;
  departmentIds: string[];
};

export type LeaveRecord = {
  profileId: string;
  date: ISODate;
  type: "ferie" | "permesso" | "malattia" | "altro";
  hours: number | null;
  status: "tentative" | "confirmed";
  source: "planning" | "request";
};

/** Voce dell'istantanea pubblicata (schedule_weeks.published_shifts). */
export type PublishedShift = {
  id: string;
  profile_id: string;
  date: ISODate;
  start_time: Time | null;
  end_time: Time | null;
  break_minutes: number;
  template_code: string | null;
  template_label: string | null;
  is_absence: boolean;
  zone: "vista" | "sole" | null;
  is_back_office: boolean;
  department_id: string | null;
  note: string | null;
  changed: boolean;
};
